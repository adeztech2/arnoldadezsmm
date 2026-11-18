import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL || process.env.DRIZZLE_DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required.');

const pool = mysql.createPool({
  uri: url,
  connectionLimit: 4,
  waitForConnections: true,
  ssl: { rejectUnauthorized: true },
});

try {
  const sql = await readFile(new URL('../drizzle/migrations/0001_manus_mysql.sql', import.meta.url), 'utf8');
  const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }
  console.log(`Applied ${statements.length} MySQL migration statements.`);
} finally {
  await pool.end();
}
