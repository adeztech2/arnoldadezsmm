import { Service, Settings } from './models.js';
import { shaker } from './providers.js';
import { settings, audit } from './config.js';
import { transaction } from './db.js';
import { fail, positive, integer, safeUrl, text, object } from './lib/errors.js';

const types = {
  default: ['link', 'quantity'],
  'custom comments': ['link', 'comments'],
  mentions: ['link', 'quantity', 'usernames'],
  'mentions with hashtags': ['link', 'quantity', 'usernames', 'hashtags'],
  'mentions custom list': ['link', 'usernames'],
  'mentions hashtag': ['link', 'quantity', 'hashtags'],
  'mentions user followers': ['link', 'quantity', 'username'],
  'mentions media likers': ['link', 'quantity', 'media'],
  'custom comments package': ['link', 'comments'],
  'comment likes': ['link', 'quantity', 'username'],
  poll: ['link', 'quantity', 'answer_number'],
  'comment replies': ['link', 'username', 'comments'],
  'invites from groups': ['link', 'quantity', 'groups'],
  package: ['link']
};
export function typeInfo(type) {
  const normalized = String(type).trim().toLowerCase();
  const requirements = types[normalized];
  return { supported: !!requirements, requirements: requirements || [], pricingUnit: normalized.includes('package') ? 'package' : '1000' };
}
export function serviceView(service, config, admin = false) {
  const costRate = service.providerCurrency === config.providerCurrency && config.providerToWalletRate > 0 ? service.providerRate * config.providerToWalletRate : null;
  const sellingRate = service.sellingRate;
  const result = {
    id: String(service._id), providerId: service.providerId, name: service.name, category: service.category,
    type: service.type, min: service.min, max: service.max, rate: sellingRate,
    enabled: service.enabled, refill: service.refill, cancel: service.cancel,
    requirements: service.requirements, description: service.description || '', pricingUnit: service.pricingUnit
  };
  if (admin) Object.assign(result, {
    providerRate: service.providerRate, providerCurrency: service.providerCurrency, costRate,
    sellingRate, profitRate: sellingRate !== null && costRate !== null ? sellingRate - costRate : null,
    marginPercent: sellingRate > 0 && costRate !== null ? (sellingRate - costRate) / sellingRate * 100 : null,
    supported: service.supported, available: service.available, updatedAt: service.updatedAt
  });
  return result;
}
export async function syncServices(actor) {
  const balance = await shaker('balance');
  if (typeof balance.currency !== 'string' || !/^[A-Z]{3}$/.test(balance.currency)) fail(502, 'Provider did not supply a valid currency.');
  const rows = await shaker('services');
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 30000) fail(502, 'Provider service list is empty or invalid. Existing services were kept.');
  const ids = new Set();
  const normalized = rows.map(row => {
    const providerId = String(row.service ?? row.services ?? '');
    const rate = Number(row.rate), min = Number(row.min), max = Number(row.max);
    if (!/^\d+$/.test(providerId) || ids.has(providerId) || !Number.isFinite(rate) || rate < 0 || rate > 1000000 || !Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min) fail(502, 'Provider service list contains invalid entries. Existing services were kept.');
    ids.add(providerId);
    const type = String(row.type || 'Default'), info = typeInfo(type);
    return {
      providerId, name: text(String(row.name || ''), 'Service name', 1, 1000),
      category: String(row.category ?? row.Category ?? 'Other').slice(0, 300), type,
      min, max, providerRate: rate, providerCurrency: balance.currency, ...info,
      refill: row.refill === true || row.refill === 'true' || row.refill === 1,
      cancel: row.cancel === true || row.cancel === 'true' || row.cancel === 1,
      description: String(row.description || '').slice(0, 4000), available: true
    };
  });
  const syncedAt = new Date();
  await transaction(async session => {
    const config = await Settings.findById('site').session(session);
    await Settings.updateOne({ _id: 'site' }, { $set: { providerCurrency: balance.currency, lastSyncAt: syncedAt } }, { session });
    await Service.updateMany({}, { $set: { available: false } }, { session });
    const rate = balance.currency === 'KES' ? 1 : config.providerToWalletRate;
    await Service.bulkWrite(normalized.map(row => ({ updateOne: {
      filter: { providerId: row.providerId },
      update: { $set: row, $setOnInsert: { sellingRate: rate > 0 ? Math.ceil(row.providerRate * rate * (1 + config.defaultMarkupPercent / 100) * 10000) / 10000 : null, enabled: false } },
      upsert: true
    } })), { session });
    if (balance.currency === 'KES') await Settings.updateOne({ _id: 'site' }, { $set: { providerToWalletRate: 1 } }, { session });
    await audit(actor, 'services.synced', 'catalog', `Imported ${normalized.length} services. Currency ${balance.currency}.`, session);
  });
  return { message: 'Provider catalog refreshed. Set prices and enable services before customers can order.', count: normalized.length, providerCurrency: balance.currency, lastSyncAt: syncedAt };
}
export function normalizeOrder(input, service) {
  object(input);
  const fields = input.fields === undefined ? {} : object(input.fields);
  const payload = {};
  for (const field of service.requirements) {
    const value = field === 'link' ? input.link : field === 'quantity' ? input.quantity : fields[field];
    if (field === 'link' || field === 'media') payload[field] = safeUrl(value, field);
    else if (field === 'quantity') payload.quantity = integer(value, 'Quantity', service.min, service.max);
    else if (field === 'answer_number') payload[field] = integer(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value, 'Poll answer', 1, 100);
    else payload[field] = text(value, field, 1, 20000);
  }
  let quantity = payload.quantity;
  if (service.pricingUnit === 'package') quantity = 1;
  else if (payload.comments) quantity = payload.comments.split(/\r?\n/).filter(x => x.trim()).length;
  else if (service.type.toLowerCase() === 'mentions custom list') quantity = payload.usernames.split(/\r?\n/).filter(x => x.trim()).length;
  if (!Number.isSafeInteger(quantity) || quantity < (service.pricingUnit === 'package' ? 1 : service.min) || quantity > service.max) fail(400, `Quantity must be between ${service.min} and ${service.max}.`);
  return { payload, quantity, link: payload.link || '', fields: Object.fromEntries(Object.entries(payload).filter(([k]) => !['link', 'quantity'].includes(k))) };
}
export function orderPrice(service, config, quantity) {
  if (!service.available || !service.enabled || !service.supported || service.sellingRate === null) fail(409, 'This service is not available for ordering.');
  positive(service.sellingRate, 'Service price');
  if (!config.providerToWalletRate || service.providerCurrency !== config.providerCurrency) fail(503, 'Administrator must configure the provider currency conversion before ordering.');
  const multiplier = service.pricingUnit === 'package' ? 1 : quantity / 1000;
  const charge = Math.ceil((service.sellingRate * multiplier * 100) - 1e-8);
  const providerCost = Math.ceil((service.providerRate * config.providerToWalletRate * multiplier * 100) - 1e-8);
  integer(charge, 'Order charge', 1, 1000000000);
  integer(providerCost, 'Provider cost', 0, 1000000000);
  return { charge, providerCost };
}
export async function listServices(req, admin = false) {
  const config = await settings();
  const query = admin ? {} : { enabled: true, available: true, supported: true, sellingRate: { $gt: 0 } };
  if (req.query.category) query.category = text(req.query.category, 'Category', 1, 300);
  if (req.query.q) {
    const value = text(req.query.q, 'Search', 1, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ name: { $regex: value, $options: 'i' } }, { category: { $regex: value, $options: 'i' } }, { providerId: value }];
  }
  const services = await Service.find(query).sort({ category: 1, providerId: 1 }).lean();
  const categories = await Service.distinct('category', admin ? {} : { enabled: true, available: true, supported: true, sellingRate: { $gt: 0 } });
  return { services: services.map(s => serviceView(s, config, admin)), categories: categories.sort(), currency: config.walletCurrency, providerCurrency: config.providerCurrency, providerToWalletRate: config.providerToWalletRate, lastSyncAt: config.lastSyncAt };
}
