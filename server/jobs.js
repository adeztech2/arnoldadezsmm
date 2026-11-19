import { Settings, Order, Payment } from './models.js';
import { refreshOrder, terminal } from './orders.js';
import { verifyPayment } from './payments.js';
import { configuredKeys, audit, settings } from './config.js';
import { syncServices } from './services.js';
export async function runJobs(actor = 'scheduler', budgetMs = 40000) {
  const lease = await Settings.findOneAndUpdate({
    _id: 'site', $or: [{ jobsLeaseUntil: { $exists: false } }, { jobsLeaseUntil: { $lt: new Date() } }]
  }, { $set: { jobsLeaseUntil: new Date(Date.now() + budgetMs + 30000) } });
  if (!lease) return { message: 'Another reconciliation run is in progress.', ordersChecked: 0, paymentsChecked: 0, errors: [] };
  const output = { message: 'Reconciliation finished.', ordersChecked: 0, paymentsChecked: 0, errors: [] }, start = Date.now();
  try {
    await Order.updateMany({ status: 'Submitting', createdAt: { $lt: new Date(Date.now() - 120000) } }, {
      $set: { status: 'Submission uncertain' },
      $push: { history: { status: 'Submission uncertain', message: 'Submission did not complete locally. Administrator must check upstream before any retry or refund.', at: new Date() } }
    });
    await Payment.updateMany({ status: 'initializing', createdAt: { $lt: new Date(Date.now() - 120000) } }, { $set: { status: 'review', failureReason: 'Initialization did not complete locally.' } });
    const keys = await configuredKeys();
    const orders = keys.shakergains ? await Order.find({ status: { $nin: [...terminal, 'Submitting', 'Submission uncertain'] }, providerOrderId: { $exists: true }, nextCheckAt: { $not: { $gt: new Date() } } }).sort({ nextCheckAt: 1 }).limit(100) : [];
    for (const order of orders) {
      if (Date.now() - start > budgetMs - 20000) break;
      try { await refreshOrder(order._id); output.ordersChecked++; }
      catch { output.errors.push(`Order ${order._id} could not be reconciled.`); }
    }
    const payments = await Payment.find({ status: { $in: ['pending', 'review'] }, nextCheckAt: { $not: { $gt: new Date() } } }).sort({ nextCheckAt: 1 }).limit(100);
    for (const payment of payments) {
      if (Date.now() - start > budgetMs - 20000) break;
      if (!keys[payment.gateway]) continue;
      try { await verifyPayment(payment._id); output.paymentsChecked++; }
      catch { output.errors.push(`Payment ${payment._id} could not be reconciled.`); }
    }
    const config = await settings();
    if (keys.shakergains && Date.now() - start < budgetMs - 36000 && (!config.lastSyncAt || Date.now() - new Date(config.lastSyncAt).getTime() > 15 * 60000)) {
      try { await syncServices(actor); output.catalogUpdated = true; }
      catch { output.errors.push('Provider catalog refresh failed. Last verified prices were kept.'); }
    }
    await audit(actor, 'jobs.reconciled', 'jobs', `${output.ordersChecked} orders and ${output.paymentsChecked} payments checked; ${output.errors.length} errors.`);
    return output;
  } finally { await Settings.updateOne({ _id: 'site' }, { $unset: { jobsLeaseUntil: '' } }); }
}
