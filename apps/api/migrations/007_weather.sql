CREATE TABLE IF NOT EXISTS weather_observations (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES offshore_assets(id) ON DELETE CASCADE,
  wind_speed double precision NOT NULL CHECK (wind_speed >= 0),
  wave_height double precision NOT NULL CHECK (wave_height >= 0),
  visibility double precision,
  source text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS weather_observations_asset_observed_idx ON weather_observations (asset_id, observed_at DESC);
