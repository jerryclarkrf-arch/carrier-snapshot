-- One row per carrier per day per distinct content: repeated identical
-- observations within the same day are skipped by /api/snapshot.
ALTER TABLE carrier_snapshots ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_carrier_snapshots_usdot_hash
  ON carrier_snapshots (usdot, content_hash);