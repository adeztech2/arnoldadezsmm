import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Payment, User, Transaction } from './models.js';
import { settings, apiKey, appUrl } from './config.js';
import { transaction } from './db.js';
import { gifted, paystack } from './providers.js';
import { fail, integer, objectId, positive } from './lib/errors.js';
import { paymentView, transactionView } from './serializers.js';
import { idempotency, requestDigest } from './orders.js';
import { rateCheck } from './auth.js';

export function kenyaPhone(value) {
  if (typeof value !== 'string') fail(400, 'Enter your Safaricom phone number.');
  let phone = value.replace(/[\s+()-]/g, '');
  if (/^0[17]\d{8}$/.test(phone)) phone = `254${phone.slice(1)}`;
  if (!/^254[17]\d{8}$/.test(phone)) fail(400, 'Use a Kenyan mobile number such as 0712345678.');
  return phone;
}
export function paymentConversion(amount, config, gateway) {
  integer(amount, 'Deposit amount', config.minDeposit, 100000000);
  const rate = gateway === 'giftedpay' ? 1 : positive(config.paystackToWalletRate, 'Payment exchange rate');
  const payAmount = Math.ceil(amount / rate - 1e-8);
  if (payAmount < 100) fail(400, 'Deposit must cover at least 1 unit of the checkout currency. Increase the amount or ask support about the exchange rate.');
  integer(payAmount, 'Payment amount', 100, 1000000000);
  if (gateway === 'giftedpay' && payAmount % 100 !== 0) fail(400, 'M-Pesa deposits must be whole Kenyan shillings.');
  return { payAmount, payCurrency: gateway === 'giftedpay' ? 'KES' : config.paystackCurrency, exchangeRate: rate };
}
export async function createPayment(userId, input) {
  const key = idempotency(input.idempotencyKey), requestHash = requestDigest(input);
  let payment = await Payment.findOne({ user: userId, idempotencyKey: key });
  if (payment) {
    if (payment.requestHash !== requestHash) fail(409, 'Request identifier was already used for another payment.');
    return payment;
  }
  const config = await settings(), baseUrl = appUrl();
  if (config.maintenance) fail(503, 'Payments are temporarily paused for maintenance.');
  let user, phone;
  const candidate = await User.findById(userId);
  const gateway = candidate.country === 'KE' ? 'giftedpay' : 'paystack';
  await apiKey(gateway === 'giftedpay' ? 'giftedpayApiKey' : 'paystackSecretKey');
  if (gateway === 'giftedpay') phone = kenyaPhone(input.phone);
  const conversion = paymentConversion(input.amount, config, gateway);
  try {
    payment = await transaction(async session => {
      user = await User.findOneAndUpdate({ _id: userId, disabled: false, country: candidate.country }, { $inc: { mutationRevision: 1 } }, { new: true, session });
      if (!user) fail(409, 'Account changed. Reload before paying.');
      const existing = await Payment.findOne({ user: userId, idempotencyKey: key }).session(session);
      if (existing) {
        if (existing.requestHash !== requestHash) fail(409, 'Request identifier already used.');
        return { duplicate: existing };
      }
      const [created] = await Payment.create([{ user: userId, reference: `adez.${randomUUID()}`, idempotencyKey: key, requestHash, gateway, amount: input.amount, currency: config.walletCurrency, ...conversion, phone }], { session });
      return created;
    });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await Payment.findOne({ user: userId, idempotencyKey: key });
      if (existing?.requestHash === requestHash) return existing;
    }
    throw error;
  }
  if (payment.duplicate) return payment.duplicate;
  try {
    if (gateway === 'giftedpay') {
      // Leave GiftedPay's default callback in place so its verify endpoint records the result.
      const result = await gifted('process', { phone_number: phone, amount: payment.payAmount / 100, account_reference: payment.reference, transaction_desc: 'ADEZ SMM wallet recharge' });
      payment.checkoutRequestId = String(result.checkout_request_id);
    } else {
      const result = await paystack('initialize', { email: user.email, amount: payment.payAmount, currency: payment.payCurrency, reference: payment.reference, channels: ['card'], callback_url: `${baseUrl}/wallet?reference=${encodeURIComponent(payment.reference)}` });
      let url;
      try { url = new URL(result.authorization_url); } catch { fail(502, 'Paystack returned an invalid checkout URL.'); }
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com' || result.reference !== payment.reference) fail(502, 'Paystack checkout response could not be validated.');
      payment.authorizationUrl = url.href;
    }
    payment.status = 'pending'; payment.nextCheckAt = new Date(Date.now() + 5000);
    await payment.save();
  } catch (error) {
    payment.status = error.uncertain || error.status !== 422 ? 'review' : 'failed';
    payment.failureReason = error.status ? error.message : 'Payment initialization needs administrator review.';
    await payment.save();
    fail(error.status || 502, payment.failureReason);
  }
  return payment;
}
export async function verifyPayment(paymentId, { force = false } = {}) {
  const current = await Payment.findById(paymentId);
  if (!current) fail(404, 'Payment not found.');
  if (current.status === 'completed' || current.status === 'failed') return current;
  if (current.gateway === 'giftedpay' && !current.checkoutRequestId) return current;
  const filter = { _id: paymentId, $or: [{ checkingUntil: { $exists: false } }, { checkingUntil: { $lt: new Date() } }] };
  if (!force) filter.nextCheckAt = { $not: { $gt: new Date() } };
  const claimed = await Payment.findOneAndUpdate(filter, { $set: { checkingUntil: new Date(Date.now() + 30000), nextCheckAt: new Date(Date.now() + 5000) } });
  if (!claimed) return current;
  try {
    let completed = false, failed = false, matches = false;
    if (current.gateway === 'giftedpay') {
      const result = await gifted('verify', { checkoutRequestId: current.checkoutRequestId });
      completed = result.success === true && result.status === 'completed';
      failed = ['failed', 'cancelled', 'timeout'].includes(result.status);
      const data = result.data;
      matches = !!data && data.checkout_request_id === current.checkoutRequestId
        && Number(data.amount) * 100 === current.payAmount && String(data.phone_number) === current.phone
        && Number(data.result_code) === 0 && !!data.mpesa_receipt_number;
    } else {
      const data = await paystack(`verify/${encodeURIComponent(current.reference)}`);
      completed = data.status === 'success';
      failed = ['failed', 'abandoned', 'reversed'].includes(data.status);
      const owner = await User.findById(current.user);
      matches = data.reference === current.reference && data.amount === current.payAmount
        && data.currency === current.payCurrency && data.channel === 'card'
        && typeof data.customer?.email === 'string' && data.customer.email.toLowerCase() === owner.email;
    }
    if (completed && !matches) {
      await Payment.updateOne({ _id: paymentId, status: { $ne: 'completed' } }, { $set: { status: 'review', failureReason: 'Provider payment details do not match the saved transaction.' } });
    } else if (completed) {
      await transaction(async session => {
        const payment = await Payment.findById(paymentId).session(session);
        if (payment.status === 'completed') return;
        const user = await User.findByIdAndUpdate(payment.user, { $inc: { balance: payment.amount } }, { new: true, session });
        if (!user) fail(409, 'Payment account not found.');
        await Transaction.create([{ user: user._id, type: 'deposit', amount: payment.amount, balanceAfter: user.balance, description: `${payment.gateway === 'giftedpay' ? 'M-Pesa' : 'Card'} wallet recharge`, reference: `deposit:${payment.reference}` }], { session });
        payment.status = 'completed';
        await payment.save({ session });
      });
    } else if (failed) {
      await Payment.updateOne({ _id: paymentId, status: { $nin: ['completed', 'review'] } }, { $set: { status: 'failed' } });
    }
    return await Payment.findById(paymentId);
  } finally { await Payment.updateOne({ _id: paymentId }, { $unset: { checkingUntil: '' } }); }
}
export const paymentsRouter = Router();
paymentsRouter.post('/', async (req, res) => {
  await rateCheck(`pay:${req.user._id}`, 10, 60000);
  const payment = await createPayment(req.user._id, req.body);
  res.status(201).json({ payment: paymentView(payment), ...(payment.authorizationUrl ? { authorizationUrl: payment.authorizationUrl } : {}), message: payment.gateway === 'giftedpay' ? 'Check your phone for the M-Pesa prompt. Verify payment before retrying.' : 'Continue to the card checkout page.' });
});
paymentsRouter.post('/:id/verify', async (req, res) => {
  await rateCheck(`verify:${req.user._id}`, 30, 60000);
  const payment = await Payment.findOne({ _id: objectId(req.params.id), user: req.user._id });
  if (!payment) fail(404, 'Payment not found.');
  const verified = await verifyPayment(payment._id);
  res.json({ payment: paymentView(verified), message: verified.status === 'completed' ? 'Payment verified. Wallet credited.' : `Payment status: ${verified.status}.` });
});
export async function walletData(req) {
  const [user, config, transactions, payments] = await Promise.all([
    User.findById(req.user._id), settings(),
    Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean(),
    Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean()
  ]);
  const gateway = user.country === 'KE' ? 'giftedpay' : 'paystack';
  const minimum = gateway === 'giftedpay' ? Math.ceil(config.minDeposit / 100) * 100 : Math.max(config.minDeposit, Math.ceil(100 * config.paystackToWalletRate));
  return { balance: user.balance, currency: config.walletCurrency, transactions: transactions.map(transactionView), payments: payments.map(paymentView), gateway, minDeposit: minimum, paystackCurrency: config.paystackCurrency, paystackToWalletRate: config.paystackToWalletRate };
}
