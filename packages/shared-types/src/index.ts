export const systemRoles = ["ADMINISTRATOR", "OPERATIONS_COORDINATOR", "VIEWER"] as const;
export type SystemRole = (typeof systemRoles)[number];
export type PermissionCode = "organization:read" | "organization:manage" | "user:read" | "user:manage" | "audit:read";
export interface SessionUser { id: string; organizationId: string; email: string; name: string; roles: SystemRole[]; }
export interface AuditRecord { id: string; action: string; entityType: string; entityId: string; createdAt: string; }
