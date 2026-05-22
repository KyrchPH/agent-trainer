// One-shot importer for products.html.
// Usage: from packages/server, run
//   npx tsx scripts/import-products.ts [path-to-products.html] [--dry-run]
//
// The script is idempotent:
//   1. If the products table is missing the `category` column, it ALTERs it in.
//   2. It TRUNCATEs the products table before inserting, so re-running gives
//      the same end state regardless of prior imports.
//
// Category is taken from the source spreadsheet rows whose price is a range
// (e.g. "265-415" -> "REGULAR FABRIC CONDITIONER"). Subsequent rows with a
// single numeric price inherit that category until the next range row.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultPath = resolve(__dirname, '../../../products.html');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.find(a => !a.startsWith('--'));
const htmlPath = positional ? resolve(positional) : defaultPath;

const html = readFileSync(htmlPath, 'utf-8');

interface Product {
  name: string;
  price: number;
  category: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function cellText(raw: string): string {
  return decodeEntities(stripHtml(raw)).replace(/\s+/g, ' ').trim();
}

const SINGLE_PRICE = /^\d+(?:\.\d+)?$/;
// e.g. "260-440", "260 - 440", "265–415" (en-dash). Whole field.
const PRICE_RANGE = /^\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?$/;

const products: Product[] = [];
let currentCategory: string | null = null;
let categoryRowCount = 0;
let skippedCount = 0;

const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;

let trMatch: RegExpExecArray | null;
while ((trMatch = trRe.exec(html)) !== null) {
  const trBody = trMatch[1];
  const tds: string[] = [];
  let tdMatch: RegExpExecArray | null;
  while ((tdMatch = tdRe.exec(trBody)) !== null) {
    tds.push(cellText(tdMatch[1]));
  }
  if (tds.length < 2) continue;

  const name = tds[0];
  const priceText = tds[1];
  if (!name) continue;

  // Range price -> this row is a category header.
  if (PRICE_RANGE.test(priceText)) {
    currentCategory = name;
    categoryRowCount++;
    continue;
  }

  if (!priceText) {
    skippedCount++;
    continue;
  }
  if (!SINGLE_PRICE.test(priceText)) {
    skippedCount++;
    continue;
  }
  const price = parseFloat(priceText);
  if (!Number.isFinite(price) || price <= 0) {
    skippedCount++;
    continue;
  }

  products.push({ name, price, category: currentCategory });
}

console.log(`File: ${htmlPath}`);
console.log(`Categories detected: ${categoryRowCount}`);
console.log(`Products parsed: ${products.length}`);
console.log(`Skipped: ${skippedCount}`);

const uncategorised = products.filter(p => !p.category).length;
if (uncategorised > 0) {
  console.log(`Warning: ${uncategorised} products have no category (no range row above them).`);
}

if (dryRun) {
  console.log('\n=== Dry run preview (first 20) ===');
  for (const p of products.slice(0, 20)) {
    console.log(`  ${p.price.toString().padStart(7)}  [${p.category ?? '-'}]  ${p.name}`);
  }
  process.exit(0);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'agent_trainer'
});
console.log(`\nConnected to ${process.env.DB_HOST ?? '127.0.0.1'}/${process.env.DB_NAME ?? 'agent_trainer'}`);

// Ensure the `category` column and its index exist (idempotent migration).
const [colRows] = await conn.query(
  `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'category'`
);
const hasCategory = ((colRows as Array<{ n: number }>)[0]?.n ?? 0) > 0;
if (!hasCategory) {
  console.log('Adding `category` column to products table...');
  await conn.query('ALTER TABLE products ADD COLUMN category VARCHAR(255) NULL AFTER name');
  await conn.query('ALTER TABLE products ADD KEY idx_category (category)');
}

// Reset for a clean import.
const [beforeRows] = await conn.query('SELECT COUNT(*) AS n FROM products');
const before = (beforeRows as Array<{ n: number }>)[0].n;
console.log(`Existing rows: ${before}. Truncating before re-import...`);
await conn.query('TRUNCATE TABLE products');

let inserted = 0;
for (const p of products) {
  await conn.query('INSERT INTO products (name, category, price) VALUES (?, ?, ?)', [
    p.name,
    p.category,
    p.price
  ]);
  inserted++;
}

const [afterRows] = await conn.query('SELECT COUNT(*) AS n FROM products');
const after = (afterRows as Array<{ n: number }>)[0].n;

const [catRows] = await conn.query(
  'SELECT category, COUNT(*) AS n FROM products GROUP BY category ORDER BY n DESC'
);
console.log(`\nInserted ${inserted} rows. Total: ${after} (was ${before}).`);
console.log('\nProducts per category:');
for (const row of catRows as Array<{ category: string | null; n: number }>) {
  console.log(`  ${row.n.toString().padStart(4)}  ${row.category ?? '(uncategorised)'}`);
}

await conn.end();
