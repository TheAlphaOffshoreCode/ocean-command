CREATE TABLE IF NOT EXISTS activity_resources (
  id uuid PRIMARY KEY,
  activity_id uuid NOT NULL REFERENCES operational_activities(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL CHECK (status IN ('REQUESTED','CONFIRMED','UNAVAILABLE','RELEASED')) DEFAULT 'REQUESTED',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, resource_type, resource_id)
);
CREATE INDEX IF NOT EXISTS activity_resources_lookup_idx ON activity_resources (resource_type, resource_id);
