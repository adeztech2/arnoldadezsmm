import { apiKey, appUrl } from './config.js';
import { AppError } from './lib/errors.js';
let fetcher = (...args) => fetch(...args);
export function setProviderFetchForTests(value) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test adapter is disabled outside tests.');
  fetcher = value;
}
async function request(url, options, mayMutate = false) {
  let response;
  try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(18000), redirect: 'error' }); }
  catch { throw new AppError(502, 'Provider connection failed. Please check the request status before trying again.', { uncertain: mayMutate }); }
  let result;
  try { result = await response.json(); } catch { throw new AppError(502, 'Provider returned an invalid response.', { uncertain: mayMutate }); }
  if (!response.ok) throw new AppError(502, 'Provider rejected the request. Check credentials, account status and provider limits.', { uncertain: mayMutate && response.status >= 500 });
  return result;
}
export async function shaker(action, fields = {}) {
  const key = await apiKey('shakergainsApiKey');
  const result = await request('https://shakergainske.com/api/v2', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key, action, ...fields }).toString()
  }, action === 'add');
  if (result.error) throw new AppError(422, `Service provider: ${String(result.error).slice(0, 200)}`);
  return result;
}
export async function gifted(path, payload) {
  const key = await apiKey('giftedpayApiKey');
  const result = await request(`https://mpesa.gifted.co.ke/api/payments/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(payload)
  }, path === 'process');
  if (path === 'process' && (!result.success || !result.checkout_request_id)) throw new AppError(422, 'M-Pesa initiation was rejected. Check your phone number and GiftedPay account.');
  return result;
}
export async function paystack(path, payload) {
  const key = await apiKey('paystackSecretKey');
  const result = await request(`https://api.paystack.co/transaction/${path}`, {
    method: payload ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  }, !!payload);
  if (!result.status || !result.data) throw new AppError(422, 'Paystack could not process this request.');
  return result.data;
}
export async function sendResetEmail(email, token, config) {
  const key = await apiKey('resendApiKey');
  if (!config.emailFrom) throw new AppError(503, 'Configure a verified Resend sender in admin settings.');
  const url = `${appUrl()}/reset-password?token=${token}`;
  const result = await request('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.emailFrom, to: [email], subject: `${config.siteName} password reset`, text: `A password reset was requested for your account.\n\nOpen ${url}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email.` })
  });
  if (!result.id) throw new AppError(502, 'Password reset email could not be sent.');
}
