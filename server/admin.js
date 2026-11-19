import { Router } from 'express';
import { Settings, User, Order, Payment, Service, Audit, Transaction } from './models.js';
import { settings, configuredKeys, audit, keyNames } from './config.js';
import { transaction } from './db.js';
import { requireSuper } from './auth.js';
import { listServices, serviceView, syncServices } from './services.js';
import { fail, text, integer, positive, object, objectId, safeUrl } from './lib/errors.js';
import { encrypt } from './lib/security.js';
import { orderView, userView, paymentView } from './serializers.js';
import { pagination, orderList, walletRefund, refreshOrder, idempotency, requestDigest } from './orders.js';
import { shaker } from './providers.js';
import { verifyPayment } from './payments.js';
import { runJobs } from './jobs.js';

export const adminRouter = Router();
adminRouter.get('/summary', async (req, res) => {
  const [config, users, totalOrders, pendingPayments, sums, grouped, recent] = await Promise.all([
    settings(), User.countDocuments(), Order.countDocuments(), Payment.countDocuments({ status: { $in: ['initializing', 'pending', 'review'] } }),
    Order.aggregate([{ $group: { _id: null, revenue: { $sum: '$charge' }, providerCost: { $sum: '$providerCost' }, refunds: { $sum: '$refundAmount' } } }]),
    Order.aggregate([{ $group: { _id: '$service', name: { $first: '$serviceName' }, orders: { $sum: 1 }, revenue: { $sum: '$charge' }, providerCost: { $sum: '$providerCost' }, refunds: { $sum: '$refundAmount' } } }, { $sort: { revenue: -1 } }]),
    Order.find().sort({ createdAt: -1 }).limit(10).lean()
  ]);
  const totals = sums[0] || { revenue: 0, providerCost: 0, refunds: 0 };
  let providerBalance = null;
  try { const value = await shaker('balance'); providerBalance = { balance: value.balance, currency: value.currency }; } catch { /* No fabricated balance for an unconfigured provider. */ }
  res.json({ stats: { users, orders: totalOrders, revenue: totals.revenue, providerCost: totals.providerCost, refunds: totals.refunds, profit: totals.revenue - totals.refunds - totals.providerCost, pendingPayments }, byService: grouped.map(row => ({ serviceId: String(row._id), name: row.name, orders: row.orders, revenue: row.revenue, providerCost: row.providerCost, refunds: row.refunds, profit: row.revenue - row.refunds - row.providerCost })), recentOrders: recent.map(row => orderView(row, true)), providerBalance, providerCurrency: config.providerCurrency, providerToWalletRate: config.providerToWalletRate, lastSyncAt: config.lastSyncAt });
});
adminRouter.get('/services', async (req, res) => { res.json(await listServices(req, true)); });
adminRouter.post('/services/sync', requireSuper, async (req, res) => { res.json(await syncServices(req.user._id)); });
adminRouter.patch('/services/:id', requireSuper, async (req, res) => {
  const input = object(req.body), update = {};
  if (input.sellingRate !== undefined) {
    update.sellingRate = input.sellingRate === null ? null : positive(input.sellingRate, 'Selling price');
    if (input.sellingRate === null) update.enabled = false;
  }
  if (input.enabled !== undefined) {
    if (typeof input.enabled !== 'boolean') fail(400, 'Enabled must be true or false.');
    update.enabled = input.enabled;
  }
  const config = await settings();
  const service = await transaction(async session => {
    const service = await Service.findById(objectId(req.params.id)).session(session);
    if (!service) fail(404, 'Service not found.');
    if (update.enabled && (!service.available || !service.supported || !(update.sellingRate || service.sellingRate) || config.providerToWalletRate <= 0)) fail(409, 'Set a valid price and provider exchange rate before enabling a supported service.');
    Object.assign(service, update);
    await service.save({ session });
    await audit(req.user._id, 'service.pricing_updated', service._id, `Selling rate ${service.sellingRate}; enabled ${service.enabled}.`, session);
    return service;
  });
  res.json({ service: serviceView(service, config, true) });
});
adminRouter.get('/orders', async (req, res) => { res.json(await orderList(req, true)); });
adminRouter.post('/orders/:id/resolve', requireSuper, async (req, res) => {
  const id = objectId(req.params.id), order = await Order.findById(id);
  if (!order) fail(404, 'Order not found.');
  if (!['Submitting', 'Submission uncertain'].includes(order.status)) fail(409, 'This order does not need submission review.');
  if (req.body.confirmNotSubmitted === true) {
    const reason = text(req.body.reason, 'Reason after checking upstream', 10, 500);
    const refunded = await walletRefund(id, order.charge, reason, req.user._id, true, true);
    return res.json({ order: orderView(refunded, true) });
  }
  const providerOrderId = text(req.body.providerOrderId, 'Provider order ID', 1, 30);
  if (!/^\d+$/.test(providerOrderId)) fail(400, 'Provider order ID must be numeric.');
  await shaker('status', { order: providerOrderId });
  const updated = await transaction(async session => {
    const row = await Order.findOneAndUpdate({ _id: id, status: { $in: ['Submitting', 'Submission uncertain'] } },
      { $set: { providerOrderId, status: 'Pending', nextCheckAt: new Date(0) }, $push: { history: { status: 'Pending', message: 'Administrator reconciled the provider order identifier.', at: new Date() } } }, { new: true, session });
    if (!row) fail(409, 'Order changed. Reload and review.');
    await audit(req.user._id, 'order.provider_attached', id, providerOrderId, session);
    return row;
  });
  res.json({ order: orderView(await refreshOrder(updated._id), true) });
});
adminRouter.post('/orders/:id/refund', requireSuper, async (req, res) => {
  const order = await Order.findById(objectId(req.params.id));
  if (!order) fail(404, 'Order not found.');
  if (!['Failed', 'Canceled', 'Partial'].includes(order.status)) fail(409, 'Refunds require a failed, canceled or partial order.');
  const desiredTotal = integer(req.body.totalRefundAmount, 'Total refund amount', 1, order.charge);
  const reason = text(req.body.reason, 'Refund reason', 5, 500);
  // Desired TOTAL prevents double refund when the same administrator action is retried.
  res.json({ order: orderView(await walletRefund(order._id, desiredTotal, reason, req.user._id), true) });
});
adminRouter.get('/users', async (req, res) => {
  const { page, skip } = pagination(req.query), filter = {};
  if (req.query.q) {
    const q = text(req.query.q, 'Search', 1, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }];
  }
  const [rows, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(25).lean(), User.countDocuments(filter)]);
  res.json({ users: rows.map(userView), total, page, pages: Math.max(1, Math.ceil(total / 25)) });
});
adminRouter.patch('/users/:id', requireSuper, async (req, res) => {
  const input = object(req.body), update = {};
  if (input.disabled !== undefined) {
    if (typeof input.disabled !== 'boolean') fail(400, 'Disabled must be true or false.');
    update.disabled = input.disabled;
  }
  if (input.role !== undefined) {
    if (!['user', 'admin'].includes(input.role)) fail(400, 'Role must be user or admin.');
    update.role = input.role;
  }
  const updated = await transaction(async session => {
    const user = await User.findOneAndUpdate({ _id: objectId(req.params.id), role: { $ne: 'super_admin' } },
      { $set: update, $inc: { authVersion: 1 } }, { new: true, session });
    if (!user) fail(409, 'This account is protected or does not exist.');
    await audit(req.user._id, 'user.access_updated', user._id, JSON.stringify(update), session);
    return user;
  });
  res.json({ user: userView(updated) });
});
adminRouter.post('/users/:id/balance', requireSuper, async (req, res) => {
  const amount = integer(req.body.amount, 'Adjustment', -100000000, 100000000);
  if (!amount) fail(400, 'Adjustment cannot be zero.');
  const reason = text(req.body.reason, 'Adjustment reason', 5, 500);
  const target = objectId(req.params.id);
  const reference = `adjustment:${req.user._id}:${idempotency(req.body.idempotencyKey)}`;
  const requestHash = requestDigest({ target, amount, reason });
  const updated = await transaction(async session => {
    const previous = await Transaction.findOne({ reference }).session(session);
    if (previous) {
      if (previous.requestHash !== requestHash) fail(409, 'Request identifier was already used for a different balance adjustment.');
      return User.findById(target).session(session);
    }
    const user = await User.findOneAndUpdate({ _id: target, balance: { $gte: Math.max(0, -amount) } }, { $inc: { balance: amount } }, { new: true, session });
    if (!user) fail(409, 'Account not found or adjustment would make its balance negative.');
    await Transaction.create([{ user: user._id, type: 'adjustment', amount, balanceAfter: user.balance, description: reason, reference, requestHash }], { session });
    await audit(req.user._id, 'wallet.adjusted', user._id, `${amount} minor units: ${reason}`, session);
    return user;
  });
  res.json({ user: userView(updated) });
});
adminRouter.get('/settings', async (req, res) => {
  const config = await settings();
  const { _id, __v, firstUserRegistered, createdAt, updatedAt, jobsLeaseUntil, ...safe } = config;
  for (const key of keyNames) delete safe[key];
  res.json({ settings: safe, integrations: await configuredKeys() });
});
adminRouter.patch('/settings', requireSuper, async (req, res) => {
  const input = object(req.body), update = {};
  const strings = { siteName: [2, 80], tagline: [1, 160], supportEmail: [0, 254], emailFrom: [0, 254], announcement: [0, 1000] };
  for (const [key, bounds] of Object.entries(strings)) if (input[key] !== undefined) update[key] = text(input[key], key, ...bounds);
  for (const key of ['supportEmail', 'emailFrom']) if (update[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update[key])) fail(400, `${key} must be a valid email address.`);
  if (input.iconUrl !== undefined) update.iconUrl = input.iconUrl === '' ? '' : safeUrl(input.iconUrl, 'Icon URL');
  for (const key of ['registrationOpen', 'maintenance']) if (input[key] !== undefined) {
    if (typeof input[key] !== 'boolean') fail(400, `${key} must be true or false.`);
    update[key] = input[key];
  }
  for (const key of ['providerToWalletRate', 'paystackToWalletRate']) if (input[key] !== undefined) update[key] = positive(input[key], key, 100000);
  if (input.minDeposit !== undefined) update.minDeposit = integer(input.minDeposit, 'Minimum deposit', 100, 100000000);
  if (input.defaultMarkupPercent !== undefined) {
    if (typeof input.defaultMarkupPercent !== 'number' || !Number.isFinite(input.defaultMarkupPercent) || input.defaultMarkupPercent < 0 || input.defaultMarkupPercent > 10000) fail(400, 'Markup percentage is invalid.');
    update.defaultMarkupPercent = input.defaultMarkupPercent;
  }
  if (input.walletCurrency !== undefined && input.walletCurrency !== 'KES') fail(400, 'Wallet currency is KES and cannot be changed.');
  if (input.paystackCurrency !== undefined) {
    if (!['KES', 'NGN', 'GHS', 'ZAR', 'USD', 'XOF'].includes(input.paystackCurrency)) fail(400, 'Select a supported Paystack currency.');
    update.paystackCurrency = input.paystackCurrency;
  }
  const current = await settings();
  if ((update.paystackCurrency || current.paystackCurrency) === 'KES' && (update.paystackToWalletRate ?? current.paystackToWalletRate) !== 1) fail(400, 'KES to KES payment conversion must be 1.');
  if (current.providerCurrency === 'KES' && update.providerToWalletRate !== undefined && update.providerToWalletRate !== 1) fail(400, 'KES provider conversion must be 1.');
  for (const key of keyNames) if (input[key] !== undefined && input[key] !== '') update[key] = encrypt(text(input[key], 'Integration key', 10, 1000));
  await transaction(async session => {
    await Settings.updateOne({ _id: 'site' }, { $set: update }, { session, runValidators: true });
    await audit(req.user._id, 'settings.updated', 'site', `Updated fields: ${Object.keys(update).join(', ')}. Secret values are never logged.`, session);
  });
  res.json({ message: 'Settings saved securely.' });
});
adminRouter.get('/payments', async (req, res) => {
  const { page, skip } = pagination(req.query), filter = {};
  if (req.query.status) filter.status = text(req.query.status, 'Status', 1, 30);
  const [rows, total] = await Promise.all([Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(25).lean(), Payment.countDocuments(filter)]);
  res.json({ payments: rows.map(paymentView), total, page, pages: Math.max(1, Math.ceil(total / 25)) });
});
adminRouter.post('/payments/:id/resolve', requireSuper, async (req, res) => {
  const payment = await Payment.findById(objectId(req.params.id));
  if (!payment) fail(404, 'Payment not found.');
  if (payment.status === 'completed') fail(409, 'Payment was already credited.');
  if (req.body.checkoutRequestId) {
    if (payment.gateway !== 'giftedpay' || payment.checkoutRequestId) fail(409, 'Cannot change an existing provider transaction identifier.');
    payment.checkoutRequestId = text(req.body.checkoutRequestId, 'Checkout request ID', 8, 200);
    await payment.save();
    await audit(req.user._id, 'payment.provider_attached', payment._id, 'GiftedPay identifier attached; verification still required.');
  }
  res.json({ payment: paymentView(await verifyPayment(payment._id, { force: true })), message: 'Payment checked against provider records. Only matching confirmed payments are credited.' });
});
adminRouter.post('/jobs/run', async (req, res) => { res.json(await runJobs(req.user._id)); });
adminRouter.get('/audit', async (req, res) => {
  const { page, skip } = pagination(req.query);
  const [rows, total] = await Promise.all([Audit.find().sort({ createdAt: -1 }).skip(skip).limit(25).lean(), Audit.countDocuments()]);
  res.json({ events: rows.map(row => ({ id: String(row._id), actor: row.actor, action: row.action, target: row.target, detail: row.detail, createdAt: row.createdAt })), total, page, pages: Math.max(1, Math.ceil(total / 25)) });
});
