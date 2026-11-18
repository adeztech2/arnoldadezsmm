// Privileged business operations shared by server functions and public webhooks.
import { execute, findProfileById, query, audit as writeAudit, walletApply as applyWallet, type Order, type Payment } from '@/db';
import { gifted, paystack, shaker } from './providers.server';
import { normalizedStatus, refundFor, TERMINAL } from '@/lib/pricing';

export const walletApply = applyWallet;
export const audit = writeAudit;

export async function getOrder(orderId: string): Promise<any> {
  const rows = await query<(Order & { provider_order_id: string | null; status: string; quantity: number; charge: number; refund_amount: number; remains: number | null; start_count: number })[]>('SELECT * FROM orders WHERE id = ? LIMIT 1', [orderId]);
  return rows[0] ?? null;
}

export async function getPayment(paymentId: string): Promise<any> {
  const rows = await query<(Payment & { gateway: string; reference: string; amount: number; pay_amount: number; pay_currency: string; status: string; checkout_request_id: string | null; phone: string | null })[]>('SELECT * FROM payments WHERE id = ? LIMIT 1', [paymentId]);
  return rows[0] ?? null;
}

export async function refreshOrder(orderId: string) {
  const order = await getOrder(orderId);
  if (!order) throw new Error('Order not found.');
  if (!order.provider_order_id || TERMINAL.includes(order.status)) return order;
  const r = await shaker('status', { order: order.provider_order_id });
  const status = normalizedStatus(r.status);
  if (!status) throw new Error('Provider supplied an unknown order status.');
  const remains = Number(r.remains), startCount = Number(r.start_count);
  if (!Number.isSafeInteger(remains) || remains < 0 || remains > Number(order.quantity)) throw new Error('Provider supplied invalid progress.');
  const desired = refundFor(status, Number(order.charge), Number(order.quantity), remains);
  const delta = Math.max(0, desired - Number(order.refund_amount));
  if (delta > 0) {
    const total = Number(order.refund_amount) + delta;
    await walletApply(order.user_id, delta, 'refund', `${status} order refund`, `refund:${order.id}:${total}`);
  }
  await execute('UPDATE orders SET status = ?, remains = ?, start_count = ?, refund_amount = ? WHERE id = ?', [
    status, remains, Number.isSafeInteger(startCount) ? startCount : Number(order.start_count), Number(order.refund_amount) + delta, orderId,
  ]);
  return getOrder(orderId);
}

export async function verifyPayment(paymentId: string) {
  const payment = await getPayment(paymentId);
  if (!payment) throw new Error('Payment not found.');
  if (['completed', 'failed', 'review'].includes(payment.status)) return payment;
  let completed = false, failed = false, matches = false;
  if (payment.gateway === 'giftedpay') {
    if (!payment.checkout_request_id) return payment;
    const r = await gifted('verify', { checkoutRequestId: payment.checkout_request_id });
    completed = r.success === true && r.status === 'completed';
    failed = ['failed', 'cancelled', 'timeout'].includes(r.status);
    const d = r.data;
    matches = !!d && d.checkout_request_id === payment.checkout_request_id && Math.round(Number(d.amount) * 100) === Number(payment.pay_amount)
      && String(d.phone_number) === payment.phone && Number(d.result_code) === 0 && !!d.mpesa_receipt_number;
  } else {
    const d = await paystack(`verify/${encodeURIComponent(payment.reference)}`);
    completed = d.status === 'success';
    failed = ['failed', 'abandoned', 'reversed'].includes(d.status);
    const owner = await findProfileById(payment.user_id);
    matches = d.reference === payment.reference && d.amount === Number(payment.pay_amount) && d.currency === payment.pay_currency
      && d.channel === 'card' && String(d.customer?.email ?? '').toLowerCase() === String(owner?.email ?? '').toLowerCase();
  }
  if (completed && !matches) {
    await execute('UPDATE payments SET status = ?, failure_reason = ? WHERE id = ?', ['review', 'Provider details do not match this payment.', payment.id]);
  } else if (completed) {
    await walletApply(payment.user_id, Number(payment.amount), 'deposit', `${payment.gateway === 'giftedpay' ? 'M-Pesa' : 'Card'} wallet recharge`, `deposit:${payment.reference}`);
    await execute('UPDATE payments SET status = ? WHERE id = ?', ['completed', payment.id]);
  } else if (failed) {
    await execute('UPDATE payments SET status = ? WHERE id = ? AND status <> ?', ['failed', payment.id, 'completed']);
  }
  return getPayment(payment.id);
}
