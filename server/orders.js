import { Router } from 'express';
import { Order, User, Service, Transaction } from './models.js';
import { transaction } from './db.js';
import { settings, apiKey, audit } from './config.js';
import { shaker } from './providers.js';
import { hash } from './lib/security.js';
import { fail, text, objectId, integer } from './lib/errors.js';
import { normalizeOrder, orderPrice } from './services.js';
import { orderView } from './serializers.js';
import { rateCheck } from './auth.js';

export const terminal = ['Completed', 'Partial', 'Canceled', 'Failed'];
export function idempotency(value) {
  const key = text(value, 'Request identifier', 16, 100);
  if (!/^[a-z0-9_.-]+$/i.test(key)) fail(400, 'Request identifier is invalid.');
  return key;
}
export function requestDigest(input) {
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    return value;
  }
  return hash(JSON.stringify(canonical(input)));
}
export async function walletRefund(orderId, desiredTotal, reason, actor = 'system', zeroCost = false, markUnsubmitted = false) {
  return transaction(async session => {
    const order = await Order.findById(orderId).session(session);
    if (!order) fail(404, 'Order not found.');
    if (markUnsubmitted) {
      if (!['Submitting', 'Submission uncertain'].includes(order.status)) fail(409, 'Order was already resolved.');
      order.status = 'Failed';
      order.history.push({ status: 'Failed', message: 'Administrator confirmed this order never reached the provider.', at: new Date() });
      await audit(actor, 'order.not_submitted', order._id, reason, session);
    }
    integer(desiredTotal, 'Refund', 0, order.charge);
    const delta = Math.max(0, desiredTotal - order.refundAmount);
    if (delta) {
      const user = await User.findByIdAndUpdate(order.user, { $inc: { balance: delta } }, { new: true, session });
      order.refundAmount += delta;
      await Transaction.create([{ user: order.user, type: 'refund', amount: delta, balanceAfter: user.balance, description: reason, reference: `refund:${order._id}:${order.refundAmount}` }], { session });
      order.history.push({ status: order.status, message: `${reason} Wallet credited ${(delta / 100).toFixed(2)}.`, at: new Date() });
      await audit(actor, 'order.refunded', order._id, `${delta} minor units: ${reason}`, session);
    }
    if (zeroCost) order.providerCost = 0;
    await order.save({ session });
    return order;
  });
}
export async function createOrder(userId, input) {
  const key = idempotency(input.idempotencyKey), requestHash = requestDigest(input);
  const existing = await Order.findOne({ user: userId, idempotencyKey: key });
  if (existing) {
    if (existing.requestHash !== requestHash) fail(409, 'Request identifier was already used for a different order.');
    return existing;
  }
  await apiKey('shakergainsApiKey');
  const config = await settings();
  if (config.maintenance) fail(503, 'Ordering is temporarily paused for maintenance.');
  let normalized, order;
  try {
    order = await transaction(async session => {
      const duplicate = await Order.findOne({ user: userId, idempotencyKey: key }).session(session);
      if (duplicate) {
        if (duplicate.requestHash !== requestHash) fail(409, 'Request identifier was already used.');
        return { duplicate };
      }
      const service = await Service.findById(objectId(input.serviceId)).session(session);
      if (!service) fail(404, 'Service not found.');
      normalized = normalizeOrder(input, service);
      const amounts = orderPrice(service, config, normalized.quantity);
      const user = await User.findOneAndUpdate({ _id: userId, disabled: false, balance: { $gte: amounts.charge } },
        { $inc: { balance: -amounts.charge } }, { session, new: true });
      if (!user) fail(409, 'Your wallet has insufficient funds or your account is unavailable.');
      const [created] = await Order.create([{
        user: userId, service: service._id, serviceName: service.name, serviceType: service.type,
        providerServiceId: service.providerId, idempotencyKey: key, requestHash,
        ...amounts, costRateSnapshot: service.providerRate * config.providerToWalletRate,
        providerToWalletRateSnapshot: config.providerToWalletRate, link: normalized.link,
        quantity: normalized.quantity, fields: normalized.fields, remains: normalized.quantity,
        refill: service.refill, cancel: service.cancel, status: 'Submitting',
        history: [{ status: 'Submitting', message: 'Wallet reserved. Sending order to provider.', at: new Date() }]
      }], { session });
      await Transaction.create([{ user: userId, type: 'order', amount: -amounts.charge, balanceAfter: user.balance, description: service.name, reference: `order:${created._id}` }], { session });
      return created;
    });
  } catch (error) {
    if (error.code === 11000) {
      const duplicate = await Order.findOne({ user: userId, idempotencyKey: key });
      if (duplicate && duplicate.requestHash === requestHash) return duplicate;
    }
    throw error;
  }
  if (order.duplicate) return order.duplicate;
  try {
    const response = await shaker('add', { service: order.providerServiceId, ...normalized.payload });
    const providerOrderId = String(response.order ?? '');
    if (!/^\d+$/.test(providerOrderId)) {
      await markUncertain(order._id, 'Provider response did not identify the order. Administrator review required.');
      return await Order.findById(order._id);
    }
    try {
      await Order.updateOne({ _id: order._id, status: 'Submitting' }, {
        $set: { providerOrderId, status: 'Pending', nextCheckAt: new Date(Date.now() + 15000) },
        $push: { history: { status: 'Pending', message: 'Provider accepted the order.', at: new Date() } }
      });
    } catch {
      await markUncertain(order._id, 'Provider accepted the request but the order identifier needs administrator review.');
    }
  } catch (error) {
    // Only an explicit business rejection is known to be safe to refund.
    if (error.status === 422 && !error.uncertain) {
      await Order.updateOne({ _id: order._id }, { $set: { status: 'Failed' }, $push: { history: { status: 'Failed', message: error.message, at: new Date() } } });
      await walletRefund(order._id, order.charge, 'Provider rejected the order.', 'system', true);
    } else {
      await markUncertain(order._id, 'Submission outcome is uncertain. Do not resubmit; support will reconcile the provider request.');
    }
  }
  return await Order.findById(order._id);
}
async function markUncertain(id, message) {
  await Order.updateOne({ _id: id, status: 'Submitting' }, { $set: { status: 'Submission uncertain' }, $push: { history: { status: 'Submission uncertain', message, at: new Date() } } });
}
export function normalizedStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return ({ pending: 'Pending', processing: 'Processing', 'in progress': 'In progress', completed: 'Completed', partial: 'Partial', canceled: 'Canceled', cancelled: 'Canceled' })[status] || null;
}
export async function refreshOrder(orderId) {
  const current = await Order.findById(orderId);
  if (!current) fail(404, 'Order not found.');
  if (!current.providerOrderId || terminal.includes(current.status)) return current;
  const lease = await Order.findOneAndUpdate({
    _id: orderId, $or: [{ checkingUntil: { $exists: false } }, { checkingUntil: { $lt: new Date() } }],
    nextCheckAt: { $not: { $gt: new Date() } }
  }, { $set: { checkingUntil: new Date(Date.now() + 30000), nextCheckAt: new Date(Date.now() + 10000) } }, { new: true });
  if (!lease) return current;
  try {
    const response = await shaker('status', { order: current.providerOrderId });
    const status = normalizedStatus(response.status);
    if (!status) fail(502, 'Provider supplied an unknown order status.');
    const remains = Number(response.remains), startCount = Number(response.start_count);
    if (!Number.isSafeInteger(remains) || remains < 0 || remains > current.quantity || !Number.isSafeInteger(startCount) || startCount < 0) fail(502, 'Provider supplied invalid order progress.');
    const result = await transaction(async session => {
      const order = await Order.findById(orderId).session(session);
      if (terminal.includes(order.status)) return order;
      order.status = status; order.remains = remains; order.startCount = startCount;
      if (current.status !== status) order.history.push({ status, message: `Provider status updated to ${status}.`, at: new Date() });
      let desiredRefund = 0;
      if (status === 'Canceled') desiredRefund = order.charge;
      if (status === 'Partial') desiredRefund = Math.floor(order.charge * remains / order.quantity);
      const providerCharge = Number(response.charge);
      const config = await settings();
      if (Number.isFinite(providerCharge) && providerCharge >= 0 && providerCharge <= 10000000 && response.currency === config.providerCurrency) {
        const cost = Math.ceil(providerCharge * order.providerToWalletRateSnapshot * 100 - 1e-8);
        if (Number.isSafeInteger(cost) && cost <= 1000000000) { order.providerCost = cost; order.lastProviderCharge = providerCharge; }
      } else if (status === 'Partial' || status === 'Canceled') {
        order.providerCost = status === 'Canceled' ? 0 : Math.ceil(order.costRateSnapshot * (order.quantity - remains) / 1000 * 100);
      }
      const delta = Math.max(0, desiredRefund - order.refundAmount);
      if (delta) {
        const user = await User.findByIdAndUpdate(order.user, { $inc: { balance: delta } }, { session, new: true });
        order.refundAmount += delta;
        await Transaction.create([{ user: order.user, type: 'refund', amount: delta, balanceAfter: user.balance, description: `${status} order refund`, reference: `refund:${order._id}:${order.refundAmount}` }], { session });
        order.history.push({ status, message: `Unused quantity refunded to wallet: ${(delta / 100).toFixed(2)}.`, at: new Date() });
      }
      await order.save({ session });
      return order;
    });
    return result;
  } finally { await Order.updateOne({ _id: orderId }, { $unset: { checkingUntil: '' } }); }
}
export function pagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  integer(page, 'Page', 1, 100000);
  return { page, skip: (page - 1) * 25 };
}
export async function orderList(req, admin = false) {
  const { page, skip } = pagination(req.query), filter = admin ? {} : { user: req.user._id };
  if (req.query.status) filter.status = text(req.query.status, 'Status', 1, 50);
  const [rows, total] = await Promise.all([Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(25).lean(), Order.countDocuments(filter)]);
  return { orders: rows.map(o => orderView(o, admin)), total, page, pages: Math.max(1, Math.ceil(total / 25)) };
}
export const ordersRouter = Router();
async function owned(req) {
  const order = await Order.findOne({ _id: objectId(req.params.id), user: req.user._id });
  if (!order) fail(404, 'Order not found.');
  return order;
}
ordersRouter.get('/', async (req, res) => { res.json(await orderList(req)); });
ordersRouter.post('/', async (req, res) => {
  await rateCheck(`order:${req.user._id}`, 60, 60000);
  res.status(201).json({ order: orderView(await createOrder(req.user._id, req.body)) });
});
ordersRouter.post('/bulk', async (req, res) => {
  await rateCheck(`bulk:${req.user._id}`, 6, 60000);
  const key = idempotency(req.body.idempotencyKey);
  if (!Array.isArray(req.body.orders) || req.body.orders.length < 1 || req.body.orders.length > 25) fail(400, 'Bulk orders must contain 1 to 25 orders.');
  // Deterministic child keys prevent duplicate charges when the entire bulk batch is retried.
  const results = [];
  for (const [index, input] of req.body.orders.entries()) {
    try {
      const order = await createOrder(req.user._id, { ...input, idempotencyKey: `${key}.${index}` });
      results.push({ order: orderView(order) });
    } catch (error) { results.push({ error: error.status ? error.message : 'This order could not be placed.', index }); }
  }
  res.json({ results, message: 'Bulk request processed. Review each order result.' });
});
ordersRouter.get('/:id', async (req, res) => { res.json({ order: orderView(await owned(req)) }); });
ordersRouter.post('/:id/refresh', async (req, res) => {
  await rateCheck(`status:${req.user._id}`, 30, 60000);
  const order = await owned(req);
  res.json({ order: orderView(await refreshOrder(order._id)) });
});
for (const action of ['cancel', 'refill']) {
  ordersRouter.post(`/:id/${action}`, async (req, res) => {
    await rateCheck(`${action}:${req.user._id}`, 8, 60000);
    const order = await owned(req);
    if (!order[action] || !order.providerOrderId) fail(409, `This order does not support ${action}.`);
    if (action === 'cancel' && terminal.includes(order.status)) fail(409, 'A terminal order cannot be canceled.');
    if (action === 'refill' && !['Completed', 'Partial'].includes(order.status)) fail(409, 'Refills are available after completion or partial delivery.');
    const field = action === 'cancel' ? 'lastCancelAt' : 'lastRefillAt';
    const claimed = await Order.findOneAndUpdate({ _id: order._id, $or: [{ [field]: { $exists: false } }, { [field]: { $lt: new Date(Date.now() - 3600000) } }] }, { $set: { [field]: new Date() } });
    if (!claimed) fail(429, 'This request was recently sent. Allow the provider time to process it.');
    const result = await shaker(action, { order: order.providerOrderId });
    if (!result.success && !result.refill) fail(502, 'Provider did not confirm this request.');
    const message = action === 'cancel' ? 'Cancellation requested. Refund follows confirmed provider status.' : 'Refill requested. Provider eligibility and timing apply.';
    const updated = await Order.findByIdAndUpdate(order._id, { $push: { history: { status: order.status, message, at: new Date() } } }, { new: true });
    res.json({ message, order: orderView(updated) });
  });
}
