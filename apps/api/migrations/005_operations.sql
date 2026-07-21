CREATE TABLE IF NOT EXISTS operational_activities (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES offshore_assets(id) ON DELETE RESTRICT,
  area_id uuid REFERENCES asset_areas(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  type text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text NOT NULL CHECK (status IN ('DRAFT','PLANNED','APPROVED','READY','IN_PROGRESS','PAUSED','BLOCKED','COMPLETED','CANCELLED','DELAYED')),
  risk_level text NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  planned_start timestamptz NOT NULL,
  planned_end timestamptz NOT NULL,
  actual_start timestamptz,
  actual_end timestamptz,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  responsible_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'MANUAL',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (planned_end > planned_start)
);
CREATE INDEX IF NOT EXISTS operational_activities_organization_schedule_idx ON operational_activities (organization_id, planned_start, planned_end);
CREATE INDEX IF NOT EXISTS operational_activities_asset_schedule_idx ON operational_activities (asset_id, planned_start, planned_end);

CREATE TABLE IF NOT EXISTS activity_dependencies (
  id uuid PRIMARY KEY,
  predecessor_activity_id uuid NOT NULL REFERENCES operational_activities(id) ON DELETE CASCADE,
  successor_activity_id uuid NOT NULL REFERENCES operational_activities(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('FINISH_TO_START','START_TO_START','FINISH_TO_FINISH','RESOURCE_DEPENDENCY','WEATHER_DEPENDENCY','DOCUMENT_DEPENDENCY','PERSONNEL_DEPENDENCY','EQUIPMENT_DEPENDENCY','VESSEL_DEPENDENCY')),
  lag_minutes integer NOT NULL DEFAULT 0 CHECK (lag_minutes >= 0),
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (predecessor_activity_id <> successor_activity_id),
  UNIQUE (predecessor_activity_id, successor_activity_id, type)
);
CREATE INDEX IF NOT EXISTS activity_dependencies_successor_idx ON activity_dependencies (successor_activity_id);
