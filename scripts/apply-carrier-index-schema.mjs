/**
 * Applies db/carrier-index.sql to the carrier-index Neon project.
 *
 * Usage:
 *   node scripts/apply-carrier-index-schema.mjs
 *
 * Reads CARRIER_INDEX_DATABASE_URL_UNPOOLED (or CARRIER_INDEX_DATABASE_URL)
 * from .env.local. Direct (unpooled) connections are required for DDL.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function loadEnv() {
  try {
    const raw = readFileSync(join(root, '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // .env.local is optional when the variables are already in the environment.
  }
}

loadEnv();

const connectionString =
  process.env.CARRIER_INDEX_DATABASE_URL_UNPOOLED || process.env.CARRIER_INDEX_DATABASE_URL;
if (!connectionString) {
  console.error('CARRIER_INDEX_DATABASE_URL_UNPOOLED is not set');
  process.exit(1);
}

const sql = readFileSync(join(root, 'db', 'carrier-index.sql'), 'utf8');
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(
    `select pg_size_pretty(pg_database_size(current_database())) as size,
            (select count(*) from carrier_index) as rows`
  );
  console.log('Schema applied:', rows[0]);
} finally {
  await client.end();
}
