import { describe, expect, it } from 'vitest'

import {
  PERMISSIONS,
  ROLES,
  permissionsForRole,
  roleHasPermission,
  type Permission,
} from '@/lib/auth/permissions'

/**
 * The RBAC matrix is a security control, so these assertions are written against
 * the *intent* in docs/SECURITY.md §4 rather than against the current data. If
 * someone widens a role, a test here fails and names the privilege they granted.
 */
describe('permission matrix', () => {
  it('lets every role read the operational picture', () => {
    for (const role of ROLES) {
      expect(roleHasPermission(role, 'dashboard:read')).toBe(true)
      expect(roleHasPermission(role, 'fleet:read')).toBe(true)
      expect(roleHasPermission(role, 'alert:read')).toBe(true)
    }
  })

  it('gives Viewer read access and nothing else', () => {
    const writes = PERMISSIONS.filter((p) => !p.endsWith(':read') && p !== 'ai:query')
    for (const permission of writes) {
      expect(roleHasPermission('VIEWER', permission)).toBe(false)
    }
  })

  it('lets an Operator record reality but not change the plan', () => {
    // The 03:00 job: start it, suspend it, report what happened.
    expect(roleHasPermission('OPERATOR', 'operation:transition')).toBe(true)
    expect(roleHasPermission('OPERATOR', 'incident:create')).toBe(true)
    expect(roleHasPermission('OPERATOR', 'vessel:status_update')).toBe(true)

    // Not the coordinator's job: rescheduling, cancelling, deleting.
    expect(roleHasPermission('OPERATOR', 'operation:create')).toBe(false)
    expect(roleHasPermission('OPERATOR', 'operation:update')).toBe(false)
    expect(roleHasPermission('OPERATOR', 'operation:cancel')).toBe(false)
    expect(roleHasPermission('OPERATOR', 'operation:delete')).toBe(false)
  })

  it('separates acknowledging an alert from resolving it', () => {
    // Taking ownership is anyone on shift; declaring it over is supervisory.
    expect(roleHasPermission('OPERATOR', 'alert:acknowledge')).toBe(true)
    expect(roleHasPermission('OPERATOR', 'alert:resolve')).toBe(false)
    expect(roleHasPermission('OPERATIONS_MANAGER', 'alert:resolve')).toBe(true)
  })

  it('keeps tenant administration to administrators', () => {
    const adminOnly: Permission[] = [
      'user:manage',
      'organization:manage',
      'integration:manage',
      'vessel:create',
      'vessel:archive',
    ]

    for (const permission of adminOnly) {
      expect(roleHasPermission('ADMINISTRATOR', permission)).toBe(true)
      expect(roleHasPermission('OPERATIONS_MANAGER', permission)).toBe(false)
      expect(roleHasPermission('OPERATOR', permission)).toBe(false)
      expect(roleHasPermission('VIEWER', permission)).toBe(false)
    }
  })

  it('is strictly cumulative from Viewer up to Administrator', () => {
    const ordered = ['VIEWER', 'OPERATOR', 'OPERATIONS_MANAGER', 'ADMINISTRATOR'] as const

    for (let i = 1; i < ordered.length; i += 1) {
      const lower = permissionsForRole(ordered[i - 1]!)
      const higher = new Set(permissionsForRole(ordered[i]!))

      for (const permission of lower) {
        expect(
          higher.has(permission),
          `${ordered[i]} is missing ${permission}, which ${ordered[i - 1]} holds`,
        ).toBe(true)
      }
      expect(higher.size).toBeGreaterThan(lower.length)
    }
  })

  it('grants an administrator every declared permission', () => {
    // Catches the opposite mistake: a permission added to the list but wired to
    // no role at all, which silently disables a feature for everyone.
    expect(new Set(permissionsForRole('ADMINISTRATOR')).size).toBe(PERMISSIONS.length)
  })
})
