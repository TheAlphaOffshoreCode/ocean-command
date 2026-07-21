CREATE TABLE IF NOT EXISTS offshore_assets (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code text NOT NULL,
  type text NOT NULL CHECK (type IN ('FPSO','FIXED_PLATFORM','DRILLING_RIG','SEMI_SUBMERSIBLE','JACKUP','WIND_FARM','SUBSEA_FIELD','TERMINAL','PORT_BASE','OTHER')),
  status text NOT NULL CHECK (status IN ('PLANNED','ACTIVE','MAINTENANCE','INACTIVE','DECOMMISSIONED')),
  latitude double precision NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude double precision NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  timezone text NOT NULL DEFAULT 'UTC',
  operator text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS offshore_assets_organization_idx ON offshore_assets (organization_id, name);
