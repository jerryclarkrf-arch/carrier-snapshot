/**
 * Fills carrier_index.email from the FMCSA census without rewriting whole rows.
 *
 * The full sync upserts all 16 columns (and records seen DOTs for deletion),
 * which is slow when the only change is a new email column. This script fetches
 * only dot_number/email_address for active carriers and runs a set-based
 * `UPDATE ... FROM unnest(...)`, touching only rows whose email is still NULL.
 *
 * Usage:
 *   npm run backfill:carrier-email
 *   npm run backfill:carrier-email -- --offset 50000
 *   npm run backfill:carrier-email -- --limit 2000
 *
 * Env (from .env.local or the environment):
 *   CARRIER_INDEX_DATABASE_URL_UNPOOLED  direct Neon connection
 *   DOT_APP_TOKEN                        Socrata app token
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const PAGE_SIZE = Math.min(Number(process.env.BACKFILL_PAGE_SIZE || 20000), 50000);
const BATCH_SIZE = 5000;
// Updating ~2.2 M rows creates dead tuples faster than the default autovacuum
// (20% of the table) reclaims them. The free project is capped at 1 GB, so
// vacuum at 800 MB and abort before the cap if that does not bring it down.
const DB_VACUUM_BYTES = 800 * 1024 * 1024;
const DB_ABORT_BYTES = 900 * 1024 * 1024;

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
const token = process.env.DOT_APP_TOKEN || '';
if (!connectionString) {
  console.error('CARRIER_INDEX_DATABASE_URL_UNPOOLED is not set');
  process.exit(1);
}

const args = process.argv.slice(2);
const offsetIndex = args.indexOf('--offset');
const startOffset = offsetIndex >= 0 ? Math.max(0, Number(args[offsetIndex + 1]) || 0) : 0;
const limitIndex = args.indexOf('--limit');
const limitArg = limitIndex >= 0 ? Number(args[limitIndex + 1]) : NaN;
const maxRows = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : Infinity;
const pageSize = maxRows === Infinity ? PAGE_SIZE : Math.min(PAGE_SIZE, maxRows);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(offset) {
  const url = `${CENSUS}?${new URLSearchParams({
    $limit: String(pageSize),
    $offset: String(offset),
    $select: 'dot_number,email_address',
    $order: 'dot_number',
    $where: "status_code='A' AND email_address IS NOT NULL",
  })}`;

  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: token ? { 'X-App-Token': token } : {},
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      if (attempt >= 12) throw error;
      const wait = Math.min(30_000 * attempt, 180_000);
      console.log(
        `  network error (${error instanceof Error ? error.message : String(error)}) - retrying in ${wait / 1000}s (attempt ${attempt})`
      );
      await sleep(wait);
      continue;
    }
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 12) {
      throw new Error(`Socrata ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const wait = Math.min(30_000 * attempt, 180_000);
    console.log(`  HTTP ${res.status} - retrying in ${wait / 1000}s (attempt ${attempt})`);
    await sleep(wait);
  }
}

function mapRows(rows) {
  const unique = new Map();
  for (const row of rows) {
    const dot = Number(row.dot_number);
    const email = String(row.email_address || '').trim();
    if (Number.isFinite(dot) && dot > 0 && email) unique.set(dot, email);
  }
  return [...unique].map(([dot_number, email]) => ({ dot_number, email }));
}

async function fillBatch(client, rows) {
  const { rowCount } = await client.query(
    `UPDATE carrier_index AS c
     SET email = v.email
     FROM unnest($1::int[], $2::text[]) AS v(dot_number, email)
     WHERE c.dot_number = v.dot_number AND c.email IS NULL`,
    [rows.map((row) => row.dot_number), rows.map((row) => row.email)]
  );
  return rowCount ?? 0;
}

const client = new pg.Client({ connectionString });
await client.connect();

let offset = startOffset;
let fetched = 0;
let filled = 0;

try {
  await client.query(
    `ALTER TABLE carrier_index SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 1000)`
  );
  console.log(`Email backfill: offset=${startOffset} page=${pageSize}`);
  while (fetched < maxRows) {
    const page = await fetchPage(offset);
    if (!Array.isArray(page) || page.length === 0) break;

    const rows = mapRows(page);
    fetched += page.length;
    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      filled += await fillBatch(client, rows.slice(index, index + BATCH_SIZE));
    }

    offset += page.length;

    const size = await client.query(
      `SELECT pg_database_size(current_database()) AS bytes`
    );
    const bytes = Number(size.rows[0].bytes);
    console.log(
      `  fetched ${page.length}, filled ${filled} total (offset ${offset}, db ${(bytes / 1024 / 1024).toFixed(0)} MB)`
    );
    if (bytes > DB_ABORT_BYTES) {
      throw new Error(
        `database is ${(bytes / 1024 / 1024).toFixed(0)} MB; aborting before the 1 GB cap`
      );
    }
    if (bytes > DB_VACUUM_BYTES) {
      console.log('  database above 800 MB - vacuuming before the next page');
      await client.query('VACUUM (ANALYZE) carrier_index');
    }

    if (page.length < pageSize || fetched >= maxRows) break;
    await sleep(2000);
  }

  const stats = await client.query(
    `SELECT count(*) FILTER (WHERE email IS NOT NULL)::int AS with_email,
            count(*)::int AS total,
            pg_size_pretty(pg_database_size(current_database())) AS db_size
     FROM carrier_index`
  );
  console.log(
    `Done: with_email=${stats.rows[0].with_email}/${stats.rows[0].total} database=${stats.rows[0].db_size} filled=${filled}`
  );

  const size = stats.rows[0].db_size;
  if (size && size.endsWith('MB') && Number(size.replace(' MB', '')) > 850) {
    console.warn('WARNING: database is above 850 MB - trim fields or move the project to Launch.');
  }
} catch (error) {
  console.error('Backfill failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
