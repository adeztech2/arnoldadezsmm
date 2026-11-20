import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './lib/errors.js';
import { models, Settings } from './models.js';
import { mysqlTransaction, mysqlReady, withConnection } from './mysql-db.js';

const isTest = process.env.NODE_ENV === 'test';
let connecting;
let ready = false;

async function migrateMySQL() {
  const sql = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations/001_mysql.sql'), 'utf8');
  const statements = sql.split(/;\s*(?:\n|$)/).map(item => item.trim()).filter(Boolean);
  await withConnection(null, async conn => { for (const statement of statements) await conn.query(statement); });
}

export async function connectDatabase() {
  if (ready) return;
  if (isTest) {
    const mongoose = await import('mongoose');
    if (mongoose.default.connection.readyState === 1) { ready = true; return; }
    if (!process.env.MONGODB_URI) throw new AppError(503, 'MongoDB is not configured for tests.');
    if (!connecting) connecting = (async () => {
      await mongoose.default.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 7000, maxPoolSize: 10 });
      await Promise.all(models.map(model => model.init()));
      await Settings.updateOne({ _id: 'site' }, { $setOnInsert: { firstUserRegistered: false } }, { upsert: true });
      ready = true;
    })().finally(() => { connecting = null; });
  } else {
    if (!process.env.DATABASE_URL) throw new AppError(503, 'Manus MySQL is not configured. Add DATABASE_URL to enable accounts and orders.');
    if (!connecting) connecting = (async () => { await migrateMySQL(); await mysqlReady(); ready = true; })().finally(() => { connecting = null; });
  }
  try { await connecting; } catch (error) { ready = false; if (error instanceof AppError) throw error; throw new AppError(503, 'Manus MySQL is unavailable. Check the managed database configuration.'); }
}
export const databaseReady = () => ready;
export async function transaction(work) {
  if (isTest) {
    const mongoose = await import('mongoose');
    const session = await mongoose.default.startSession();
    try { return await session.withTransaction(() => work(session)); } finally { await session.endSession(); }
  }
  return mysqlTransaction(work);
}
export async function requireDatabase(req, res, next) { try { await connectDatabase(); next(); } catch (error) { next(error); } }
