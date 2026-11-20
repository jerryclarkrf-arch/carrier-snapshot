-- Carrier search index (free-tier Neon project).
--
-- Holds only the fields needed to render search-result cards for ACTIVE
-- carriers. Full records are fetched on demand from the live FMCSA census.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS carrier_index (
  dot_number     integer PRIMARY KEY,
  legal_name     text NOT NULL,
  dba_name       text,
  city           text,
  state          char(2),
  status_code    char(1) NOT NULL,
  docket         text,
  docket_prefix  char(2),
  docket_digits  integer,
  docket_status  char(1),
  phone          text,
  email          text,
  power_units    integer,
  drivers        integer,
  add_date       date,
  mcs150_date    date
);

-- Marks when a row was last seen in a full sync. Rows not seen are removed, and
-- incremental upserts avoid rewriting unchanged rows (keeps WAL/history small).
ALTER TABLE carrier_index ADD COLUMN IF NOT EXISTS synced_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE carrier_index ADD COLUMN IF NOT EXISTS email text;

-- Word-based search over legal and DBA names. An expression index avoids
-- storing a separate tsvector column (saves ~150 MB at this row count).
CREATE INDEX IF NOT EXISTS carrier_index_name_fts_idx ON carrier_index USING gin (
  (setweight(to_tsvector('simple', coalesce(legal_name, '')), 'A') ||
   setweight(to_tsvector('simple', coalesce(dba_name, '')), 'B'))
);

CREATE INDEX IF NOT EXISTS carrier_index_state_city_idx ON carrier_index (state, city);
CREATE INDEX IF NOT EXISTS carrier_index_docket_idx ON carrier_index (docket_digits);

-- The email backfill and full syncs rewrite many rows and create dead tuples.
-- On the 1 GB free project, reclaim them at ~2% dead rows instead of the
-- default 20%, so the database size stays safely below the cap.
ALTER TABLE carrier_index SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 1000);

CREATE TABLE IF NOT EXISTS carrier_index_sync_runs (
  id           bigserial PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  rows_loaded  integer,
  db_size_bytes bigint,
  status       text NOT NULL DEFAULT 'running',
  message      text
);
