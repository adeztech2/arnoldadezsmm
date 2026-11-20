import mysql from 'mysql2/promise';
import { AppError } from './lib/errors.js';

let pool;
let ready = false;

function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new AppError(503, 'Manus MySQL is not configured. Add DATABASE_URL to enable accounts and orders.');
  const url = new URL(process.env.DATABASE_URL);
  pool = mysql.createPool({ host: url.hostname, port: url.port ? Number(url.port) : 3306, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)), waitForConnections: true, connectionLimit: 10, enableKeepAlive: true, namedPlaceholders: false, timezone: 'Z', ssl: { rejectUnauthorized: true } });
  return pool;
}

export async function withConnection(connection, work) {
  if (connection) return work(connection);
  const conn = await getPool().getConnection();
  try { return await work(conn); } finally { conn.release(); }
}

export async function mysqlTransaction(work) {
  const conn = await getPool().getConnection();
  try { await conn.beginTransaction(); const result = await work(conn); await conn.commit(); return result; }
  catch (error) { try { await conn.rollback(); } catch {} throw error; }
  finally { conn.release(); }
}

export async function mysqlReady() {
  try { await withConnection(null, c => c.query('SELECT 1')); ready = true; return true; }
  catch { ready = false; return false; }
}
export const mysqlDatabaseReady = () => ready;
export { getPool };
