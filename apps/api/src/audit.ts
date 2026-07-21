import { randomUUID } from "node:crypto";
import { db } from "./database.js";
export async function audit(input: { organizationId: string; userId: string | null; action: string; entityType: string; entityId: string; previousValue?: object; newValue?: object; reason?: string; ipAddress?: string; correlationId?: string }): Promise<void> {
  await db().query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, previous_value, new_value, reason, ip_address, correlation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [randomUUID(), input.organizationId, input.userId, input.action, input.entityType, input.entityId, input.previousValue ?? null, input.newValue ?? null, input.reason ?? null, input.ipAddress ?? null, input.correlationId ?? null]);
}
