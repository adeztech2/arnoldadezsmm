import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { execute, findProfileById, getSettings, parseJson, query, walletApply, type Service } from '@/db';
import { requireManusAuth } from '@/integrations/manus/auth';

const orderInput = z.object({
  serviceId: z.string().uuid(),
  idempotencyKey: z.string().regex(/^[a-z0-9_.-]{16,100}$/i),
  link: z.string().max(2000).optional(),
  quantity: z.number().int().positive().optional(),
  fields: z.record(z.string().max(20000)).optional(),
});

function normalizeService(row: Service) {
  return { ...row, requirements: parseJson<string[]>(row.requirements), provider_rate: Number(row.provider_rate), selling_rate: row.selling_rate == null ? null : Number(row.selling_rate), enabled: Boolean(row.enabled), available: Boolean(row.available), supported: Boolean(row.supported), refill: Boolean(row.refill), cancel: Boolean(row.cancel) };
}

export const placeOrder = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: z.infer<typeof orderInput>) => orderInput.parse(i))
  .handler(async ({ data, context }) => {
    const { shaker, ProviderError } = await import('./providers.server');
    const { orderPrice } = await import('@/lib/pricing');
    const userId = context.userId;

    const duplicate = await query<any[]>('SELECT * FROM orders WHERE user_id = ? AND idempotency_key = ? LIMIT 1', [userId, data.idempotencyKey]);
    if (duplicate[0]) return duplicate[0];

    const [cfg, services, profileRows] = await Promise.all([
      getSettings(),
      query<(Service & any)[]>('SELECT * FROM services WHERE id = ? LIMIT 1', [data.serviceId]),
      query<any[]>('SELECT disabled FROM profiles WHERE id = ? LIMIT 1', [userId]),
    ]);
    const s = services[0] ? normalizeService(services[0]) : null;
    const prof = profileRows[0];
    if (!cfg || !s || !prof) throw new Error('Service not found.');
    if (prof.disabled) throw new Error('Your account is disabled.');
    if (cfg.maintenance) throw new Error('Ordering is paused for maintenance.');
    if (!s.enabled || !s.available || !s.supported) throw new Error('This service is not available.');
    if (s.provider_currency !== cfg.provider_currency) throw new Error('Provider currency conversion is not configured.');

    const payload: Record<string, string | number> = {};
    const fields = data.fields ?? {};
    for (const field of s.requirements) {
      if (field === 'link' || field === 'media') {
        const value = field === 'link' ? data.link : fields[field];
        let url: URL;
        try { url = new URL(String(value)); } catch { throw new Error(`Enter a valid ${field} URL.`); }
        if (!/^https?:$/.test(url.protocol)) throw new Error(`Enter a valid ${field} URL.`);
        payload[field] = url.href;
      } else if (field === 'quantity') {
        const quantity = data.quantity ?? 0;
        if (quantity < s.min || quantity > s.max) throw new Error(`Quantity must be between ${s.min} and ${s.max}.`);
        payload['quantity'] = quantity;
      } else if (field === 'answer_number') {
        const number = Number(fields[field]);
        if (!Number.isInteger(number) || number < 1 || number > 100) throw new Error('Enter a poll answer number.');
        payload[field] = number;
      } else {
        const value = String(fields[field] ?? '').trim();
        if (!value) throw new Error(`Enter ${field.replace('_', ' ')}.`);
        payload[field] = value;
      }
    }
    let quantity = Number(payload['quantity'] ?? 0);
    if (s.pricing_unit === 'package') quantity = 1;
    else if (payload['comments']) quantity = String(payload['comments']).split(/\r?\n/).filter((x) => x.trim()).length;
    else if (s.type.toLowerCase() === 'mentions custom list') quantity = String(payload['usernames']).split(/\r?\n/).filter((x) => x.trim()).length;
    if (s.pricing_unit !== 'package' && (quantity < s.min || quantity > s.max)) throw new Error(`Quantity must be between ${s.min} and ${s.max}.`);

    const { charge, providerCost } = orderPrice(s, Number(cfg.provider_to_wallet_rate), quantity);
    const { link: _link, quantity: _quantity, ...extra } = payload;
    const orderId = randomUUID();
    await execute(`INSERT INTO orders (id, user_id, service_id, service_name, provider_service_id, idempotency_key, link, quantity, fields, charge, provider_cost, remains, refill, cancel, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      orderId, userId, s.id, s.name, s.provider_id, data.idempotencyKey, String(payload['link'] ?? ''), quantity, JSON.stringify(extra), charge, providerCost, quantity, s.refill, s.cancel, 'Reserving',
    ]);

    try {
      await walletApply(userId, -charge, 'order', s.name, `order:${orderId}`);
    } catch (error) {
      await execute('DELETE FROM orders WHERE id = ?', [orderId]);
      throw error;
    }
    await execute('UPDATE orders SET status = ? WHERE id = ?', ['Submitting', orderId]);

    try {
      const result = await shaker('add', { service: s.provider_id, ...payload });
      const providerOrderId = String(result.order ?? '');
      if (/^\d+$/.test(providerOrderId)) await execute('UPDATE orders SET provider_order_id = ?, status = ? WHERE id = ?', [providerOrderId, 'Pending', orderId]);
      else await execute('UPDATE orders SET status = ? WHERE id = ?', ['Submission uncertain', orderId]);
    } catch (error) {
      if (error instanceof ProviderError && error.rejected && !error.uncertain) {
        await walletApply(userId, charge, 'refund', 'Provider rejected the order', `refund:${orderId}:${charge}`);
        await execute('UPDATE orders SET status = ?, refund_amount = ? WHERE id = ?', ['Failed', charge, orderId]);
        throw new Error(`${error.message}. Your wallet was refunded.`);
      }
      await execute('UPDATE orders SET status = ? WHERE id = ?', ['Submission uncertain', orderId]);
    }
    const final = await query<any[]>('SELECT * FROM orders WHERE id = ? LIMIT 1', [orderId]);
    return final[0];
  });

export const refreshMyOrder = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const own = await query<any[]>('SELECT id FROM orders WHERE id = ? AND user_id = ? LIMIT 1', [data.id, context.userId]);
    if (!own[0]) throw new Error('Order not found.');
    const { refreshOrder } = await import('./core.server');
    return refreshOrder(data.id);
  });

export const startDeposit = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: { amount: number; phone?: string }) =>
    z.object({ amount: z.number().int().positive().max(100000000), phone: z.string().max(20).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { gifted, paystack } = await import('./providers.server');
    const { kenyaPhone } = await import('@/lib/pricing');
    const [cfg, user] = await Promise.all([getSettings(), findProfileById(context.userId)]);
    if (!cfg || !user) throw new Error('Account not found.');
    if (user.disabled) throw new Error('Your account is disabled.');
    if (cfg.maintenance) throw new Error('Payments are paused for maintenance.');
    if (data.amount < Number(cfg.min_deposit)) throw new Error(`Minimum deposit is ${Number(cfg.min_deposit) / 100}.`);
    const gateway = user.country === 'KE' ? 'giftedpay' : 'paystack';
    const rate = gateway === 'giftedpay' ? 1 : Number(cfg.paystack_to_wallet_rate);
    if (!(rate > 0)) throw new Error('Payment exchange rate is not configured.');
    const payAmount = Math.ceil(data.amount / rate - 1e-8);
    if (gateway === 'giftedpay' && payAmount % 100 !== 0) throw new Error('M-Pesa deposits must be whole shillings.');
    const phone = gateway === 'giftedpay' ? kenyaPhone(data.phone ?? '') : null;
    const reference = `adez.${randomUUID()}`;
    const id = randomUUID();
    await execute('INSERT INTO payments (id, user_id, reference, gateway, amount, currency, pay_amount, pay_currency, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      id, user.id, reference, gateway, data.amount, cfg.wallet_currency, payAmount, gateway === 'giftedpay' ? 'KES' : cfg.paystack_currency, phone,
    ]);
    await execute('UPDATE profiles SET country_locked = TRUE WHERE id = ?', [user.id]);
    try {
      if (gateway === 'giftedpay') {
        const result = await gifted('process', { phone_number: phone, amount: payAmount / 100, account_reference: reference, transaction_desc: `${cfg.site_name} wallet recharge` });
        await execute('UPDATE payments SET status = ?, checkout_request_id = ? WHERE id = ?', ['pending', String(result.checkout_request_id), id]);
        return { id, gateway, url: null as string | null };
      }
      const origin = new URL(getRequest().url).origin;
      const result = await paystack('initialize', { email: user.email, amount: payAmount, currency: cfg.paystack_currency, reference, channels: ['card'], callback_url: `${origin}/wallet?ref=${id}` });
      const url = new URL(result.authorization_url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('Invalid checkout URL.');
      await execute('UPDATE payments SET status = ?, authorization_url = ? WHERE id = ?', ['pending', url.href, id]);
      return { id, gateway, url: url.href };
    } catch (error) {
      await execute('UPDATE payments SET status = ?, failure_reason = ? WHERE id = ?', ['failed', (error as Error).message, id]);
      throw error;
    }
  });

export const checkDeposit = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const own = await query<any[]>('SELECT id FROM payments WHERE id = ? AND user_id = ? LIMIT 1', [data.id, context.userId]);
    if (!own[0]) throw new Error('Payment not found.');
    const { verifyPayment } = await import('./core.server');
    return verifyPayment(data.id);
  });
