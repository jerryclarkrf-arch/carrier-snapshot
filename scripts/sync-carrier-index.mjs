/**
 * Syncs ACTIVE carriers from the FMCSA census into the carrier-index project.
 *
 * Usage:
 *   npm run sync:carrier-index                    # full sync
 *   npm run sync:carrier-index -- --limit 5000    # small test run
 *   npm run sync:carrier-index -- --skip-delete   # keep existing extras
 *
 * Env (from .env.local or the environment):
 *   CARRIER_INDEX_DATABASE_URL_UNPOOLED  direct Neon connection
 *   DOT_APP_TOKEN                        Socrata app token
 *
 * Design notes:
 * - Incremental upsert: unchanged rows are not rewritten, so a weekly run does
 *   not churn WAL/history (the free project has a 1 GB cap).
 * - Removals use a temp table of seen DOT numbers + an anti-join, which is far
 *   cheaper and safer than a full truncate/rebuild.
 * - The whole run is resumable: rerunning simply upserts again.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const CENSUS = 'https://data.transportation.gov/resource/az4n-8mr2.json';
const FIELDS = [
  'dot_number',
  'legal_name',
  'dba_name',
  'phy_city',
  'phy_state',
  'status_code',
  'docket1',
  'docket1prefix',
  'docket1_status_code',
  'phone',
  'power_units',
  'total_drivers',
  'add_date',
  'mcsipdate',
];
const PAGE_SIZE = Math.min(Number(process.env.SYNC_PAGE_SIZE || 20000), 50000);
const BATCH_SIZE = 1000;

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
const limitIndex = args.indexOf('--limit');
const limitArg = limitIndex >= 0 ? Number(args[limitIndex + 1]) : NaN;
const maxRows = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : Infinity;
const offsetIndex = args.indexOf('--offset');
const startOffset = offsetIndex >= 0 ? Math.max(0, Number(args[offsetIndex + 1]) || 0) : 0;
const deltaIndex = args.indexOf('--delta-days');
const deltaDays = deltaIndex >= 0 ? Math.max(1, Number(args[deltaIndex + 1]) || 3) : null;
const deltaSince = deltaDays
  ? new Date(Date.now() - deltaDays * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')
  : null;
const skipDelete =
  args.includes('--skip-delete') || maxRows !== Infinity || startOffset > 0 || deltaDays !== null;
const pageSize = deltaDays
  ? Math.min(PAGE_SIZE, 5000)
  : maxRows === Infinity
    ? PAGE_SIZE
    : Math.min(PAGE_SIZE, maxRows);
const modeLabel = deltaDays ? `delta ${deltaDays}d since=${deltaSince}` : 'full';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toDate(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? null : iso;
}

function mapRow(row) {
  const dot = toInt(row.dot_number);
  const legalName = String(row.legal_name || '').trim();
  if (!dot || !legalName) return null;

  const docketDigits = toInt(row.docket1);
  const prefix = String(row.docket1prefix || '').trim().toUpperCase() || null;
  const docket = prefix && docketDigits ? `${prefix}${docketDigits}` : docketDigits ? String(docketDigits) : null;

  return {
    dot_number: dot,
    legal_name: legalName,
    dba_name: String(row.dba_name || '').trim() || null,
    city: String(row.phy_city || '').trim() || null,
    state: String(row.phy_state || '').trim().toUpperCase().slice(0, 2) || null,
    status_code: String(row.status_code || 'A').trim().slice(0, 1) || 'A',
    docket,
    docket_prefix: prefix,
    docket_digits: docketDigits,
    docket_status: String(row.docket1_status_code || '').trim().slice(0, 1) || null,
    phone: String(row.phone || '').replace(/\D/g, '').slice(-10) || null,
    power_units: toInt(row.power_units),
    drivers: toInt(row.total_drivers),
    add_date: toDate(row.add_date),
    mcs150_date: toDate(row.mcsipdate),
  };
}

async function fetchPage(offset) {
  const where = deltaSince
    ? `status_code='A' AND add_date >= '${deltaSince}'`
    : `status_code='A'`;
  const url = `${CENSUS}?${new URLSearchParams({
    $limit: String(pageSize),
    $offset: String(offset),
    $select: FIELDS.join(','),
    $order: 'dot_number',
    $where: where,
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
        `  network error (${error instanceof Error ? error.message : String(error)}) — retrying in ${wait / 1000}s (attempt ${attempt})`
      );
      await sleep(wait);
      continue;
    }
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 12) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`Socrata ${res.status}: ${body}`);
    }
    // The federated census throttles in long windows; wait it out rather than
    // failing a multi-hour bulk load.
    const wait = Math.min(30_000 * attempt, 180_000);
    console.log(`  HTTP ${res.status} — retrying in ${wait / 1000}s (attempt ${attempt})`);
    await sleep(wait);
  }
}

const COLUMNS = [
  'dot_number',
  'legal_name',
  'dba_name',
  'city',
  'state',
  'status_code',
  'docket',
  'docket_prefix',
  'docket_digits',
  'docket_status',
  'phone',
  'power_units',
  'drivers',
  'add_date',
  'mcs150_date',
];

const DATA_COLUMNS = COLUMNS.filter((column) => column !== 'dot_number');

function buildUpsert(rows) {
  const values = [];
  const tuples = rows.map((row, index) => {
    const base = index * COLUMNS.length;
    for (const column of COLUMNS) values.push(row[column]);
    return `(${COLUMNS.map((_, offset) => `$${base + offset + 1}`).join(', ')})`;
  });

  const updates = DATA_COLUMNS.map((column) => `${column} = EXCLUDED.${column}`).join(', ');
  const current = DATA_COLUMNS.map((column) => `carrier_index.${column}`).join(', ');
  const incoming = DATA_COLUMNS.map((column) => `EXCLUDED.${column}`).join(', ');

  return {
    values,
    sql: `INSERT INTO carrier_index (${COLUMNS.join(', ')})
          VALUES ${tuples.join(', ')}
          ON CONFLICT (dot_number) DO UPDATE SET ${updates}
          WHERE (${current}) IS DISTINCT FROM (${incoming})`,
  };
}

async function upsertBatch(client, rows) {
  const { sql, values } = buildUpsert(rows);
  await client.query('BEGIN');
  try {
    await client.query(sql, values);
    await client.query(
      'INSERT INTO seen_dots (dot_number) SELECT unnest($1::int[]) ON CONFLICT DO NOTHING',
      [rows.map((row) => row.dot_number)]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

const client = new pg.Client({ connectionString });
await client.connect();

let runId = null;
let processed = 0;

try {
  await client.query(readFileSync(join(root, 'db', 'carrier-index.sql'), 'utf8'));
  await client.query(
    'CREATE TEMP TABLE IF NOT EXISTS seen_dots (dot_number integer PRIMARY KEY) ON COMMIT PRESERVE ROWS'
  );

  const run = await client.query(
    `INSERT INTO carrier_index_sync_runs (status, message)
     VALUES ('running', $1) RETURNING id`,
    [`mode=${modeLabel} page=${pageSize} limit=${maxRows === Infinity ? 'all' : maxRows}`]
  );
  runId = run.rows[0].id;
  console.log(`Sync mode: ${modeLabel} (page ${pageSize})`);

  let offset = startOffset;
  let keepGoing = true;

  while (keepGoing) {
    const page = await fetchPage(offset);
    if (!Array.isArray(page) || page.length === 0) break;

    const mapped = [];
    for (const row of page) {
      const carrier = mapRow(row);
      if (carrier) mapped.push(carrier);
    }

    const unique = [...new Map(mapped.map((carrier) => [carrier.dot_number, carrier])).values()];

    for (let index = 0; index < unique.length; index += BATCH_SIZE) {
      await upsertBatch(client, unique.slice(index, index + BATCH_SIZE));
      processed += Math.min(BATCH_SIZE, unique.length - index);
    }

    offset += page.length;
    if (page.length < pageSize) keepGoing = false;
    if (processed >= maxRows) keepGoing = false;

    console.log(`  +${unique.length} rows (total ${processed}), offset ${offset}`);
    if (keepGoing) await sleep(3000);
  }

  let removed = 0;
  if (!skipDelete) {
    const result = await client.query(
      `DELETE FROM carrier_index c
       WHERE NOT EXISTS (SELECT 1 FROM seen_dots s WHERE s.dot_number = c.dot_number)`
    );
    removed = result.rowCount ?? 0;
    console.log(`  removed ${removed} carriers that are no longer active`);
  }

  await client.query('ANALYZE carrier_index');

  const stats = await client.query(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
            pg_size_pretty(pg_total_relation_size('carrier_index')) AS table_size,
            (SELECT count(*) FROM carrier_index) AS rows`
  );
  const { db_size: dbSize, table_size: tableSize, rows } = stats.rows[0];
  console.log(`Done: rows=${rows} table=${tableSize} database=${dbSize} removed=${removed}`);

  await client.query(
    `UPDATE carrier_index_sync_runs
     SET finished_at = now(), rows_loaded = $2,
         db_size_bytes = pg_database_size(current_database()),
         status = 'ok', message = $3
     WHERE id = $1`,
    [runId, processed, `mode=${modeLabel} removed=${removed}`]
  );

  if (dbSize && dbSize.endsWith('MB') && Number(dbSize.replace(' MB', '')) > 850) {
    console.warn('WARNING: database is above 850 MB — trim fields or move this project to Launch.');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Sync failed:', message);
  if (runId) {
    await client
      .query(
        `UPDATE carrier_index_sync_runs
         SET finished_at = now(), status = 'error', message = $2
         WHERE id = $1`,
        [runId, message.slice(0, 500)]
      )
      .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await client.end();
}

