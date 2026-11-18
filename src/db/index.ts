import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

let pool: ReturnType<typeof mysql.createPool> | undefined;

function getPool() {
  if (!pool) {
    const databaseUrl = process.env['DATABASE_URL'] || process.env['DRIZZLE_DATABASE_URL'];
    if (!databaseUrl) throw new Error('DATABASE_URL is required for the Manus-managed MySQL database.');
    pool = mysql.createPool({
      uri: databaseUrl,
      connectionLimit: 8,
      waitForConnections: true,
      dateStrings: true,
      ssl: { rejectUnauthorized: true },
    });
  }
  return pool;
}

export type Profile = {
  id: string;
  open_id: string;
  name: string;
  email: string;
  country: string;
  balance: number;
  disabled: boolean;
  country_locked: boolean;
  created_at: string;
  updated_at: string;
};

export type Service = {
  id: string;
  provider_id: string;
  name: string;
  category: string;
  type: string;
  min: number;
  max: number;
  provider_rate: number;
  provider_currency: string;
  selling_rate: number | null;
  enabled: boolean;
  available: boolean;
  supported: boolean;
  refill: boolean;
  cancel: boolean;
  requirements: string[];
  pricing_unit: string;
  description: string;
  updated_at: string;
};

export type Settings = {
  id: string;
  site_name: string;
  tagline: string;
  support_email: string;
  announcement: string;
  wallet_currency: string;
  paystack_currency: string;
  provider_currency: string;
  provider_to_wallet_rate: number;
  paystack_to_wallet_rate: number;
  min_deposit: number;
  default_markup_percent: number;
  registration_open: boolean;
  maintenance: boolean;
  last_sync_at: string | null;
  first_user_registered: boolean;
};

export type Order = Record<string, unknown> & { id: string; user_id: string };
export type Payment = Record<string, unknown> & { id: string; user_id: string };

export async function query<T = RowDataPacket[]>(sql: string, params: unknown[] = []) {
  const [rows] = await getPool().query(sql, params);
  return rows as T;
}

export async function execute(sql: string, params: any[] = []) {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
}

export async function withTransaction<T>(fn: (connection: PoolConnection) => Promise<T>) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function parseJson<T>(value: T | string | null): T {
  if (typeof value !== 'string') return value as T;
  return JSON.parse(value) as T;
}

export async function findProfileById(id: string) {
  const rows = await query<(Profile & RowDataPacket)[]>('SELECT * FROM profiles WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? normalizeProfile(rows[0]) : null;
}

export async function findProfileByOpenId(openId: string) {
  const rows = await query<(Profile & RowDataPacket)[]>('SELECT * FROM profiles WHERE open_id = ? LIMIT 1', [openId]);
  return rows[0] ? normalizeProfile(rows[0]) : null;
}

export function normalizeProfile(row: Profile): Profile {
  return { ...row, balance: Number(row.balance), disabled: Boolean(row.disabled), country_locked: Boolean(row.country_locked) };
}

export async function upsertManusProfile(identity: { openId: string; email: string; name: string }) {
  const existing = await findProfileByOpenId(identity.openId);
  const bootstrapEmail = process.env['MANUS_SUPER_ADMIN_EMAIL'] ?? 'adez@tech.com';
  const isBootstrapIdentity = identity.email.trim().toLowerCase() === bootstrapEmail.trim().toLowerCase();
  if (existing) {
    await execute('UPDATE profiles SET email = ?, name = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [identity.email, identity.name, existing.id]);
    if (isBootstrapIdentity) await execute('INSERT INTO user_roles (id, user_id, role) VALUES (UUID(), ?, \'super_admin\') ON DUPLICATE KEY UPDATE role = role', [existing.id]);
    return (await findProfileById(existing.id))!;
  }

  const countRows = await query<(RowDataPacket & { count: number })[]>('SELECT COUNT(*) AS count FROM profiles');
  const isFirst = Number(countRows[0]?.count ?? 0) === 0;
  const id = randomUUID();
  await withTransaction(async (connection) => {
    await connection.execute('INSERT INTO profiles (id, open_id, email, name) VALUES (?, ?, ?, ?)', [id, identity.openId, identity.email, identity.name]);
    await connection.execute('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)', [randomUUID(), id, isFirst || isBootstrapIdentity ? 'super_admin' : 'user']);
    if (isFirst) await connection.execute('UPDATE settings SET first_user_registered = TRUE WHERE id = \'site\'');
  });
  return (await findProfileById(id))!;
}

export async function hasRole(userId: string, role: 'admin' | 'super_admin') {
  const rows = await query<(RowDataPacket & { found: number })[]>('SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?) AS found', [userId, role]);
  return Boolean(rows[0]?.found);
}

export async function getSettings() {
  const rows = await query<(Settings & RowDataPacket)[]>('SELECT * FROM settings WHERE id = \'site\' LIMIT 1');
  const row = rows[0];
  if (!row) throw new Error('Site settings are not initialized.');
  return {
    ...row,
    provider_to_wallet_rate: Number(row.provider_to_wallet_rate),
    paystack_to_wallet_rate: Number(row.paystack_to_wallet_rate),
    min_deposit: Number(row.min_deposit),
    default_markup_percent: Number(row.default_markup_percent),
    registration_open: Boolean(row.registration_open),
    maintenance: Boolean(row.maintenance),
    first_user_registered: Boolean(row.first_user_registered),
  } as Settings;
}

export async function walletApply(userId: string, amount: number, type: string, description: string, reference: string) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.query<(Profile & RowDataPacket)[]>('SELECT balance FROM profiles WHERE id = ? FOR UPDATE', [userId]);
    const current = Number(rows[0]?.balance ?? 0);
    const next = current + amount;
    if (next < 0) throw new Error('Insufficient wallet balance.');
    await connection.execute('UPDATE profiles SET balance = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [next, userId]);
    await connection.execute('INSERT INTO transactions (id, user_id, type, amount, balance_after, description, reference) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE reference = reference', [randomUUID(), userId, type, amount, next, description, reference]);
    return next;
  });
}

export async function audit(actor: string, action: string, target: string, detail: string) {
  await execute('INSERT INTO audit_log (id, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)', [randomUUID(), actor, action, target, detail]);
}
