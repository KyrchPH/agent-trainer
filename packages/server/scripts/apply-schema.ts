// Applies packages/server/src/schema.sql to whatever DB the .env points at.
// Safe to re-run: every CREATE TABLE uses IF NOT EXISTS and the seed INSERTs
// use ON DUPLICATE KEY UPDATE config_value = config_value.
//
// Usage (from packages/server):
//   npx tsx scripts/apply-schema.ts

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '../src/schema.sql');
const sql = readFileSync(schemaPath, 'utf-8');

const connOpts = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'agent_trainer',
  multipleStatements: true
};
console.log(`Connecting to ${connOpts.host}:${connOpts.port}/${connOpts.database} as ${connOpts.user}`);

const conn = await mysql.createConnection(connOpts);

const [before] = await conn.query('SHOW TABLES');
const beforeTables = (before as Array<Record<string, string>>).map(r => Object.values(r)[0]);
console.log(`Tables before: ${beforeTables.join(', ') || '(none)'}`);

await conn.query(sql);

const [after] = await conn.query('SHOW TABLES');
const afterTables = (after as Array<Record<string, string>>).map(r => Object.values(r)[0]);
console.log(`Tables after:  ${afterTables.join(', ')}`);

const added = afterTables.filter(t => !beforeTables.includes(t));
console.log(`Added: ${added.length ? added.join(', ') : '(none, all already existed)'}`);

await conn.end();
