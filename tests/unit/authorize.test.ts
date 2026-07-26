import { describe, expect, it } from 'vitest'

import { authorize, can } from '@/lib/auth/authorize'
import type { TenantContext } from '@/lib/auth/tenant-context'
import { AuthorizationError, NotFoundError } from '@/lib/errors'

function context(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'user_1',
    userName: 'Ana Ribeiro',
    userEmail: 'ana@example.com',
    organizationId: 'org_a',
    organizationName: 'Org A',
    role: 'OPERATIONS_MANAGER',
    isDemo: true,
    ...overrides,
  }
}

describe('authorize', () => {
  it('allows an action the role holds', () => {
    expect(() => authorize(context(), 'operation:update')).not.toThrow()
  })

  it('refuses an action the role does not hold', () => {
    expect(() => authorize(context({ role: 'VIEWER' }), 'operation:update')).toThrow(
      AuthorizationError,
    )
  })

  it('allows an action on a record of the caller organization', () => {
    expect(() => authorize(context(), 'operation:update', { organizationId: 'org_a' })).not.toThrow()
  })

  it('reports a record from another organization as not found, never forbidden', () => {
    // A 403 would confirm the record exists. The distinction is the control.
    let thrown: unknown
    try {
      authorize(context(), 'operation:update', { organizationId: 'org_b' })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(NotFoundError)
    expect(thrown).not.toBeInstanceOf(AuthorizationError)
  })

  it('checks the role before the record, so a viewer learns nothing about existence', () => {
    // A Viewer probing ids must get Forbidden for every id, otherwise the error
    // itself distinguishes "exists elsewhere" from "does not exist".
    expect(() => authorize(context({ role: 'VIEWER' }), 'operation:update', null)).toThrow(
      AuthorizationError,
    )
  })

  it('treats a missing record as not found', () => {
    expect(() => authorize(context(), 'operation:update', null)).toThrow(NotFoundError)
  })

  it('can() answers without throwing, for deciding whether to render a control', () => {
    expect(can(context(), 'operation:update')).toBe(true)
    expect(can(context({ role: 'VIEWER' }), 'operation:update')).toBe(false)
  })
})
