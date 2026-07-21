CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS operational_nodes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  node_type text NOT NULL,
  entity_id text NOT NULL,
  label text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, node_type, entity_id)
);
CREATE TABLE IF NOT EXISTS operational_edges (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES operational_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES operational_nodes(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  critical boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_node_id <> target_node_id),
  UNIQUE (source_node_id, target_node_id, relation_type)
);
CREATE INDEX IF NOT EXISTS operational_edges_source_idx ON operational_edges (source_node_id);
CREATE INDEX IF NOT EXISTS operational_edges_target_idx ON operational_edges (target_node_id);
