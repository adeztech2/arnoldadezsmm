import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { execute, getSettings, hasRole, query, walletApply } from '@/db';
import { requireManusAuth } from '@/integrations/manus/auth';
import { audit, refreshOrder, verifyPayment } from './core.server';

async function requireRole(userId: string, superOnly: boolean) {
  if (await hasRole(userId, 'super_admin')) return;
  if (!superOnly && await hasRole(userId, 'admin')) return;
  throw new Error(superOnly ? 'Only the site owner can do this.' : 'Only an authorized administrator can do this.');
}

export const syncCatalog = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .handler(async ({ context }) => {
    await requireRole(context.userId, true);
    const { shaker } = await import('./providers.server');
    const { typeInfo, defaultSellingRate } = await import('@/lib/pricing');
    const bal = await shaker('balance');
    if (!/^[A-Z]{3}$/.test(String(bal.currency))) throw new Error('Provider did not supply a valid currency.');
    const rows = await shaker('services');
    if (!Array.isArray(rows) || !rows.length) throw new Error('Provider service list is empty. Existing services kept.');
    const cfg = await getSettings();
    const rate = bal.currency === 'KES' ? 1 : Number(cfg.provider_to_wallet_rate);
    const existing = await query<{ provider_id: string }[]>('SELECT provider_id FROM services');
    const known = new Set(existing.map((e) => e.provider_id));
    const now = new Date();
    await execute('UPDATE services SET available = FALSE WHERE provider_id <> ?', ['']);
    for (const r of rows as any[]) {
      const type = String(r.type || 'Default');
      const info = typeInfo(type);
      const providerId = String(r.service);
      const base = {
        providerId,
        name: String(r.name ?? '').slice(0, 1000),
        category: String(r.category ?? 'Other').slice(0, 300),
        type,
        min: Number(r.min) || 1,
        max: Number(r.max) || 1,
        providerRate: Number(r.rate) || 0,
        currency: bal.currency,
        supported: info.supported,
        requirements: JSON.stringify(info.requirements),
        pricingUnit: info.pricingUnit,
        refill: [true, 'true', 1].includes(r.refill),
        cancel: [true, 'true', 1].includes(r.cancel),
        description: String(r.description ?? '').slice(0, 4000),
        sellingRate: defaultSellingRate(Number(r.rate) || 0, rate, Number(cfg.default_markup_percent)),
      };
      if (known.has(providerId)) {
        await execute(`UPDATE services SET name = ?, category = ?, type = ?, min = ?, max = ?, provider_rate = ?, provider_currency = ?, supported = ?, requirements = ?, pricing_unit = ?, refill = ?, cancel = ?, description = ?, available = TRUE, updated_at = ? WHERE provider_id = ?`, [
          base.name, base.category, base.type, base.min, base.max, base.providerRate, base.currency, base.supported, base.requirements, base.pricingUnit, base.refill, base.cancel, base.description, now, providerId,
        ]);
      } else {
        await execute(`INSERT INTO services (id, provider_id, name, category, type, min, max, provider_rate, provider_currency, selling_rate, enabled, available, supported, refill, cancel, requirements, pricing_unit, description) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, TRUE, ?, ?, ?, ?, ?, ?)`, [
          providerId, base.name, base.category, base.type, base.min, base.max, base.providerRate, base.currency, base.sellingRate, base.supported, base.refill, base.cancel, base.requirements, base.pricingUnit, base.description,
        ]);
      }
    }
    await execute('UPDATE settings SET provider_currency = ?, last_sync_at = ?, provider_to_wallet_rate = CASE WHEN ? = \'KES\' THEN 1 ELSE provider_to_wallet_rate END WHERE id = \'site\'', [bal.currency, now, bal.currency]);
    await audit(context.userId, 'services.synced', 'catalog', `Imported ${rows.length} services in ${bal.currency}`);
    return { count: rows.length, currency: bal.currency, balance: bal.balance };
  });

export const updateService = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: { id: string; selling_rate?: number | null; enabled?: boolean }) =>
    z.object({ id: z.string().uuid(), selling_rate: z.number().nonnegative().max(10000000).nullable().optional(), enabled: z.boolean().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.userId, true);
    const changes: string[] = [];
    const values: unknown[] = [];
    if (data.selling_rate !== undefined) { changes.push('selling_rate = ?'); values.push(data.selling_rate); }
    if (data.enabled !== undefined) { changes.push('enabled = ?'); values.push(data.enabled); }
    if (!changes.length) return { ok: true };
    values.push(data.id);
    await execute(`UPDATE services SET ${changes.join(', ')} WHERE id = ?`, values);
    await audit(context.userId, 'service.updated', data.id, JSON.stringify(data));
    return { ok: true };
  });

const settingsSchema = z.object({
  site_name: z.string().min(1).max(80), tagline: z.string().max(200), support_email: z.string().max(200),
  announcement: z.string().max(500), paystack_currency: z.string().regex(/^[A-Z]{3}$/),
  provider_to_wallet_rate: z.number().nonnegative(), paystack_to_wallet_rate: z.number().positive(),
  min_deposit: z.number().int().positive(), default_markup_percent: z.number().min(0).max(1000),
  registration_open: z.boolean(), maintenance: z.boolean(),
});

export const saveSettings = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: z.infer<typeof settingsSchema>) => settingsSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.userId, true);
    if (data.paystack_currency === 'KES' && data.paystack_to_wallet_rate !== 1) throw new Error('KES to KES rate must be exactly 1.');
    await execute(`UPDATE settings SET site_name = ?, tagline = ?, support_email = ?, announcement = ?, paystack_currency = ?, provider_to_wallet_rate = ?, paystack_to_wallet_rate = ?, min_deposit = ?, default_markup_percent = ?, registration_open = ?, maintenance = ? WHERE id = 'site'`, [
      data.site_name, data.tagline, data.support_email, data.announcement, data.paystack_currency, data.provider_to_wallet_rate, data.paystack_to_wallet_rate, data.min_deposit, data.default_markup_percent, data.registration_open, data.maintenance,
    ]);
    await audit(context.userId, 'settings.updated', 'site', 'Settings saved');
    return { ok: true };
  });

export const adjustBalance = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: { userId: string; amount: number; reason: string; key: string }) =>
    z.object({ userId: z.string().uuid(), amount: z.number().int().refine((n) => n !== 0), reason: z.string().min(3).max(200), key: z.string().min(16).max(100) }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.userId, true);
    const balance = await walletApply(data.userId, data.amount, 'adjustment', data.reason, `adjust:${data.key}`);
    await audit(context.userId, 'balance.adjusted', data.userId, `${data.amount} — ${data.reason}`);
    return { balance };
  });

export const setUserAccess = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: { userId: string; disabled?: boolean; admin?: boolean }) =>
    z.object({ userId: z.string().uuid(), disabled: z.boolean().optional(), admin: z.boolean().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.userId, true);
    if (data.userId === context.userId) throw new Error('You cannot change your own access.');
    if (data.disabled !== undefined) await execute('UPDATE profiles SET disabled = ? WHERE id = ?', [data.disabled, data.userId]);
    if (data.admin === true) await execute('INSERT INTO user_roles (id, user_id, role) VALUES (UUID(), ?, \'admin\') ON DUPLICATE KEY UPDATE role = role', [data.userId]);
    if (data.admin === false) await execute('DELETE FROM user_roles WHERE user_id = ? AND role = \'admin\'', [data.userId]);
    await audit(context.userId, 'user.access', data.userId, JSON.stringify(data));
    return { ok: true };
  });

export const adminRefreshOrder = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.userId, false);
    return refreshOrder(data.id);
  });

export const resolveUncertain = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: { id: string; providerOrderId?: string }) =>
    z.object({ id: z.string().uuid(), providerOrderId: z.string().regex(/^\d+$/).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.userId, true);
    const { getOrder } = await import('./core.server');
    const order = await getOrder(data.id);
    if (!order || !['Submitting', 'Submission uncertain'].includes(String(order.status))) throw new Error('Order is not awaiting review.');
    if (data.providerOrderId) {
      await execute('UPDATE orders SET provider_order_id = ?, status = ? WHERE id = ?', [data.providerOrderId, 'Pending', order.id]);
    } else {
      const due = Number(order.charge) - Number(order.refund_amount);
      if (due > 0) await walletApply(order.user_id, due, 'refund', 'Order not submitted', `refund:${order.id}:${order.charge}`);
      await execute('UPDATE orders SET status = ?, refund_amount = ?, provider_cost = 0 WHERE id = ?', ['Failed', order.charge, order.id]);
    }
    await audit(context.userId, 'order.resolved', order.id, data.providerOrderId ?? 'refunded');
    return { ok: true };
  });

export const adminVerifyPayment = createServerFn({ method: 'POST' })
  .middleware([requireManusAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.userId, false);
    return verifyPayment(data.id);
  });
