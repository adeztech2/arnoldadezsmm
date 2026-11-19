import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import supertest from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../server/app.js';
import { connectDatabase } from '../server/db.js';
import { User, Settings, Service, Order, Payment, Transaction, Audit } from '../server/models.js';
import { setProviderFetchForTests } from '../server/providers.js';
import { hash, randomToken } from '../server/lib/security.js';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'integration-test-only-stable-session-secret-12345';
process.env.APP_URL = 'https://adez-test.example';
process.env.CRON_SECRET = 'test-only-cron-authorization';
let database, api, owner, customer, international, ownerId, customerId, serviceId;
let providerMode = 'normal', addCount = 0, paymentMismatch = false, partial = false, capturedPaystack, resetToken;
const paymentPayloads = new Map();
const testKeys = { shakergainsApiKey: 'shaker-test-key', giftedpayApiKey: 'giftedpay-test-key', paystackSecretKey: 'paystack-test-key', resendApiKey: 'resend-test-key' };
const response = data => ({ ok: true, status: 200, json: async () => data });
before(async () => {
  database = await MongoMemoryReplSet.create({ binary: { version: '8.0.5' }, replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 30000 }] });
  process.env.MONGODB_URI = database.getUri('adez_test');
  await connectDatabase();
  api = supertest(createApp());
  owner = supertest.agent(createApp()); customer = supertest.agent(createApp()); international = supertest.agent(createApp());
  setProviderFetchForTests(async (url, options) => {
    if (url.includes('shakergainske.com')) {
      const data = new URLSearchParams(options.body), action = data.get('action');
      if (action === 'balance') return response({ balance: '20', currency: 'USD' });
      if (action === 'services') return response([
        { service: 10, name: 'Instagram views', category: 'Instagram', type: 'Default', rate: '1', min: 10, max: 100000, refill: true, cancel: true },
        { services: 11, name: 'Video comments', Category: 'YouTube', type: 'Custom Comments', rate: '2', min: 1, max: 1000, refill: false, cancel: false },
        { service: 12, name: 'Future type', category: 'Other', type: 'Unknown', rate: '1', min: 1, max: 100 }
      ]);
      if (action === 'add') {
        addCount++;
        if (providerMode === 'timeout') throw new Error('Simulated request timeout');
        if (providerMode === 'rejected') return response({ error: 'Insufficient provider balance' });
        return response({ order: 90000 + addCount });
      }
      if (action === 'status') return response({ charge: partial ? '0.5' : '1', currency: 'USD', start_count: '100', status: partial ? 'Partial' : 'Completed', remains: partial ? '500' : '0' });
      if (action === 'cancel' || action === 'refill') return response({ success: 'Request received' });
    }
    if (url.endsWith('/payments/process')) {
      const payload = JSON.parse(options.body), id = `ws_CO_${randomUUID()}`;
      paymentPayloads.set(id, payload);
      return response({ success: true, checkout_request_id: id });
    }
    if (url.endsWith('/payments/verify')) {
      const id = JSON.parse(options.body).checkoutRequestId, payload = paymentPayloads.get(id);
      return response({ success: true, status: 'completed', data: { checkout_request_id: id, phone_number: payload.phone_number, amount: paymentMismatch ? payload.amount + 1 : payload.amount, result_code: 0, mpesa_receipt_number: 'TEST123456' } });
    }
    if (url.endsWith('/transaction/initialize')) {
      capturedPaystack = JSON.parse(options.body);
      paymentPayloads.set(capturedPaystack.reference, capturedPaystack);
      return response({ status: true, data: { reference: capturedPaystack.reference, authorization_url: 'https://checkout.paystack.com/test-checkout' } });
    }
    if (url.includes('/transaction/verify/')) {
      const reference = decodeURIComponent(url.split('/').at(-1)), data = paymentPayloads.get(reference);
      return response({ status: true, data: { reference, status: 'success', amount: paymentMismatch ? data.amount + 1 : data.amount, currency: data.currency, channel: 'card', customer: { email: data.email } } });
    }
    if (url === 'https://api.resend.com/emails') {
      const payload = JSON.parse(options.body);
      resetToken = payload.text.match(/token=([a-f0-9]+)/)[1];
      return response({ id: 'email-test-id' });
    }
    throw new Error(`Unexpected mocked provider endpoint: ${url}`);
  });
});
after(async () => {
  await mongoose.disconnect();
  if (database) await database.stop();
});
async function mutate(agent, method, route, body = {}) {
  const csrf = await agent.get('/smm-api/auth/csrf');
  return await agent[method](`/smm-api${route}`).set('X-CSRF-Token', csrf.body.csrfToken).send(body);
}
test('public settings explicitly expose setup readiness without secret leakage', async () => {
  const res = await api.get('/smm-api/public/settings');
  assert.equal(res.status, 200); assert.equal(res.body.configured, true);
  assert.equal(res.body.siteName, 'ADEZ SMM');
  assert.equal(res.body.shakergainsApiKey, undefined);
});
test('registration assigns exactly one first-account super administrator', async () => {
  const res = await mutate(owner, 'post', '/auth/register', { name: 'Owner', email: 'owner@example.org', password: 'Owner test password long', country: 'KE', role: 'super_admin', balance: 999999 });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.user.role, 'super_admin'); assert.equal(res.body.user.balance, 0);
  ownerId = res.body.user.id;
  const register = await mutate(customer, 'post', '/auth/register', { name: 'Customer', email: 'customer@example.org', password: 'Customer test password long', country: 'KE', role: 'super_admin' });
  assert.equal(register.status, 201, JSON.stringify(register.body));
  assert.equal(register.body.user.role, 'user'); customerId = register.body.user.id;
  const foreign = await mutate(international, 'post', '/auth/register', { name: 'International', email: 'international@example.org', password: 'International test password long', country: 'US' });
  assert.equal(foreign.status, 201);
  assert.equal(await User.countDocuments({ role: 'super_admin' }), 1);
});
test('concurrent registrations never grant additional super administrator roles', async () => {
  const agents = [supertest.agent(createApp()), supertest.agent(createApp())];
  const results = await Promise.all(agents.map((agent, index) => mutate(agent, 'post', '/auth/register', { name: `Concurrent ${index}`, email: `concurrent${index}@example.org`, password: 'Concurrent test password long', country: 'KE' })));
  assert.ok(results.every(result => result.status === 201));
  assert.equal(await User.countDocuments({ role: 'super_admin' }), 1);
});
test('CSRF, ownership and administrator authorization reject unsafe requests', async () => {
  assert.equal((await owner.patch('/smm-api/admin/settings').send({ siteName: 'Attack' })).status, 403);
  assert.equal((await mutate(customer, 'patch', '/admin/settings', { siteName: 'Attack' })).status, 403);
  assert.equal((await mutate(owner, 'patch', '/admin/users/' + ownerId, { role: 'user' })).status, 409);
  assert.equal((await api.get('/smm-api/dashboard')).status, 401);
  const csrf = await owner.get('/smm-api/auth/csrf');
  const crossSite = await owner.patch('/smm-api/admin/settings').set('X-CSRF-Token', csrf.body.csrfToken).set('Origin', 'https://attacker.example').send({ siteName: 'Attack' });
  assert.equal(crossSite.status, 403);
});
test('super administrator configures encrypted API keys and conversion rates', async () => {
  const res = await mutate(owner, 'patch', '/admin/settings', { ...testKeys, providerToWalletRate: 130, emailFrom: 'no-reply@example.org' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const stored = await Settings.findById('site').select('+shakergainsApiKey');
  assert.notEqual(stored.shakergainsApiKey, testKeys.shakergainsApiKey);
  const exposed = await owner.get('/smm-api/admin/settings');
  assert.equal(exposed.body.integrations.shakergains, true);
  assert.ok(!JSON.stringify(exposed.body).includes(testKeys.shakergainsApiKey));
  assert.ok(!JSON.stringify(await Audit.find().lean()).includes(testKeys.resendApiKey));
});
test('sync imports all available platforms, marks unsupported types, and exposes cost only to admin', async () => {
  const sync = await mutate(owner, 'post', '/admin/services/sync');
  assert.equal(sync.status, 200, JSON.stringify(sync.body)); assert.equal(sync.body.count, 3);
  const admin = await owner.get('/smm-api/admin/services');
  assert.equal(admin.body.services.length, 3);
  const service = admin.body.services.find(s => s.providerId === '10');
  serviceId = service.id;
  assert.equal(service.providerRate, 1); assert.equal(service.costRate, 130);
  assert.equal(admin.body.services.find(s => s.providerId === '12').supported, false);
  const enabled = await mutate(owner, 'patch', `/admin/services/${serviceId}`, { sellingRate: 200, enabled: true });
  assert.equal(enabled.status, 200);
  const catalog = await api.get('/smm-api/services');
  assert.equal(catalog.body.services.length, 1);
  assert.equal(catalog.body.services[0].providerRate, undefined);
  assert.equal(catalog.body.services[0].rate, 200);
});
test('catalog refresh preserves operator prices and enabled state', async () => {
  await mutate(owner, 'post', '/admin/services/sync');
  const service = await Service.findById(serviceId);
  assert.equal(service.sellingRate, 200); assert.equal(service.enabled, true);
});
test('M-Pesa verification credits the wallet exactly once even when concurrently retried', async () => {
  const create = await mutate(customer, 'post', '/payments', { amount: 100000, phone: '0712345678', idempotencyKey: randomUUID() });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  assert.equal(create.body.payment.gateway, 'giftedpay');
  const id = create.body.payment.id;
  const csrf = await customer.get('/smm-api/auth/csrf');
  const token = csrf.body.csrfToken;
  await new Promise(resolve => setTimeout(resolve, 5100));
  const responses = await Promise.all([1, 2, 3].map(() => customer.post(`/smm-api/payments/${id}/verify`).set('X-CSRF-Token', token).send({})));
  assert.ok(responses.every(r => r.status === 200), JSON.stringify(responses.map(r => r.body)));
  assert.equal((await User.findById(customerId)).balance, 100000);
  assert.equal(await Transaction.countDocuments({ type: 'deposit', user: customerId }), 1);
  assert.equal((await mutate(owner, 'post', `/payments/${id}/verify`)).status, 404);
});
test('non-Kenyan payment opens hosted checkout restricted to the card channel', async () => {
  const payment = await mutate(international, 'post', '/payments', { amount: 10000, idempotencyKey: randomUUID() });
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  assert.equal(payment.body.authorizationUrl, 'https://checkout.paystack.com/test-checkout');
  assert.deepEqual(capturedPaystack.channels, ['card']);
  assert.equal(capturedPaystack.amount, 10000); assert.equal(capturedPaystack.currency, 'KES');
  assert.ok(capturedPaystack.callback_url.startsWith('https://adez-test.example/wallet?reference='));
});
test('valid Paystack webhook verifies transaction and duplicate callbacks cannot duplicate credit', async () => {
  const payload = { event: 'charge.success', data: { reference: capturedPaystack.reference } };
  const raw = JSON.stringify(payload), signature = createHmac('sha512', testKeys.paystackSecretKey).update(raw).digest('hex');
  assert.equal((await api.post('/smm-api/webhooks/paystack').set('Content-Type', 'application/json').set('X-Paystack-Signature', signature).send(raw)).status, 200);
  assert.equal((await api.post('/smm-api/webhooks/paystack').set('Content-Type', 'application/json').set('X-Paystack-Signature', signature).send(raw)).status, 200);
  const user = await User.findOne({ email: 'international@example.org' });
  assert.equal(user.balance, 10000);
  assert.equal((await api.post('/smm-api/webhooks/paystack').set('Content-Type', 'application/json').set('X-Paystack-Signature', 'spoofed').send(raw)).status, 401);
});
test('mismatched verified payment is held for review without wallet credit', async () => {
  const previous = (await User.findById(customerId)).balance;
  const created = await mutate(customer, 'post', '/payments', { amount: 10000, phone: '0712345678', idempotencyKey: randomUUID() });
  const id = created.body.payment.id;
  await Payment.updateOne({ _id: id }, { $set: { nextCheckAt: new Date(0) } });
  paymentMismatch = true;
  const checked = await mutate(customer, 'post', `/payments/${id}/verify`);
  paymentMismatch = false;
  assert.equal(checked.status, 200); assert.equal(checked.body.payment.status, 'review');
  assert.equal((await User.findById(customerId)).balance, previous);
});
test('orders reserve funds atomically, and replay with same key submits once', async () => {
  const key = randomUUID(), input = { serviceId, quantity: 1000, link: 'https://instagram.com/p/test', fields: {}, idempotencyKey: key };
  const beforeBalance = (await User.findById(customerId)).balance, beforeAdds = addCount;
  const a = await mutate(customer, 'post', '/orders', input);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  const b = await mutate(customer, 'post', '/orders', input);
  assert.equal(b.body.order.id, a.body.order.id);
  assert.equal(addCount, beforeAdds + 1);
  assert.equal((await User.findById(customerId)).balance, beforeBalance - 20000);
  assert.equal((await mutate(customer, 'post', '/orders', { ...input, quantity: 2000 })).status, 409);
  assert.equal((await owner.get('/smm-api/orders/' + a.body.order.id)).status, 404);
});
test('simultaneous unique orders cannot overspend a wallet', async () => {
  await User.updateOne({ _id: customerId }, { $set: { balance: 20000 } });
  const csrf = await customer.get('/smm-api/auth/csrf');
  const requests = await Promise.all([1, 2].map(index => customer.post('/smm-api/orders').set('X-CSRF-Token', csrf.body.csrfToken).send({ serviceId, quantity: 1000, link: `https://example.org/post/${index}`, fields: {}, idempotencyKey: randomUUID() })));
  assert.equal(requests.filter(r => r.status === 201).length, 1);
  assert.equal(requests.filter(r => r.status === 409).length, 1);
  assert.equal((await User.findById(customerId)).balance, 0);
  await User.updateOne({ _id: customerId }, { $set: { balance: 100000 } });
});
test('confirmed provider rejection refunds once, while a timeout holds funds for review', async () => {
  const input = { serviceId, quantity: 1000, link: 'https://example.org/post', fields: {} };
  const beforeBalance = (await User.findById(customerId)).balance;
  providerMode = 'rejected';
  const rejected = await mutate(customer, 'post', '/orders', { ...input, idempotencyKey: randomUUID() });
  assert.equal(rejected.body.order.status, 'Failed'); assert.equal(rejected.body.order.refundAmount, 20000);
  assert.equal((await User.findById(customerId)).balance, beforeBalance);
  providerMode = 'timeout';
  const uncertain = await mutate(customer, 'post', '/orders', { ...input, idempotencyKey: randomUUID() });
  providerMode = 'normal';
  assert.equal(uncertain.body.order.status, 'Submission uncertain');
  assert.equal(uncertain.body.order.refundAmount, 0);
  assert.equal((await User.findById(customerId)).balance, beforeBalance - 20000);
  const resolved = await mutate(owner, 'post', `/admin/orders/${uncertain.body.order.id}/resolve`, { confirmNotSubmitted: true, reason: 'Checked upstream account and no order exists.' });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body)); assert.equal(resolved.body.order.refundAmount, 20000);
});
test('partial status returns unused quantity to wallet and computes remaining cost', async () => {
  const created = await mutate(customer, 'post', '/orders', { serviceId, quantity: 1000, link: 'https://example.org/partial', fields: {}, idempotencyKey: randomUUID() });
  assert.equal(created.status, 201);
  const id = created.body.order.id;
  await Order.updateOne({ _id: id }, { $set: { nextCheckAt: new Date(0) } });
  partial = true;
  const checked = await mutate(customer, 'post', `/orders/${id}/refresh`);
  partial = false;
  assert.equal(checked.status, 200, JSON.stringify(checked.body)); assert.equal(checked.body.order.status, 'Partial');
  assert.equal(checked.body.order.refundAmount, 10000);
  const order = await Order.findById(id);
  assert.equal(order.providerCost, 6500);
  await mutate(customer, 'post', `/orders/${id}/refresh`);
  assert.equal(await Transaction.countDocuments({ reference: `refund:${id}:10000` }), 1);
});
test('bulk orders return per-row results without hiding failures or resubmitting successes', async () => {
  const key = randomUUID(), input = { idempotencyKey: key, orders: [{ serviceId, quantity: 10, link: 'https://example.org/bulk', fields: {} }, { serviceId, quantity: -1, link: 'https://example.org/bad', fields: {} }] };
  const a = await mutate(customer, 'post', '/orders/bulk', input);
  assert.equal(a.status, 200); assert.ok(a.body.results[0].order); assert.ok(a.body.results[1].error);
  const beforeAdds = addCount;
  const b = await mutate(customer, 'post', '/orders/bulk', input);
  assert.equal(b.body.results[0].order.id, a.body.results[0].order.id); assert.equal(addCount, beforeAdds);
});
test('customer dashboard, wallet history and admin profitability reflect persistent records', async () => {
  const dashboard = await customer.get('/smm-api/dashboard');
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body)); assert.ok(dashboard.body.stats.totalOrders > 0);
  const wallet = await customer.get('/smm-api/wallet'); assert.ok(wallet.body.transactions.length > 0);
  const summary = await owner.get('/smm-api/admin/summary');
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.equal(summary.body.stats.profit, summary.body.stats.revenue - summary.body.stats.providerCost - summary.body.stats.refunds);
  assert.ok(summary.body.byService.length > 0);
});
test('account country becomes immutable after financial activity', async () => {
  const res = await mutate(customer, 'patch', '/account', { country: 'US', name: 'Customer renamed' });
  assert.equal(res.status, 409);
  assert.equal((await User.findById(customerId)).country, 'KE');
});
test('admin adjustments are idempotent and changed requests cannot reuse identifiers', async () => {
  const balance = (await User.findById(customerId)).balance;
  const body = { amount: 5000, reason: 'Test adjustment for wallet reconciliation', idempotencyKey: randomUUID() };
  assert.equal((await mutate(owner, 'post', `/admin/users/${customerId}/balance`, body)).status, 200);
  assert.equal((await mutate(owner, 'post', `/admin/users/${customerId}/balance`, body)).status, 200);
  assert.equal((await User.findById(customerId)).balance, balance + 5000);
  assert.equal((await mutate(owner, 'post', `/admin/users/${customerId}/balance`, { ...body, amount: 7000 })).status, 409);
  assert.equal((await mutate(customer, 'post', `/admin/users/${customerId}/balance`, body)).status, 403);
});
test('administrator partial-order refunds target an absolute total, safely capped and retryable', async () => {
  const order = await Order.findOne({ status: 'Partial', user: customerId });
  const body = { totalRefundAmount: 15000, reason: 'Refund test remaining support allowance' };
  const beforeBalance = (await User.findById(customerId)).balance;
  assert.equal((await mutate(owner, 'post', `/admin/orders/${order._id}/refund`, body)).status, 200);
  assert.equal((await mutate(owner, 'post', `/admin/orders/${order._id}/refund`, body)).status, 200);
  assert.equal((await User.findById(customerId)).balance, beforeBalance + 5000);
  assert.equal((await mutate(owner, 'post', `/admin/orders/${order._id}/refund`, { ...body, totalRefundAmount: order.charge + 1 })).status, 400);
});
test('password reset uses Resend, hashes token at rest, is one-time and invalidates existing sessions', async () => {
  const anonymous = supertest.agent(createApp());
  const res = await mutate(anonymous, 'post', '/auth/forgot', { email: 'customer@example.org' });
  assert.equal(res.status, 200); assert.ok(resetToken);
  const record = await User.findById(customerId).select('+resetHash');
  assert.equal(record.resetHash, hash(resetToken)); assert.notEqual(record.resetHash, resetToken);
  const reset = await mutate(anonymous, 'post', '/auth/reset', { token: resetToken, password: 'Changed test password long' });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal((await mutate(anonymous, 'post', '/auth/reset', { token: resetToken, password: 'Another test password long' })).status, 400);
  assert.equal((await customer.get('/smm-api/auth/me')).body.user, null);
  assert.equal((await mutate(customer, 'post', '/auth/login', { email: 'customer@example.org', password: 'Changed test password long' })).status, 200);
});
test('scheduler requires bearer authorization and returns reconciliation results', async () => {
  assert.equal((await api.get('/smm-api/jobs/cron')).status, 401);
  const result = await api.get('/smm-api/jobs/cron').set('Authorization', 'Bearer test-only-cron-authorization');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(typeof result.body.ordersChecked, 'number');
});
test('login rejects NoSQL-shaped inputs, generic invalid credentials, and protects server files', async () => {
  const anonymous = supertest.agent(createApp());
  assert.equal((await mutate(anonymous, 'post', '/auth/login', { email: { $ne: null }, password: 'whatever' })).status, 400);
  assert.equal((await mutate(anonymous, 'post', '/auth/login', { email: 'owner@example.org', password: 'incorrect password' })).status, 401);
  const result = await api.get('/server/config.js');
  assert.ok(!result.text.includes('export async function apiKey'));
});
