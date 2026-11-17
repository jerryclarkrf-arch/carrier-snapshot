/**
 * Read access to the carrier-index Neon project.
 *
 * The index holds active carriers only (name, location, status, docket, fleet
 * size). It answers name searches without touching the throttled FMCSA feed;
 * full records are fetched on demand by /api/carrier.
 */

import { Pool, type PoolClient } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

let pool: Pool | null = null;

function getPool(): Pool | null {
  const connectionString = process.env.CARRIER_INDEX_DATABASE_URL;
  if (!connectionString) return null;
  if (!pool) {
    const created = new Pool({ connectionString, max: 5 });
    attachDatabasePool(created);
    pool = created;
  }
  return pool;
}

export interface IndexedCarrier {
  dot_number: number;
  legal_name: string;
  dba_name: string | null;
  city: string | null;
  state: string | null;
  status_code: string;
  docket: string | null;
  docket_prefix: string | null;
  docket_status: string | null;
  phone: string | null;
  power_units: number | null;
  drivers: number | null;
  add_date: string | null;
  mcs150_date: string | null;
}

export interface CarrierIndexResult {
  rows: IndexedCarrier[];
  total: number;
  estimated: boolean;
}

const SEARCH_EXPR = `(setweight(to_tsvector('simple', coalesce(legal_name, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(dba_name, '')), 'B'))`;

export function isCarrierIndexEnabled(): boolean {
  return process.env.SEARCH_INDEX_ENABLED === 'true' && Boolean(process.env.CARRIER_INDEX_DATABASE_URL);
}

/**
 * Turns a user term into a prefix-aware tsquery. Words of two or more
 * characters are ANDed, so "falcon truck" matches "FALCON TRUCKING".
 */
export function toTsQuery(term: string): string | null {
  const words = term
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .slice(0, 6);
  if (words.length === 0) return null;
  return words.map((word) => `${word}:*`).join(' & ');
}

export async function searchCarrierIndex(
  term: string,
  limit: number,
  offset: number
): Promise<CarrierIndexResult | null> {
  const client = getPool();
  const tsquery = toTsQuery(term);
  if (!client || !tsquery) return null;

  try {
    const rowsPromise = client.query<IndexedCarrier>(
      `SELECT dot_number, legal_name, dba_name, city, state, status_code, docket,
              docket_prefix, docket_status, phone, power_units, drivers,
              add_date::text AS add_date, mcs150_date::text AS mcs150_date,
              ts_rank(${SEARCH_EXPR}, to_tsquery('simple', $1)) AS rank
       FROM carrier_index
       WHERE ${SEARCH_EXPR} @@ to_tsquery('simple', $1)
       ORDER BY rank DESC, legal_name ASC
       LIMIT $2 OFFSET $3`,
      [tsquery, limit, offset]
    );

    const countPromise = (async (): Promise<number | null> => {
      let checkedOut: PoolClient | undefined;
      try {
        checkedOut = await client.connect();
        await checkedOut.query('BEGIN');
        await checkedOut.query("SET LOCAL statement_timeout = '2500ms'");
        const result = await checkedOut.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM carrier_index
           WHERE ${SEARCH_EXPR} @@ to_tsquery('simple', $1)`,
          [tsquery]
        );
        await checkedOut.query('COMMIT');
        return result.rows[0]?.total ?? null;
      } catch {
        return null;
      } finally {
        checkedOut?.release();
      }
    })();

    const [rowsResult, total] = await Promise.all([rowsPromise, countPromise]);
    return {
      rows: rowsResult.rows,
      total: total ?? rowsResult.rows.length,
      estimated: total === null,
    };
  } catch (error) {
    console.warn('[carrier-index] search failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function carrierIndexStats(): Promise<{
  rows: number;
  size: string;
  lastSync: string | null;
} | null> {
  const client = getPool();
  if (!client) return null;
  try {
    const { rows } = await client.query<{ rows: number; size: string; last_sync: string | null }>(
      `SELECT (SELECT count(*)::int FROM carrier_index) AS rows,
              pg_size_pretty(pg_database_size(current_database())) AS size,
              (SELECT to_char(max(finished_at), 'YYYY-MM-DD HH24:MI')
                 FROM carrier_index_sync_runs WHERE status = 'ok') AS last_sync`
    );
    const row = rows[0];
    return row ? { rows: row.rows, size: row.size, lastSync: row.last_sync } : null;
  } catch {
    return null;
  }
}
