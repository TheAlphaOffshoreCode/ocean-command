-- Domain constraints Prisma cannot express in the schema.
-- Rationale: docs/DATABASE.md §5. These are not decoration: the application
-- computes these values, and the database refuses to store a row where the
-- computation disagreed with itself.

-- Risk score is probability x impact, both 1..5. A form that posts its own
-- score, or a bug in the engine, fails here instead of poisoning the matrix.
ALTER TABLE "Risk" ADD CONSTRAINT "risk_probability_range" CHECK ("probability" BETWEEN 1 AND 5);
ALTER TABLE "Risk" ADD CONSTRAINT "risk_impact_range" CHECK ("impact" BETWEEN 1 AND 5);
ALTER TABLE "Risk" ADD CONSTRAINT "risk_score_consistent" CHECK ("score" = "probability" * "impact");

-- An operation that ends before it starts is not a schedule.
ALTER TABLE "Operation" ADD CONSTRAINT "operation_planned_window" CHECK ("plannedEnd" > "plannedStart");
ALTER TABLE "Operation" ADD CONSTRAINT "operation_actual_window"
  CHECK ("actualEnd" IS NULL OR "actualStart" IS NULL OR "actualEnd" >= "actualStart");

-- Coordinates that are not coordinates put a vessel marker in the void.
ALTER TABLE "VesselPosition" ADD CONSTRAINT "position_bounds"
  CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "Vessel" ADD CONSTRAINT "vessel_last_position_bounds"
  CHECK (
    ("lastLatitude" IS NULL OR "lastLatitude" BETWEEN -90 AND 90)
    AND ("lastLongitude" IS NULL OR "lastLongitude" BETWEEN -180 AND 180)
  );
ALTER TABLE "Incident" ADD CONSTRAINT "incident_position_bounds"
  CHECK (
    ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90)
    AND ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180)
  );

ALTER TABLE "Asset" ADD CONSTRAINT "asset_condition_range"
  CHECK ("condition" IS NULL OR "condition" BETWEEN 0 AND 100);

-- Headings and courses are compass degrees.
ALTER TABLE "VesselPosition" ADD CONSTRAINT "position_bearing_range"
  CHECK (
    ("headingDeg" IS NULL OR "headingDeg" BETWEEN 0 AND 359)
    AND ("courseDeg" IS NULL OR "courseDeg" BETWEEN 0 AND 359)
  );

-- At most one *unresolved* alert per (source, ref, type).
--
-- A weather rule evaluated every 15 minutes must update its open alert rather
-- than raise 96 a day: an alert panel that produces noise is an alert panel
-- operators learn to ignore, and then a real critical alert scrolls past.
--
-- Partial unique index — no Prisma schema equivalent.
CREATE UNIQUE INDEX "alert_one_open_per_source"
  ON "Alert" ("organizationId", "sourceModule", "sourceRef", "type")
  WHERE "status" <> 'RESOLVED' AND "sourceRef" IS NOT NULL;
