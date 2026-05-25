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

// Idempotent column migrations. CREATE TABLE IF NOT EXISTS won't alter an
// existing table, so column additions need explicit handling. Each entry
// below checks INFORMATION_SCHEMA before ALTERing so re-running is safe.
const columnMigrations: Array<{ table: string; column: string; ddl: string }> = [
  {
    table: 'messages',
    column: 'from_qa_entries',
    ddl: 'ALTER TABLE messages ADD COLUMN from_qa_entries TINYINT(1) NOT NULL DEFAULT 0 AFTER content'
  },
  {
    table: 'suggestions',
    column: 'updated_at',
    ddl: 'ALTER TABLE suggestions ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at'
  }
];

for (const m of columnMigrations) {
  const [colRows] = await conn.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [connOpts.database, m.table, m.column]
  );
  const exists = Number((colRows as Array<{ n: number }>)[0]?.n ?? 0) > 0;
  if (exists) {
    console.log(`Column ${m.table}.${m.column}: already present.`);
  } else {
    console.log(`Column ${m.table}.${m.column}: adding...`);
    await conn.query(m.ddl);
    console.log(`Column ${m.table}.${m.column}: added.`);
  }
}

await conn.end();
