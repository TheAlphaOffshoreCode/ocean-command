CREATE TABLE IF NOT EXISTS asset_areas (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES offshore_assets(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES asset_areas(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code text NOT NULL,
  type text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, code)
);
CREATE INDEX IF NOT EXISTS asset_areas_asset_idx ON asset_areas (asset_id, name);
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES offshore_assets(id) ON DELETE RESTRICT,
  area_id uuid REFERENCES asset_areas(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text NOT NULL,
  type text NOT NULL,
  status text NOT NULL CHECK (status IN ('AVAILABLE','IN_USE','MAINTENANCE','UNAVAILABLE','RETIRED')),
  criticality text NOT NULL CHECK (criticality IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  manufacturer text,
  model text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, code)
);
CREATE INDEX IF NOT EXISTS equipment_asset_idx ON equipment (asset_id, name);
