/**
 * The RBAC matrix. This is the single definition of who may do what — the table
 * in docs/SECURITY.md §4 is generated from the same shape.
 *
 * Pure data and pure functions: no I/O, no Prisma, no session. That is what lets
 * the whole matrix be unit-tested without a database.
 */

export const ROLES = ['ADMINISTRATOR', 'OPERATIONS_MANAGER', 'OPERATOR', 'VIEWER'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  // Reads — every role, including Viewer.
  'dashboard:read',
  'fleet:read',
  'operation:read',
  'weather:read',
  'risk:read',
  'alert:read',
  'asset:read',
  'incident:read',
  'analytics:read',

  // Operations: operators record what happened, managers change the plan.
  'operation:create',
  'operation:update',
  'operation:transition',
  'operation:cancel',
  'operation:delete',

  'vessel:create',
  'vessel:update',
  'vessel:archive',
  'vessel:status_update',

  // Acknowledging is taking ownership; resolving is a supervisory act.
  'alert:acknowledge',
  'alert:assign',
  'alert:resolve',

  'risk:create',
  'risk:update',
  'risk:close',

  'asset:create',
  'asset:update',
  'asset:status_update',

  'incident:create',
  'incident:investigate',
  'incident:close',

  'document:upload',

  'user:manage',
  'organization:manage',
  'integration:manage',
  'audit:read',

  'ai:query',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const READ_PERMISSIONS = [
  'dashboard:read',
  'fleet:read',
  'operation:read',
  'weather:read',
  'risk:read',
  'alert:read',
  'asset:read',
  'incident:read',
  'analytics:read',
  'ai:query',
] as const satisfies readonly Permission[]

/**
 * Built from least to most privileged so each role visibly extends the one below
 * it. An operator can do everything a viewer can, and so on — expressing that as
 * inheritance means a new read permission cannot accidentally reach only Viewer.
 */
const VIEWER: readonly Permission[] = READ_PERMISSIONS

const OPERATOR: readonly Permission[] = [
  ...VIEWER,
  'operation:transition',
  'vessel:status_update',
  'alert:acknowledge',
  'alert:assign',
  'asset:status_update',
  'incident:create',
  'document:upload',
]

const OPERATIONS_MANAGER: readonly Permission[] = [
  ...OPERATOR,
  'operation:create',
  'operation:update',
  'operation:cancel',
  'operation:delete',
  'alert:resolve',
  'risk:create',
  'risk:update',
  'risk:close',
  'asset:create',
  'asset:update',
  'incident:investigate',
  'incident:close',
  'audit:read',
]

const ADMINISTRATOR: readonly Permission[] = [
  ...OPERATIONS_MANAGER,
  'vessel:create',
  'vessel:update',
  'vessel:archive',
  'user:manage',
  'organization:manage',
  'integration:manage',
]

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  VIEWER: new Set(VIEWER),
  OPERATOR: new Set(OPERATOR),
  OPERATIONS_MANAGER: new Set(OPERATIONS_MANAGER),
  ADMINISTRATOR: new Set(ADMINISTRATOR),
}

/** Does this role hold this permission? Role check only — object ownership is checked separately. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission)
}

export function permissionsForRole(role: Role): Permission[] {
  return [...MATRIX[role]]
}
