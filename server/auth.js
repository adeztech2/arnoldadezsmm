import { Router } from 'express';
import { User, Session, Settings, RateLimit, Payment, Order } from './models.js';
import { connectDatabase, transaction } from './db.js';
import { AppError, fail, text, object } from './lib/errors.js';
import { hash, randomToken, hashPassword, verifyPassword, issueCsrf, cookieOptions } from './lib/security.js';
import { settings, apiKey, appUrl, audit } from './config.js';
import { userView } from './serializers.js';
import { sendResetEmail } from './providers.js';

function emailAddress(value) {
  const email = text(value, 'Email', 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
  return email;
}
export function countryCode(value) {
  const code = text(value, 'Country', 2, 2).toUpperCase();
  try { if (new Intl.DisplayNames(['en'], { type: 'region' }).of(code) === code) fail(400, 'Select a valid country.'); }
  catch { fail(400, 'Select a valid country.'); }
  if (!/^[A-Z]{2}$/.test(code) || ['ZZ', 'EU', 'UN', 'XA', 'XB'].includes(code)) fail(400, 'Select a valid country.');
  return code;
}
export async function rateCheck(key, max, windowMs = 900000) {
  const bucket = Math.floor(Date.now() / windowMs);
  const record = await RateLimit.findOneAndUpdate({ _id: `${hash(key)}:${bucket}` }, {
    $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) }
  }, { upsert: true, new: true });
  if (record.count > max) fail(429, 'Too many attempts. Please wait before trying again.');
}
export async function loadUser(req) {
  if (!req.cookies.adez_session) return null;
  const session = await Session.findOne({ tokenHash: hash(req.cookies.adez_session), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await User.findById(session.user);
  if (!user || user.disabled || user.authVersion !== session.authVersion) return null;
  return user;
}
export async function requireUser(req, res, next) {
  try {
    const user = await loadUser(req);
    if (!user) fail(401, 'Please sign in to continue.');
    req.user = user;
    next();
  } catch (error) { next(error); }
}
export function requireAdmin(req, res, next) {
  if (!['admin', 'super_admin'].includes(req.user?.role)) return next(new AppError(403, 'Administrator access is required.'));
  next();
}
export function requireSuper(req, res, next) {
  if (req.user?.role !== 'super_admin') return next(new AppError(403, 'Super administrator access is required.'));
  next();
}
async function issueSession(req, res, user) {
  const token = randomToken();
  await Session.create({ tokenHash: hash(token), user: user._id, authVersion: user.authVersion, expiresAt: new Date(Date.now() + 7 * 86400000) });
  res.cookie('adez_session', token, { ...cookieOptions(req), maxAge: 7 * 86400000 });
  issueCsrf(req, res);
}
export const authRouter = Router();
authRouter.get('/csrf', (req, res) => { res.json({ csrfToken: issueCsrf(req, res) }); });
authRouter.get('/me', async (req, res) => {
  if (!req.cookies.adez_session) return res.json({ user: null });
  await connectDatabase();
  const user = await loadUser(req);
  res.json({ user: user ? userView(user) : null });
});
authRouter.post('/register', async (req, res) => {
  await connectDatabase();
  await rateCheck(`register:${req.ip}`, 8);
  const input = object(req.body);
  const email = emailAddress(input.email), name = text(input.name, 'Name', 2, 80), country = countryCode(input.country);
  const config = await settings();
  if (!config.registrationOpen || config.maintenance) fail(503, 'Registration is temporarily unavailable.');
  const passwordHash = await hashPassword(input.password);
  let user;
  try {
    user = await transaction(async session => {
      const first = await Settings.findOneAndUpdate({ _id: 'site', firstUserRegistered: false },
        { $set: { firstUserRegistered: true } }, { session, new: true });
      const [created] = await User.create([{ email, name, country, passwordHash, role: first ? 'super_admin' : 'user' }], { session });
      await audit(created._id, 'account.registered', created._id, first ? 'First account became super administrator.' : 'Account created.', session);
      return created;
    });
  } catch (error) {
    if (error.code === 11000) fail(409, 'This account could not be registered. Try signing in or recovering your password.');
    throw error;
  }
  await issueSession(req, res, user);
  res.status(201).json({ user: userView(user) });
});
authRouter.post('/login', async (req, res) => {
  await connectDatabase();
  await rateCheck(`login:${req.ip}`, 15);
  const email = emailAddress(req.body.email);
  await rateCheck(`login-account:${email}`, 10);
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || user.disabled || !await verifyPassword(req.body.password, user.passwordHash)) fail(401, 'Email or password is incorrect.');
  await issueSession(req, res, user);
  res.json({ user: userView(user) });
});
authRouter.post('/logout', async (req, res) => {
  if (req.cookies.adez_session) {
    await connectDatabase();
    await Session.deleteOne({ tokenHash: hash(req.cookies.adez_session) });
  }
  res.clearCookie('adez_session', cookieOptions(req));
  issueCsrf(req, res);
  res.json({ message: 'You have signed out.' });
});
authRouter.post('/forgot', async (req, res) => {
  await connectDatabase();
  await rateCheck(`reset:${req.ip}`, 6);
  const email = emailAddress(req.body.email);
  await rateCheck(`reset-account:${email}`, 3);
  const config = await settings();
  await apiKey('resendApiKey'); appUrl();
  if (!config.emailFrom) fail(503, 'Password recovery requires a verified Resend sender.');
  const user = await User.findOne({ email, disabled: false });
  if (user) {
    const token = randomToken();
    await User.updateOne({ _id: user._id }, { $set: { resetHash: hash(token), resetExpires: new Date(Date.now() + 1800000) } });
    try { await sendResetEmail(email, token, config); }
    catch (error) {
      await User.updateOne({ _id: user._id, resetHash: hash(token) }, { $unset: { resetHash: '', resetExpires: '' } });
      req.log.warn({ status: error.status }, 'Reset email delivery failed');
    }
  }
  res.json({ message: 'If an eligible account exists, a password reset link will be sent.' });
});
authRouter.post('/reset', async (req, res) => {
  await connectDatabase();
  await rateCheck(`reset-use:${req.ip}`, 10);
  const token = text(req.body.token, 'Reset token', 64, 64);
  const passwordHash = await hashPassword(req.body.password);
  const updated = await User.findOneAndUpdate({ resetHash: hash(token), resetExpires: { $gt: new Date() }, disabled: false }, {
    $set: { passwordHash }, $unset: { resetHash: '', resetExpires: '' }, $inc: { authVersion: 1 }
  });
  if (!updated) fail(400, 'This password reset link has expired or was already used.');
  await Session.deleteMany({ user: updated._id });
  res.json({ message: 'Password updated. Please sign in with your new password.' });
});
export const accountRouter = Router();
accountRouter.patch('/', async (req, res) => {
  const input = object(req.body), update = {};
  if (input.name !== undefined) update.name = text(input.name, 'Name', 2, 80);
  if (input.country !== undefined) update.country = countryCode(input.country);
  const updated = await transaction(async session => {
    // Touch user first: serialize country changes with wallet/order reservations.
    const user = await User.findOneAndUpdate({ _id: req.user._id }, { $inc: { mutationRevision: 1 } }, { new: true, session });
    if (update.country && update.country !== user.country) {
      if (await Payment.exists({ user: user._id }).session(session) || await Order.exists({ user: user._id }).session(session)) fail(409, 'Country cannot change after a payment or order. Contact support.');
    }
    return await User.findByIdAndUpdate(user._id, { $set: update }, { new: true, session, runValidators: true });
  });
  res.json({ user: userView(updated) });
});
accountRouter.post('/password', async (req, res) => {
  await rateCheck(`password:${req.user._id}`, 8);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!await verifyPassword(req.body.currentPassword, user.passwordHash)) fail(400, 'Current password is incorrect.');
  const passwordHash = await hashPassword(req.body.password);
  const updated = await User.findOneAndUpdate({ _id: user._id, authVersion: user.authVersion }, {
    $set: { passwordHash }, $inc: { authVersion: 1 }, $unset: { resetHash: '', resetExpires: '' }
  }, { new: true });
  if (!updated) fail(409, 'Account changed. Please sign in again.');
  await Session.deleteMany({ user: user._id });
  await issueSession(req, res, updated);
  res.json({ message: 'Password updated. Other sessions have been signed out.' });
});
