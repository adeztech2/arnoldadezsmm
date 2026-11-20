import 'dotenv/config';
import { createApp, logger } from './app.js';
import { connectDatabase } from './db.js';
import { runJobs } from './jobs.js';

const port = Number(process.env.PORT || 3000);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT is invalid.');
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) throw new Error('A stable SESSION_SECRET of at least 32 characters is required.');
const server = createApp().listen(port, '0.0.0.0', () => { logger.info({ port }, 'ADEZ SMM server ready'); });
if (process.env.DATABASE_URL || process.env.NODE_ENV === 'test') connectDatabase().catch(error => { logger.warn({ status: error.status }, 'Database not ready; configuration must be checked'); });
// Long-running Node hosts, including Render. Vercel uses the authenticated cron endpoint instead.
const timer = setInterval(async () => {
  if (!process.env.DATABASE_URL || process.env.ENABLE_SCHEDULER === 'false') return;
  try { await connectDatabase(); await runJobs(); } catch { logger.warn('Scheduled reconciliation failed'); }
}, 60000);
timer.unref();
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  clearInterval(timer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
});
