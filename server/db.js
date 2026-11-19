import mongoose from 'mongoose';
import { Settings, models } from './models.js';
import { AppError } from './lib/errors.js';
mongoose.set('bufferCommands', false);
// Filters are constructed from validated scalar inputs; never pass request objects into queries.
let connecting;
let ready = false;
export async function connectDatabase() {
  if (ready && mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) throw new AppError(503, 'MongoDB is not configured. Add MONGODB_URI to enable accounts and orders.');
  if (!connecting) connecting = (async () => {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 7000, maxPoolSize: 10 });
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!topology.setName && topology.msg !== 'isdbgrid') {
      throw new AppError(503, 'MongoDB must support transactions. Use MongoDB Atlas or a replica set.');
    }
    await Promise.all(models.map(model => model.init()));
    await Settings.updateOne({ _id: 'site' }, { $setOnInsert: { firstUserRegistered: false } }, { upsert: true });
    ready = true;
  })().finally(() => { connecting = null; });
  try { await connecting; } catch (error) {
    ready = false;
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'MongoDB is unavailable. Check the connection configuration.');
  }
}
export const databaseReady = () => ready && mongoose.connection.readyState === 1;
export async function transaction(work) {
  const session = await mongoose.startSession();
  try { return await session.withTransaction(() => work(session)); }
  finally { await session.endSession(); }
}
export async function requireDatabase(req, res, next) {
  try { await connectDatabase(); next(); } catch (error) { next(error); }
}
