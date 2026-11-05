-- Cached NHTSA vPIC VIN decodes. FMCSA inspection files carry the VIN but no
-- year/make/model, and VIN -> vehicle attributes never change, so one decode per
-- VIN is enough for every inspection report that displays that vehicle.
CREATE TABLE IF NOT EXISTS vin_decode (
  vin           TEXT PRIMARY KEY,
  make          TEXT,
  model         TEXT,
  model_year    TEXT,
  body_class    TEXT,
  vehicle_type  TEXT,
  gvwr          TEXT,
  fuel_type     TEXT,
  plant_country TEXT,
  error_code    TEXT,
  decoded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
