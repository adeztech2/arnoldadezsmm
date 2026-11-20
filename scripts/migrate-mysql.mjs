import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const url = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({ host: url.hostname, port: url.port ? Number(url.port) : 3306, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)), connectionLimit: 2, ssl: { rejectUnauthorized: true }, timezone: 'Z' });
const sql = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations/001_mysql.sql'), 'utf8');
const statements = sql.split(/;\s*(?:\n|$)/).map(value => value.trim()).filter(Boolean);
const connection = await pool.getConnection();
try { for (const statement of statements) await connection.query(statement); console.log(`Applied ${statements.length} Manus MySQL statements.`); }
finally { connection.release(); await pool.end(); }
