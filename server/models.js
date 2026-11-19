import mongoose from 'mongoose';
const { Schema } = mongoose;
const options = { timestamps: true, strict: 'throw' };
const money = { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger };
const userSchema = new Schema({
  name: { type: String, required: true }, email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true, select: false },
  country: { type: String, required: true }, role: { type: String, enum: ['user', 'admin', 'super_admin'], default: 'user' },
  balance: money, disabled: { type: Boolean, default: false }, authVersion: { type: Number, default: 0 },
  resetHash: { type: String, select: false }, resetExpires: Date, mutationRevision: { type: Number, default: 0 }
}, options);
userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: 'super_admin' } });
const sessionSchema = new Schema({
  tokenHash: { type: String, unique: true, required: true }, user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  authVersion: Number, expiresAt: { type: Date, required: true }
}, options);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const settingsSchema = new Schema({
  _id: { type: String, default: 'site' }, firstUserRegistered: { type: Boolean, default: false },
  siteName: { type: String, default: 'ADEZ SMM' }, tagline: { type: String, default: 'Your next chapter of growth starts here.' },
  iconUrl: { type: String, default: '' }, supportEmail: { type: String, default: '' },
  walletCurrency: { type: String, default: 'KES' }, paystackCurrency: { type: String, default: 'KES' },
  providerCurrency: { type: String, default: '' }, providerToWalletRate: { type: Number, default: 0 },
  paystackToWalletRate: { type: Number, default: 1 }, minDeposit: { type: Number, default: 10000 },
  defaultMarkupPercent: { type: Number, default: 30 }, emailFrom: { type: String, default: '' },
  announcement: { type: String, default: '' }, registrationOpen: { type: Boolean, default: true },
  maintenance: { type: Boolean, default: false }, lastSyncAt: Date, jobsLeaseUntil: Date,
  shakergainsApiKey: { type: String, select: false }, resendApiKey: { type: String, select: false },
  giftedpayApiKey: { type: String, select: false }, paystackSecretKey: { type: String, select: false }
}, options);
const serviceSchema = new Schema({
  providerId: { type: String, unique: true, required: true }, name: String, category: String, type: String,
  min: Number, max: Number, providerRate: Number, providerCurrency: String,
  sellingRate: { type: Number, default: null }, enabled: { type: Boolean, default: false },
  available: { type: Boolean, default: true }, supported: { type: Boolean, default: true },
  refill: Boolean, cancel: Boolean, requirements: [String], pricingUnit: String, description: String
}, options);
const historySchema = new Schema({ status: String, message: String, at: Date }, { _id: false });
const orderSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  service: { type: Schema.Types.ObjectId, ref: 'Service', required: true }, serviceName: String,
  serviceType: String, providerServiceId: String, providerOrderId: String,
  idempotencyKey: { type: String, required: true }, requestHash: String,
  link: String, quantity: Number, fields: { type: Schema.Types.Mixed, default: {} },
  charge: money, providerCost: money, costRateSnapshot: Number, providerToWalletRateSnapshot: Number,
  refundAmount: money, status: { type: String, default: 'Submitting' },
  startCount: { type: Number, default: 0 }, remains: Number,
  refill: Boolean, cancel: Boolean, history: [historySchema],
  nextCheckAt: Date, checkingUntil: Date, lastRefillAt: Date, lastCancelAt: Date, lastProviderCharge: Number
}, options);
orderSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ providerOrderId: 1 }, { unique: true, partialFilterExpression: { providerOrderId: { $type: 'string' } } });
const transactionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, type: String,
  amount: { type: Number, required: true, validate: Number.isSafeInteger }, balanceAfter: money,
  description: String, reference: { type: String, unique: true }, requestHash: String
}, options);
const paymentSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, reference: { type: String, unique: true, required: true },
  idempotencyKey: { type: String, required: true }, requestHash: String,
  gateway: String, amount: money, currency: String, payAmount: money, payCurrency: String, exchangeRate: Number,
  status: { type: String, default: 'initializing' }, checkoutRequestId: String, phone: String,
  authorizationUrl: String, failureReason: String, nextCheckAt: Date, checkingUntil: Date
}, options);
paymentSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ gateway: 1, checkoutRequestId: 1 }, { unique: true, partialFilterExpression: { checkoutRequestId: { $type: 'string' } } });
const auditSchema = new Schema({ actor: String, action: String, target: String, detail: String }, options);
const limitSchema = new Schema({ _id: String, count: Number, expiresAt: Date }, { strict: true });
limitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const User = mongoose.model('User', userSchema);
export const Session = mongoose.model('Session', sessionSchema);
export const Settings = mongoose.model('Settings', settingsSchema);
export const Service = mongoose.model('Service', serviceSchema);
export const Order = mongoose.model('Order', orderSchema);
export const Transaction = mongoose.model('Transaction', transactionSchema);
export const Payment = mongoose.model('Payment', paymentSchema);
export const Audit = mongoose.model('Audit', auditSchema);
export const RateLimit = mongoose.model('RateLimit', limitSchema);
export const models = [User, Session, Settings, Service, Order, Transaction, Payment, Audit, RateLimit];
