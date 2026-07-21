import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { audit } from "./audit.js";
import { requireAuth, requireRole } from "./auth.js";
import { db } from "./database.js";

const activityInputSchema = z.object({
  assetId: z.string().uuid(), areaId: z.string().uuid().optional(), title: z.string().min(2).max(200), description: z.string().max(4000).optional(), type: z.string().min(2).max(80),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"), status: z.enum(["DRAFT", "PLANNED", "APPROVED", "READY", "IN_PROGRESS", "PAUSED", "BLOCKED", "COMPLETED", "CANCELLED", "DELAYED"]).default("DRAFT"),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"), plannedStart: z.string().datetime(), plannedEnd: z.string().datetime(), progress: z.number().int().min(0).max(100).default(0), metadata: z.record(z.string(), z.unknown()).default({})
});
const activitySchema = activityInputSchema.refine((value) => new Date(value.plannedEnd) > new Date(value.plannedStart), { message: "plannedEnd must be after plannedStart", path: ["plannedEnd"] });
const dependencySchema = z.object({ predecessorActivityId: z.string().uuid(), successorActivityId: z.string().uuid(), type: z.enum(["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "RESOURCE_DEPENDENCY", "WEATHER_DEPENDENCY", "DOCUMENT_DEPENDENCY", "PERSONNEL_DEPENDENCY", "EQUIPMENT_DEPENDENCY", "VESSEL_DEPENDENCY"]).default("FINISH_TO_START"), lagMinutes: z.number().int().min(0).default(0), required: z.boolean().default(true) });

function changed(body: object) { return Object.keys(body).length > 0; }

export function registerPhaseThreeRoutes(app: FastifyInstance) {
  app.get("/api/v1/activities", async (request) => {
    const claims = await requireAuth(request); const query = request.query as { assetId?: string; from?: string; to?: string };
    const result = await db().query("SELECT id,asset_id,area_id,title,description,type,priority,status,risk_level,planned_start,planned_end,actual_start,actual_end,progress,metadata,created_at,updated_at FROM operational_activities WHERE organization_id=$1 AND ($2::uuid IS NULL OR asset_id=$2) AND ($3::timestamptz IS NULL OR planned_end >= $3) AND ($4::timestamptz IS NULL OR planned_start <= $4) ORDER BY planned_start", [claims.organizationId, query.assetId ?? null, query.from ?? null, query.to ?? null]);
    return { data: result.rows };
  });
  app.get("/api/v1/activities/timeline", async (request) => {
    const claims = await requireAuth(request); const result = await db().query("SELECT a.id,a.title,a.type,a.priority,a.status,a.risk_level,a.planned_start,a.planned_end,a.progress,o.name asset_name, EXISTS (SELECT 1 FROM operational_activities x WHERE x.organization_id=a.organization_id AND x.asset_id=a.asset_id AND x.id<>a.id AND x.status NOT IN ('CANCELLED','COMPLETED') AND x.planned_start<a.planned_end AND x.planned_end>a.planned_start) AS has_schedule_conflict FROM operational_activities a JOIN offshore_assets o ON o.id=a.asset_id WHERE a.organization_id=$1 ORDER BY a.planned_start", [claims.organizationId]);
    return { data: result.rows };
  });
  app.post("/api/v1/activities", async (request, reply) => {
    const claims = await requireAuth(request); requireRole(claims, ["ADMINISTRATOR", "OPERATIONS_COORDINATOR"]); const body = activitySchema.parse(request.body);
    const asset = await db().query("SELECT id FROM offshore_assets WHERE id=$1 AND organization_id=$2", [body.assetId, claims.organizationId]); if (!asset.rows[0]) return reply.code(422).send({ message: "Asset is unavailable" });
    if (body.areaId) { const area = await db().query("SELECT id FROM asset_areas WHERE id=$1 AND asset_id=$2", [body.areaId, body.assetId]); if (!area.rows[0]) return reply.code(422).send({ message: "Area is unavailable" }); }
    const id = randomUUID(); const result = await db().query("INSERT INTO operational_activities (id,organization_id,asset_id,area_id,title,description,type,priority,status,risk_level,planned_start,planned_end,progress,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *", [id, claims.organizationId, body.assetId, body.areaId ?? null, body.title, body.description ?? null, body.type, body.priority, body.status, body.riskLevel, body.plannedStart, body.plannedEnd, body.progress, body.metadata]);
    await audit({ organizationId: claims.organizationId, userId: claims.sub, action: "activity.created", entityType: "OperationalActivity", entityId: id, newValue: body, ipAddress: request.ip, correlationId: request.id }); return reply.code(201).send(result.rows[0]);
  });
  app.patch("/api/v1/activities/:id", async (request, reply) => {
    const claims = await requireAuth(request); requireRole(claims, ["ADMINISTRATOR", "OPERATIONS_COORDINATOR"]); const body = activityInputSchema.omit({ assetId: true, areaId: true }).partial().parse(request.body); if (!changed(body)) return reply.code(400).send({ message: "At least one field is required" });
    const id = (request.params as { id: string }).id; const currentResult = await db().query("SELECT * FROM operational_activities WHERE id=$1 AND organization_id=$2", [id, claims.organizationId]); const current = currentResult.rows[0] as Record<string, unknown> | undefined; if (!current) return reply.code(404).send({ message: "Activity not found" });
    const next: Record<string, unknown> = { ...current, ...body }; if (new Date(String(next["planned_end"] ?? next["plannedStart"])) <= new Date(String(next["planned_start"] ?? next["plannedEnd"]))) return reply.code(400).send({ message: "plannedEnd must be after plannedStart" });
    const result = await db().query("UPDATE operational_activities SET title=$3,description=$4,type=$5,priority=$6,status=$7,risk_level=$8,planned_start=$9,planned_end=$10,progress=$11,metadata=$12,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *", [id, claims.organizationId, next["title"], next["description"], next["type"], next["priority"], next["status"], next["risk_level"] ?? next["riskLevel"], next["planned_start"] ?? next["plannedStart"], next["planned_end"] ?? next["plannedEnd"], next["progress"], next["metadata"]]);
    await audit({ organizationId: claims.organizationId, userId: claims.sub, action: "activity.updated", entityType: "OperationalActivity", entityId: id, previousValue: current, newValue: body, ipAddress: request.ip, correlationId: request.id }); return result.rows[0];
  });
  app.delete("/api/v1/activities/:id", async (request, reply) => { const claims = await requireAuth(request); requireRole(claims, ["ADMINISTRATOR"]); const result = await db().query("DELETE FROM operational_activities WHERE id=$1 AND organization_id=$2 RETURNING id,title", [(request.params as { id: string }).id, claims.organizationId]); if (!result.rows[0]) return reply.code(404).send({ message: "Activity not found" }); await audit({ organizationId: claims.organizationId, userId: claims.sub, action: "activity.deleted", entityType: "OperationalActivity", entityId: result.rows[0].id, previousValue: result.rows[0], ipAddress: request.ip, correlationId: request.id }); return reply.code(204).send(); });
  app.get("/api/v1/activity-dependencies", async (request) => { const claims = await requireAuth(request); const result = await db().query("SELECT d.* FROM activity_dependencies d JOIN operational_activities a ON a.id=d.predecessor_activity_id JOIN operational_activities b ON b.id=d.successor_activity_id WHERE a.organization_id=$1 AND b.organization_id=$1 ORDER BY d.created_at", [claims.organizationId]); return { data: result.rows }; });
  app.post("/api/v1/activity-dependencies", async (request, reply) => {
    const claims = await requireAuth(request); requireRole(claims, ["ADMINISTRATOR", "OPERATIONS_COORDINATOR"]); const body = dependencySchema.parse(request.body); if (body.predecessorActivityId === body.successorActivityId) return reply.code(422).send({ message: "An activity cannot depend on itself" });
    const owned = await db().query("SELECT id FROM operational_activities WHERE organization_id=$1 AND id=ANY($2::uuid[])", [claims.organizationId, [body.predecessorActivityId, body.successorActivityId]]); if (owned.rowCount !== 2) return reply.code(422).send({ message: "Activities are unavailable" });
    const cycle = await db().query("WITH RECURSIVE descendants(id) AS (SELECT successor_activity_id FROM activity_dependencies WHERE predecessor_activity_id=$1 UNION SELECT d.successor_activity_id FROM activity_dependencies d JOIN descendants x ON d.predecessor_activity_id=x.id) SELECT 1 FROM descendants WHERE id=$2", [body.successorActivityId, body.predecessorActivityId]); if (cycle.rows[0]) return reply.code(409).send({ message: "Dependency would create a cycle" });
    const id = randomUUID(); const result = await db().query("INSERT INTO activity_dependencies (id,predecessor_activity_id,successor_activity_id,type,lag_minutes,required) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [id, body.predecessorActivityId, body.successorActivityId, body.type, body.lagMinutes, body.required]); await audit({ organizationId: claims.organizationId, userId: claims.sub, action: "activity.dependency_created", entityType: "ActivityDependency", entityId: id, newValue: body, ipAddress: request.ip, correlationId: request.id }); return reply.code(201).send(result.rows[0]);
  });
}
