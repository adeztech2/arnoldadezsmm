import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import pino from 'pino';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, databaseReady, requireDatabase } from './db.js';
import { authRouter, accountRouter, requireUser, requireAdmin, rateCheck } from './auth.js';
import { csrf, equal, signatureValid } from './lib/security.js';
import { AppError, fail } from './lib/errors.js';
import { settings, defaults, publicSettings, apiKey } from './config.js';
import { ordersRouter, terminal } from './orders.js';
import { paymentsRouter, walletData, verifyPayment } from './payments.js';
import { adminRouter } from './admin.js';
import { Order, Transaction, Payment } from './models.js';
import { listServices } from './services.js';
import { userView, orderView, transactionView } from './serializers.js';
import { runJobs } from './jobs.js';

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  redact: { paths: ['password', 'token', 'key', '*.password', '*.passwordHash', '*.resetHash', '*.authorization', '*.cookie', '*.shakergainsApiKey', '*.resendApiKey', '*.giftedpayApiKey', '*.paystackSecretKey'], censor: '[REDACTED]' }
});
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
      imgSrc: ["'self'", 'https:', 'data:'], fontSrc: ["'self'"],
      connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"],
      formAction: ["'self'"], frameAncestors: process.env.REPL_ID ? ["'self'", 'https://replit.com', 'https://*.replit.com'] : ["'none'"]
    } },
    crossOriginEmbedderPolicy: false,
    // Replit's authenticated preview is framed by its workspace.
    xFrameOptions: false
  }));
  app.use((req, res, next) => {
    req.log = logger;
    if (req.path.startsWith('/smm-api')) res.set('Cache-Control', 'no-store');
    next();
  });
  // Raw body is required for Paystack HMAC verification. No credit relies on callback contents.
  app.post('/smm-api/webhooks/paystack', express.raw({ type: 'application/json', limit: '100kb' }), async (req, res) => {
    await connectDatabase();
    const key = await apiKey('paystackSecretKey');
    if (!Buffer.isBuffer(req.body) || !signatureValid(req.body, req.get('x-paystack-signature'), key)) fail(401, 'Webhook signature is invalid.');
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); } catch { fail(400, 'Invalid webhook JSON.'); }
    if (event.event === 'charge.success' && typeof event.data?.reference === 'string') {
      const payment = await Payment.findOne({ reference: event.data.reference, gateway: 'paystack' });
      if (payment) await verifyPayment(payment._id, { force: true });
    }
    res.json({ received: true });
  });
  app.get('/smm-api/jobs/cron', async (req, res) => {
    const expected = process.env.CRON_SECRET;
    if (!expected || !equal(req.get('authorization'), `Bearer ${expected}`)) fail(401, 'Scheduler authorization is required.');
    await connectDatabase();
    res.json(await runJobs('scheduler'));
  });
  app.use(express.json({ limit: '100kb', strict: true }));
  app.use(cookieParser());
  app.use('/smm-api', csrf);
  app.get('/smm-api/healthz', (req, res) => {
    res.json({ status: 'ok', database: databaseReady() ? 'connected' : 'not_connected', version: '1.0.0' });
  });
  app.get('/smm-api/public/settings', async (req, res) => {
    try { await connectDatabase(); res.json(publicSettings(await settings(), true)); }
    catch { res.json(publicSettings(defaults, false)); }
  });
  app.use('/smm-api/auth', authRouter);
  app.get('/smm-api/services', requireDatabase, async (req, res) => { res.json(await listServices(req)); });
  const customer = express.Router();
  customer.use(requireDatabase, requireUser);
  customer.use(async (req, res, next) => {
    await rateCheck(`api:${req.user._id}`, 240, 60000);
    next();
  });
  customer.use('/account', accountRouter);
  customer.get('/dashboard', async (req, res) => {
    const [sums, recentOrders, transactions] = await Promise.all([
      Order.aggregate([{ $match: { user: req.user._id } }, { $group: {
        _id: null, totalOrders: { $sum: 1 },
        activeOrders: { $sum: { $cond: [{ $not: [{ $in: ['$status', terminal] }] }, 1, 0] } },
        completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        grossSpent: { $sum: '$charge' }, totalRefunded: { $sum: '$refundAmount' }
      } }]), Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(6).lean(),
      Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(6).lean()
    ]);
    const totals = sums[0] || { totalOrders: 0, activeOrders: 0, completedOrders: 0, grossSpent: 0, totalRefunded: 0 };
    res.json({ user: userView(req.user), stats: { totalOrders: totals.totalOrders, activeOrders: totals.activeOrders, completedOrders: totals.completedOrders, totalSpent: totals.grossSpent - totals.totalRefunded, totalRefunded: totals.totalRefunded }, recentOrders: recentOrders.map(o => orderView(o)), transactions: transactions.map(transactionView) });
  });
  customer.use('/orders', ordersRouter);
  customer.get('/wallet', async (req, res) => { res.json(await walletData(req)); });
  customer.use('/payments', paymentsRouter);
  customer.use('/admin', requireAdmin, adminRouter);
  app.use('/smm-api', customer);
  app.use('/smm-api', (req, res) => { res.status(404).json({ error: 'API endpoint not found.' }); });
  app.use(express.static(publicDir, { index: false, etag: true, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, dotfiles: 'deny' }));
  app.get('/{*path}', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(publicDir, 'index.html'));
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error instanceof AppError ? error.status : 500;
    let message = error instanceof AppError ? error.message : 'Request could not be completed. Please try again or contact support.';
    if (error.type === 'entity.parse.failed') { status = 400; message = 'Request body must be valid JSON.'; }
    if (error.type === 'entity.too.large') { status = 413; message = 'Request is too large.'; }
    if (error.code === 11000) { status = 409; message = 'This action conflicts with an existing record.'; }
    if (status >= 500) logger.error({ status, code: error.code, name: error.name }, 'Request failed');
    res.status(status).json({ error: message });
  });
  return app;
}
