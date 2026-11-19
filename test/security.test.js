import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hashPassword, verifyPassword, encrypt, decrypt, signatureValid, passwordRule, hash } from '../server/lib/security.js';
import { typeInfo, normalizeOrder, orderPrice } from '../server/services.js';
import { paymentConversion, kenyaPhone } from '../server/payments.js';
import { requestDigest, normalizedStatus } from '../server/orders.js';
import { countryCode } from '../server/auth.js';

process.env.SESSION_SECRET = 'unit-test-only-session-secret-not-production-12345';
test('password hashes are salted and verify without storing plaintext', async () => {
  const password = 'Correct horse battery staple';
  const a = await hashPassword(password), b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword('wrong password', a), false);
  assert.equal(a.includes(password), false);
});
test('password policy rejects short and excessively long inputs', () => {
  assert.throws(() => passwordRule('short'));
  assert.throws(() => passwordRule('x'.repeat(129)));
  assert.equal(passwordRule('a'.repeat(12)), 'a'.repeat(12));
});
test('integration encryption authenticates ciphertext and detects tampering', () => {
  const encrypted = encrypt('test-provider-key');
  assert.equal(decrypt(encrypted), 'test-provider-key');
  assert.equal(encrypted.includes('test-provider-key'), false);
  const parts = encrypted.split('.');
  parts[2] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decrypt(parts.join('.')));
});
test('Paystack webhook signature requires exact raw bytes', () => {
  const raw = Buffer.from('{"event":"charge.success"}');
  const signature = createHmac('sha512', 'test-key').update(raw).digest('hex');
  assert.equal(signatureValid(raw, signature, 'test-key'), true);
  assert.equal(signatureValid(Buffer.from('{}'), signature, 'test-key'), false);
  assert.equal(signatureValid(raw, undefined, 'test-key'), false);
});
test('money pricing uses integer minor units and rounds charges upward', () => {
  const service = { available: true, enabled: true, supported: true, sellingRate: 0.3333, providerRate: 0.1, providerCurrency: 'USD', pricingUnit: '1000' };
  const result = orderPrice(service, { providerCurrency: 'USD', providerToWalletRate: 130 }, 100);
  assert.deepEqual(result, { charge: 4, providerCost: 130 });
  assert.throws(() => orderPrice({ ...service, enabled: false }, {}, 100));
  assert.throws(() => orderPrice(service, { providerCurrency: 'USD', providerToWalletRate: 0 }, 100));
});
test('package price is not divided by 1000', () => {
  const result = orderPrice({ available: true, enabled: true, supported: true, sellingRate: 50, providerRate: 1, providerCurrency: 'USD', pricingUnit: 'package' }, { providerCurrency: 'USD', providerToWalletRate: 130 }, 1);
  assert.deepEqual(result, { charge: 5000, providerCost: 13000 });
});
test('custom comments quantity comes from non-empty comment lines', () => {
  const service = { ...typeInfo('Custom Comments'), type: 'Custom Comments', min: 2, max: 10 };
  const result = normalizeOrder({ link: 'https://example.org/post', quantity: 999, fields: { comments: 'First\n\nSecond' } }, service);
  assert.equal(result.quantity, 2);
  assert.equal(result.payload.key, undefined);
});
test('poll validates the answer number and link protocol', () => {
  const service = { ...typeInfo('Poll'), type: 'Poll', min: 10, max: 1000 };
  assert.equal(normalizeOrder({ link: 'https://example.org/post', quantity: 10, fields: { answer_number: '2' } }, service).payload.answer_number, 2);
  assert.throws(() => normalizeOrder({ link: 'javascript:alert(1)', quantity: 10, fields: { answer_number: '2' } }, service));
  assert.throws(() => normalizeOrder({ link: 'https://example.org', quantity: 10, fields: { answer_number: {} } }, service));
});
test('unknown service types are not silently treated as default', () => {
  assert.equal(typeInfo('Subscriptions').supported, false);
  assert.equal(typeInfo('Default').supported, true);
  assert.equal(typeInfo('Custom Comments Package').pricingUnit, 'package');
});
test('phone validation normalizes Kenyan local formats', () => {
  assert.equal(kenyaPhone('0712 345 678'), '254712345678');
  assert.equal(kenyaPhone('+254112345678'), '254112345678');
  assert.throws(() => kenyaPhone('+15555555555'));
  assert.throws(() => kenyaPhone({}));
});
test('payment conversion binds wallet amount to configured currency rate', () => {
  assert.deepEqual(paymentConversion(13000, { minDeposit: 10000, paystackToWalletRate: 130, paystackCurrency: 'USD' }, 'paystack'), { payAmount: 100, payCurrency: 'USD', exchangeRate: 130 });
  assert.throws(() => paymentConversion(10001, { minDeposit: 10000 }, 'giftedpay'));
  assert.throws(() => paymentConversion(-1, { minDeposit: 100 }, 'giftedpay'));
});
test('country codes validate actual regions and cannot be objects', () => {
  assert.equal(countryCode('ke'), 'KE');
  assert.equal(countryCode('US'), 'US');
  assert.throws(() => countryCode('ZZ'));
  assert.throws(() => countryCode({ $ne: 'KE' }));
});
test('request fingerprints are key-order independent and status mapping is conservative', () => {
  assert.equal(requestDigest({ b: 1, fields: { y: 2, x: 1 } }), requestDigest({ fields: { x: 1, y: 2 }, b: 1 }));
  assert.notEqual(hash('first'), hash('second'));
  assert.equal(normalizedStatus('cancelled'), 'Canceled');
  assert.equal(normalizedStatus('In progress'), 'In progress');
  assert.equal(normalizedStatus('magic success'), null);
});
