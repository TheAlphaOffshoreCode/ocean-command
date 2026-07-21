ALTER TABLE alerts ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS alert_events (
  id uuid PRIMARY KEY,
  alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('CREATED','ASSIGNED','ACKNOWLEDGED','RESOLVED','REOPENED','NOTE')),
  previous_status text,
  next_status text,
  note text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS alert_events_alert_created_idx ON alert_events (alert_id, created_at);
