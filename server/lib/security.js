import { randomBytes, createHash, createHmac, timingSafeEqual, scrypt as scryptCallback, hkdfSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError, fail } from './errors.js';

const scrypt = promisify(scryptCallback);
export const hash = value => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
export function secret() {
  const key = process.env.SESSION_SECRET;
  if (!key || key.length < 32) throw new AppError(503, 'A stable SESSION_SECRET of at least 32 characters is required.');
  return key;
}
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function passwordRule(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail(400, 'Password must contain 12 to 128 characters.');
  return password;
}
export async function hashPassword(password) {
  passwordRule(password);
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${derived.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128 || !encoded) return false;
  const [salt, digest] = encoded.split(':');
  const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return equal(derived.toString('hex'), digest);
}
function encryptionKey() {
  return Buffer.from(hkdfSync('sha256', process.env.SETTINGS_ENCRYPTION_KEY || secret(), 'adez-smm', 'settings-v1', 32));
}
export function encrypt(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const content = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), content].map(b => b.toString('base64')).join('.');
}
export function decrypt(value) {
  const [iv, tag, content] = value.split('.').map(x => Buffer.from(x, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8');
}
export function secureCookie(req) {
  return process.env.NODE_ENV === 'production' || req.secure || req.get('x-forwarded-proto') === 'https';
}
export const cookieOptions = req => ({ httpOnly: true, secure: secureCookie(req), sameSite: 'lax', path: '/' });
export function issueCsrf(req, res) {
  const token = randomToken();
  const signature = createHmac('sha256', secret()).update(token).digest('hex');
  res.cookie('adez_csrf', `${token}.${signature}`, { ...cookieOptions(req), maxAge: 12 * 3600000 });
  return token;
}
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie = req.cookies.adez_csrf;
  const token = req.get('x-csrf-token');
  const [stored, signature] = typeof cookie === 'string' ? cookie.split('.') : [];
  if (!stored || !equal(stored, token) || !equal(signature, createHmac('sha256', secret()).update(stored).digest('hex'))) {
    return next(new AppError(403, 'Your CSRF security token expired. Please reload and try again.'));
  }
  const origin = req.get('origin');
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { return next(new AppError(403, 'Invalid request origin.')); }
    const expected = process.env.APP_URL ? new URL(process.env.APP_URL).host : req.get('host');
    if (host !== expected) return next(new AppError(403, 'Cross-site request blocked.'));
  }
  next();
}
export function signatureValid(rawBody, signature, key) {
  return equal(createHmac('sha512', key).update(rawBody).digest('hex'), signature);
}
