import { AuthorizationError, NotFoundError } from '@/lib/errors'

import { roleHasPermission, type Permission } from './permissions'
import type { TenantContext } from './tenant-context'

/** Anything owned by an organization. Enough to check ownership, nothing more. */
type OwnedResource = { organizationId: string }

/**
 * The single authorization gate. Two checks, in this order:
 *
 *  1. does the role hold the permission?
 *  2. does the target record belong to the caller's organization?
 *
 * Role permission alone is not sufficient — an Operations Manager of one company
 * holds `operation:update` but must not touch another company's operation.
 *
 * A record from another tenant raises NotFound, never Forbidden: a 403 would
 * confirm the record exists, which is itself a disclosure (SECURITY.md §4).
 */
export function authorize(
  ctx: TenantContext,
  permission: Permission,
  resource?: OwnedResource | null,
): void {
  if (!roleHasPermission(ctx.role, permission)) {
    throw new AuthorizationError()
  }

  if (resource === undefined) return

  if (resource === null || resource.organizationId !== ctx.organizationId) {
    throw new NotFoundError()
  }
}

/** Non-throwing variant, for deciding whether to render a control. */
export function can(ctx: TenantContext, permission: Permission): boolean {
  return roleHasPermission(ctx.role, permission)
}
