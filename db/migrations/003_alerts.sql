-- Watchlists + daily census-change alerting.
CREATE TABLE IF NOT EXISTS watches (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  usdot      TEXT NOT NULL,
  legal_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, usdot)
);

-- One census observation per watched DOT per day (the "daily file" baseline).
CREATE TABLE IF NOT EXISTS watch_history (
  id           BIGSERIAL PRIMARY KEY,
  usdot        TEXT NOT NULL,
  watched_on   DATE NOT NULL,
  content_hash TEXT NOT NULL,
  census       JSONB NOT NULL,
  UNIQUE (usdot, watched_on)
);

-- Change alerts, deduplicated per (user, DOT, event).
CREATE TABLE IF NOT EXISTS alerts (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  usdot       TEXT NOT NULL,
  alert_hash  TEXT NOT NULL,
  alert_type  TEXT NOT NULL DEFAULT 'record_changed',
  legal_name  TEXT,
  summary     TEXT NOT NULL,
  detail      JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read        BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (user_id, usdot, alert_hash)
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_time ON alerts (user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_watches_usdot ON watches (usdot);
CREATE INDEX IF NOT EXISTS idx_watch_history_usdot ON watch_history (usdot, id DESC);