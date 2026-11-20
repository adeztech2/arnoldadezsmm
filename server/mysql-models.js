import { randomUUID } from 'node:crypto';
import { withConnection } from './mysql-db.js';

const tables = {
  User: { table: 'users', id: 'id' }, Session: { table: 'sessions', id: 'id' }, Settings: { table: 'settings', id: 'id' },
  Service: { table: 'services', id: 'id' }, Order: { table: 'orders', id: 'id' }, Transaction: { table: 'transactions', id: 'id' },
  Payment: { table: 'payments', id: 'id' }, Audit: { table: 'audits', id: 'id' }, RateLimit: { table: 'rate_limits', id: 'id' },
};
const aliases = { _id: 'id', user: 'user_id', service: 'service_id', authVersion: 'auth_version', tokenHash: 'token_hash', expiresAt: 'expires_at',
  passwordHash: 'password_hash', firstUserRegistered: 'first_user_registered', siteName: 'site_name', tagline: 'tagline', iconUrl: 'icon_url', supportEmail: 'support_email',
  walletCurrency: 'wallet_currency', paystackCurrency: 'paystack_currency', providerCurrency: 'provider_currency', providerToWalletRate: 'provider_to_wallet_rate',
  paystackToWalletRate: 'paystack_to_wallet_rate', minDeposit: 'min_deposit', defaultMarkupPercent: 'default_markup_percent', emailFrom: 'email_from',
  registrationOpen: 'registration_open', lastSyncAt: 'last_sync_at', jobsLeaseUntil: 'jobs_lease_until', shakergainsApiKey: 'shakergains_api_key', resendApiKey: 'resend_api_key',
  giftedpayApiKey: 'giftedpay_api_key', paystackSecretKey: 'paystack_secret_key', providerId: 'provider_id', providerRate: 'provider_rate', providerOrderId: 'provider_order_id',
  serviceName: 'service_name', serviceType: 'service_type', providerServiceId: 'provider_service_id', idempotencyKey: 'idempotency_key', requestHash: 'request_hash',
  costRateSnapshot: 'cost_rate_snapshot', providerToWalletRateSnapshot: 'provider_to_wallet_rate_snapshot', refundAmount: 'refund_amount', startCount: 'start_count',
  nextCheckAt: 'next_check_at', checkingUntil: 'checking_until', lastRefillAt: 'last_refill_at', lastCancelAt: 'last_cancel_at', lastProviderCharge: 'last_provider_charge',
  balanceAfter: 'balance_after', resetHash: 'reset_hash', resetExpires: 'reset_expires', mutationRevision: 'mutation_revision', checkoutRequestId: 'checkout_request_id',
  payAmount: 'pay_amount', payCurrency: 'pay_currency', exchangeRate: 'exchange_rate', authorizationUrl: 'authorization_url', failureReason: 'failure_reason',
  createdAt: 'created_at', updatedAt: 'updated_at', pricingUnit: 'pricing_unit' };
const reverse = Object.fromEntries(Object.entries(aliases).map(([a, c]) => [c, a]));
const jsonCols = new Set(['fields', 'history', 'requirements']);
const hidden = new Set(['password_hash', 'reset_hash', 'shakergains_api_key', 'resend_api_key', 'giftedpay_api_key', 'paystack_secret_key']);

function col(key) { return aliases[key] || key; }
function camel(key) { return reverse[key] || key; }
function encode(value, key) { return jsonCols.has(key) && value !== null && value !== undefined ? JSON.stringify(value) : value; }
function decodeRow(row, includeHidden = false, owner = Model) {
  if (!row) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (!includeHidden && hidden.has(key)) continue;
    const name = camel(key);
    let v = value;
    if (jsonCols.has(key) && typeof value === 'string') { try { v = JSON.parse(value); } catch {} }
    out[name] = v;
  }
  out._id = row.id;
  if (row.user_id !== undefined) out.user = row.user_id;
  if (row.service_id !== undefined) out.service = row.service_id;
  return decorate(out, row.id ? row.id : undefined, owner);
}
function decorate(doc, id, owner) {
  if (!doc || !id) return doc;
  Object.defineProperty(doc, '__model', { enumerable: false, value: owner });
  Object.defineProperty(doc, 'save', { enumerable: false, value: async function save(options = {}) { return owner.saveDoc(this, options.session); } });
  return doc;
}
function valueFor(doc, key) { const name = camel(key); if (name === '_id') return doc._id ?? doc.id; if (name === 'user') return doc.user ?? doc.user_id; if (name === 'service') return doc.service ?? doc.service_id; return doc[name]; }

function condition(column, expression, params) {
  const c = `\`${column}\``;
  if (expression && typeof expression === 'object' && !Array.isArray(expression)) {
    const parts = [];
    for (const [op, value] of Object.entries(expression)) {
      if (op === '$exists') parts.push(value ? `${c} IS NOT NULL` : `${c} IS NULL`);
      else if (op === '$in') { parts.push(`${c} IN (${value.map(() => '?').join(',')})`); params.push(...value); }
      else if (op === '$nin') { parts.push(`${c} NOT IN (${value.map(() => '?').join(',')})`); params.push(...value); }
      else if (op === '$ne') { parts.push(`(${c} <> ? OR ${c} IS NULL)`); params.push(value); }
      else if (op === '$gt') { parts.push(`${c} > ?`); params.push(value); }
      else if (op === '$gte') { parts.push(`${c} >= ?`); params.push(value); }
      else if (op === '$lt') { parts.push(`${c} < ?`); params.push(value); }
      else if (op === '$lte') { parts.push(`${c} <= ?`); params.push(value); }
      else if (op === '$regex') { parts.push(`${c} REGEXP ?`); params.push(value); }
      else if (op === '$not' && value?.$gt !== undefined) { parts.push(`NOT (${c} > ?)`); params.push(value.$gt); }
    }
    return parts.length ? parts.join(' AND ') : '1=1';
  }
  if (expression === null) return `${c} IS NULL`;
  params.push(encode(expression, column)); return `${c} = ?`;
}
function where(filter = {}, params = []) {
  const parts = [];
  for (const [key, expression] of Object.entries(filter)) {
    if (key === '$or') { const branches = expression.map(item => where(item, params)); parts.push(`(${branches.join(' OR ')})`); }
    else if (key === '$and') { parts.push(`(${expression.map(item => where(item, params)).join(' AND ')})`); }
    else parts.push(condition(col(key), expression, params));
  }
  return { sql: parts.length ? parts.join(' AND ') : '1=1', params };
}
function applyUpdate(doc, update) {
  for (const [op, values] of Object.entries(update || {})) {
    if (op === '$set') for (const [k, v] of Object.entries(values)) doc[camel(col(k))] = v;
    else if (op === '$inc') for (const [k, v] of Object.entries(values)) doc[camel(col(k))] = Number(doc[camel(col(k))] || 0) + v;
    else if (op === '$setOnInsert') for (const [k, v] of Object.entries(values)) doc[camel(col(k))] = v;
    else if (op === '$unset') for (const k of Object.keys(values)) doc[camel(col(k))] = null;
    else if (op === '$push') for (const [k, v] of Object.entries(values)) { const name = camel(col(k)); doc[name] = Array.isArray(doc[name]) ? [...doc[name], v] : [v]; }
  }
  return doc;
}
function dataFromDoc(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === '_id' || key === 'id' || key === 'save' || key === '__v' || key === 'user' || key === 'service') continue;
    const c = col(key); if (value !== undefined && !['created_at', 'updated_at'].includes(c)) out[c] = encode(value, c);
  }
  if (doc.user !== undefined) out.user_id = doc.user;
  if (doc.service !== undefined) out.service_id = doc.service;
  return out;
}
async function execute(conn, sql, params = []) { const [result] = await conn.execute(sql, params); return result; }

class Query {
  constructor(model, kind, filter = {}, payload = null) { this.model = model; this.kind = kind; this.filter = filter; this.payload = payload; this.options = {}; this.connection = payload?.options?.session || null; }
  session(connection) { this.connection = connection; return this; }
  select(value = '') { this.includeHidden = String(value).includes('+'); return this; }
  lean() { return this; }
  sort(value) { this.options.sort = value; return this; }
  skip(value) { this.options.skip = value; return this; }
  limit(value) { this.options.limit = value; return this; }
  async then(resolve, reject) { try { resolve(await this.exec()); } catch (e) { if (reject) reject(e); else throw e; } }
  async exec() { return withConnection(this.connection, async conn => this.model.runQuery(this, conn)); }
}

class Model {
  static definition;
  static find(filter = {}) { return new Query(this, 'find', filter); }
  static findOne(filter = {}) { return new Query(this, 'findOne', filter); }
  static findById(id) { return new Query(this, 'findOne', { _id: id }); }
  static exists(filter = {}) { return new Query(this, 'exists', filter); }
  static countDocuments(filter = {}) { return new Query(this, 'count', filter); }
  static aggregate(pipeline) { return new Query(this, 'aggregate', {}, pipeline); }
  static distinct(field, filter = {}) { return new Query(this, 'distinct', filter, field); }
  static create(items, options = {}) { return this.insert(Array.isArray(items) ? items : [items], options.session); }
  static async insert(items, connection) { return withConnection(connection, async conn => { const created = []; for (const item of items) { const doc = { ...item, _id: item._id || randomUUID() }; const data = dataFromDoc(doc); const keys = Object.keys(data); await execute(conn, `INSERT INTO ${this.definition.table} (id,${keys.map(k => `\`${k}\``).join(',')}) VALUES (?,${keys.map(() => '?').join(',')})`, [doc._id, ...keys.map(k => data[k])]); created.push(await this.findById(doc._id).session(conn).exec()); } return created; }); }
  static updateOne(filter, update, options = {}) { return new Query(this, 'updateOne', filter, { update, options }); }
  static updateMany(filter, update, options = {}) { return new Query(this, 'updateMany', filter, { update, options }); }
  static findOneAndUpdate(filter, update, options = {}) { return new Query(this, 'findOneAndUpdate', filter, { update, options }); }
  static findByIdAndUpdate(id, update, options = {}) { return this.findOneAndUpdate({ _id: id }, update, options); }
  static deleteOne(filter, options = {}) { return new Query(this, 'deleteOne', filter, { options }); }
  static deleteMany(filter, options = {}) { return new Query(this, 'deleteMany', filter, { options }); }
  static async bulkWrite(operations, options = {}) { for (const operation of operations) { const item = operation.updateOne; if (!item) continue; await this.findOneAndUpdate(item.filter, item.update, { ...(item.upsert ? { upsert: true } : {}), session: options.session }).session(options.session).exec(); } return { acknowledged: true }; }
  static async saveDoc(doc, connection) { return withConnection(connection, async conn => { const data = dataFromDoc(doc); const keys = Object.keys(data); await execute(conn, `UPDATE ${this.definition.table} SET ${keys.map(k => `\`${k}\`=?`).join(',')} WHERE id=?`, [...keys.map(k => data[k]), doc._id]); return this.findById(doc._id).session(conn).exec(); }); }
  static async init() {}
  static async runQuery(q, conn) {
    const { table } = this.definition; const { sql, params } = where(q.filter);
    if (q.kind === 'exists') { const rows = await execute(conn, `SELECT id FROM ${table} WHERE ${sql} LIMIT 1`, params); return rows.length > 0; }
    if (q.kind === 'count') { const rows = await execute(conn, `SELECT COUNT(*) AS count FROM ${table} WHERE ${sql}`, params); return Number(rows[0].count); }
    if (q.kind === 'distinct') { const rows = await execute(conn, `SELECT DISTINCT \`${col(q.payload)}\` AS value FROM ${table} WHERE ${sql}`, params); return rows.map(r => r.value); }
    if (q.kind === 'aggregate') return this.aggregateRows(conn, q.payload);
    if (q.kind === 'deleteOne' || q.kind === 'deleteMany') { const result = await execute(conn, `DELETE FROM ${table} WHERE ${sql}${q.kind === 'deleteOne' ? ' LIMIT 1' : ''}`, params); return { deletedCount: result.affectedRows }; }
    if (q.kind === 'updateOne' || q.kind === 'updateMany' || q.kind === 'findOneAndUpdate') {
      const rows = await execute(conn, `SELECT * FROM ${table} WHERE ${sql}${q.kind !== 'updateMany' ? ' LIMIT 1' : ''}`, params);
      if (!rows.length) { if (q.payload.options?.upsert) { const base = { ...q.filter }; const doc = applyUpdate(base, q.payload.update); const [created] = await this.insert([doc], conn); return q.kind === 'findOneAndUpdate' ? created : { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }; } return q.kind === 'findOneAndUpdate' ? null : { matchedCount: 0, modifiedCount: 0 }; }
      let first;
      for (const row of rows) { const doc = decodeRow(row, true, this); if (!first) first = doc; applyUpdate(doc, q.payload.update); await this.saveDoc(doc, conn); }
      if (q.kind === 'findOneAndUpdate') return this.findById(first._id).session(conn).exec();
      return { matchedCount: rows.length, modifiedCount: rows.length };
    }
    let order = '';
    if (q.options.sort) order = ' ORDER BY ' + Object.entries(q.options.sort).map(([k, v]) => `\`${col(k)}\` ${v < 0 ? 'DESC' : 'ASC'}`).join(',');
    const limit = q.options.limit ? ` LIMIT ${Number(q.options.limit)}` : '';
    const offset = q.options.skip ? ` OFFSET ${Number(q.options.skip)}` : '';
    const rows = await execute(conn, `SELECT * FROM ${table} WHERE ${sql}${order}${limit}${offset}`, params);
    const docs = rows.map(row => decodeRow(row, q.includeHidden, this));
    return q.kind === 'findOne' ? (docs[0] || null) : docs;
  }
  static async aggregateRows(conn, pipeline) {
    let rows = await execute(conn, `SELECT * FROM ${this.definition.table}`); let docs = rows.map(row => decodeRow(row, false, this));
    for (const stage of pipeline) {
      if (stage.$match) { const { sql, params } = where(stage.$match); const matched = await execute(conn, `SELECT * FROM ${this.definition.table} WHERE ${sql}`, params); docs = matched.map(row => decodeRow(row, false, this)); }
      if (stage.$group) { const spec = stage.$group; const groups = new Map(); const idExpr = spec._id; for (const doc of docs) { const key = typeof idExpr === 'string' && idExpr.startsWith('$') ? valueFor(doc, idExpr.slice(1)) : idExpr; const group = groups.get(String(key)) || { _id: key }; for (const [name, op] of Object.entries(spec)) { if (name === '_id') continue; if (op.$sum === 1) group[name] = (group[name] || 0) + 1; else if (op.$sum) group[name] = (group[name] || 0) + Number(valueFor(doc, String(op.$sum).replace(/^\$/, '')) || 0); else if (op.$first) group[name] ??= valueFor(doc, String(op.$first).replace(/^\$/, '')); } groups.set(String(key), group); } docs = [...groups.values()]; }
      if (stage.$sort) { const [key, direction] = Object.entries(stage.$sort)[0]; docs.sort((a, b) => (a[key] > b[key] ? direction : -direction)); }
    }
    return docs;
  }
}

function define(name) { return class extends Model { static definition = tables[name]; }; }
export const User = define('User'); export const Session = define('Session'); export const Settings = define('Settings'); export const Service = define('Service'); export const Order = define('Order'); export const Transaction = define('Transaction'); export const Payment = define('Payment'); export const Audit = define('Audit'); export const RateLimit = define('RateLimit');
export const models = [User, Session, Settings, Service, Order, Transaction, Payment, Audit, RateLimit];
