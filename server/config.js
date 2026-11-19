import { Settings, Audit } from './models.js';
import { decrypt } from './lib/security.js';
import { fail } from './lib/errors.js';
export const keyNames = ['shakergainsApiKey', 'resendApiKey', 'giftedpayApiKey', 'paystackSecretKey'];
const envKeys = { shakergainsApiKey: 'SHAKERGAINS_API_KEY', resendApiKey: 'RESEND_API_KEY', giftedpayApiKey: 'GIFTEDPAY_API_KEY', paystackSecretKey: 'PAYSTACK_SECRET_KEY' };
export const defaults = {
  siteName: 'ADEZ SMM', tagline: 'Your next chapter of growth starts here.', iconUrl: '', supportEmail: '',
  walletCurrency: 'KES', paystackCurrency: 'KES', minDeposit: 10000, announcement: '',
  registrationOpen: true, maintenance: false, providerToWalletRate: 0, paystackToWalletRate: 1,
  defaultMarkupPercent: 30, emailFrom: '', providerCurrency: '', lastSyncAt: null
};
export function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  return email && password ? { email, password } : null;
}
export async function settings() {
  return await Settings.findById('site').lean() || defaults;
}
export async function apiKey(name) {
  const config = await Settings.findById('site').select(`+${name}`).lean();
  if (config?.[name]) {
    try { return decrypt(config[name]); } catch { fail(503, 'Integration key cannot be decrypted. Restore the stable encryption secret or re-enter the API key.'); }
  }
  if (process.env[envKeys[name]]) return process.env[envKeys[name]];
  fail(503, `Configure ${name.replace('ApiKey', '').replace('SecretKey', '')} in admin settings before using this feature.`);
}
export async function configuredKeys() {
  const config = await Settings.findById('site').select(keyNames.map(k => `+${k}`).join(' ')).lean();
  const result = {};
  for (const [label, key] of Object.entries({ shakergains: 'shakergainsApiKey', resend: 'resendApiKey', giftedpay: 'giftedpayApiKey', paystack: 'paystackSecretKey' })) {
    result[label] = !!(config?.[key] || process.env[envKeys[key]]);
  }
  return result;
}
export function publicSettings(config, configured) {
  const keys = ['siteName', 'tagline', 'iconUrl', 'supportEmail', 'walletCurrency', 'paystackCurrency', 'minDeposit', 'announcement', 'registrationOpen', 'maintenance'];
  return { ...Object.fromEntries(keys.map(k => [k, config[k] ?? defaults[k]])), configured };
}
export async function audit(actor, action, target, detail, session) {
  await Audit.create([{ actor: String(actor), action, target: String(target), detail }], session ? { session } : {});
}
export function appUrl() {
  if (!process.env.APP_URL) fail(503, 'Configure APP_URL as the public HTTPS origin before using emails or payments.');
  let url;
  try { url = new URL(process.env.APP_URL); } catch { fail(503, 'APP_URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') fail(503, 'APP_URL must be a public HTTPS origin without a path.');
  return url.origin;
}
