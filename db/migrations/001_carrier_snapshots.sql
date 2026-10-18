-- Append-only history of carrier snapshots. One row per observed state, so
-- phone/email/insurance/status changes over time can be reconstructed.
CREATE TABLE IF NOT EXISTS carrier_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  usdot             TEXT NOT NULL,
  snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id           TEXT,
  legal_name        TEXT,
  dba               TEXT,
  entity_types      TEXT[],
  owner_name        TEXT,
  phone             TEXT,
  email             TEXT,
  city              TEXT,
  state             TEXT,
  zip               TEXT,
  power_units       INTEGER,
  drivers           INTEGER,
  dot_status        TEXT,
  auth_status       TEXT,
  added_date        TEXT,
  mcs150_date       TEXT,
  insurance_policies JSONB,
  insurance_financial JSONB,
  status_events     JSONB
);

CREATE INDEX IF NOT EXISTS idx_carrier_snapshots_usdot_time
  ON carrier_snapshots (usdot, snapshot_at DESC);