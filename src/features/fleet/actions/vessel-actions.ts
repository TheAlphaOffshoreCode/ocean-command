'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import type { z } from 'zod'

import { authorize, authorizeResource } from '@/lib/auth/authorize'
import { getTenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import { withAudit } from '@/lib/db/with-audit'
import { isAppError, ProviderError } from '@/lib/errors'
import { logger } from '@/lib/logger'

import {
  archiveVesselSchema,
  createVesselSchema,
  updateVesselSchema,
  updateVesselStatusSchema,
} from '../schemas/vessel'
import { syncFleetPositions } from '../services/sync-positions'

/**
 * Every action here follows the same six steps, in this order:
 * session → validate → load in tenant scope → authorize → domain rule →
 * transaction + audit. See docs/API.md.
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string[]> }

/** Turns a thrown error into a result the client can render, without leaking internals. */
function toFailure(error: unknown, module: string): ActionResult<never> {
  if (isAppError(error)) {
    return { ok: false, error: error.message }
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    // Unique constraints here are tenant-scoped, so this really is a duplicate
    // inside this organization.
    const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'identifier'
    return { ok: false, error: `Another vessel in your fleet already uses this ${target}.` }
  }

  const correlationId = crypto.randomUUID()
  logger.error({ err: error, module, correlationId }, 'Unhandled failure in fleet action')
  return { ok: false, error: `Something went wrong. Reference ${correlationId}.` }
}

function fieldErrors(error: z.ZodError): ActionResult<never> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    fields[key] = [...(fields[key] ?? []), issue.message]
  }
  return { ok: false, error: 'Check the highlighted fields.', fields }
}

export async function createVessel(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext()
    const parsed = createVesselSchema.safeParse(input)
    if (!parsed.success) return fieldErrors(parsed.error)

    authorize(ctx, 'vessel:create')

    const vessel = await withAudit(
      ctx,
      (created: { id: string }) => ({
        action: 'vessel.created',
        entityType: 'Vessel',
        entityId: created.id,
        after: parsed.data,
      }),
      (tx) => tx.vessel.create({ data: { ...parsed.data, organizationId: ctx.organizationId } }),
    )

    revalidatePath('/fleet')
    return { ok: true, data: { id: vessel.id } }
  } catch (error) {
    return toFailure(error, 'fleet')
  }
}

export async function updateVessel(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext()
    const parsed = updateVesselSchema.safeParse(input)
    if (!parsed.success) return fieldErrors(parsed.error)

    const db = forTenant(ctx)
    // Checks the permission *and* that the record is ours, and hands the record
    // back. A foreign id raises NotFound rather than Forbidden.
    const existing = authorizeResource(
      ctx,
      'vessel:update',
      await db.vessel.findFirst({ where: { id: parsed.data.id } }),
    )

    const { id, ...data } = parsed.data

    await withAudit(
      ctx,
      {
        action: 'vessel.updated',
        entityType: 'Vessel',
        entityId: id,
        before: existing,
        after: data,
      },
      (tx) => tx.vessel.updateMany({ where: { id }, data }),
    )

    revalidatePath('/fleet')
    revalidatePath(`/fleet/${id}`)
    return { ok: true, data: { id } }
  } catch (error) {
    return toFailure(error, 'fleet')
  }
}

export async function updateVesselStatus(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext()
    const parsed = updateVesselStatusSchema.safeParse(input)
    if (!parsed.success) return fieldErrors(parsed.error)

    const db = forTenant(ctx)
    // Operators hold this one: reporting that a vessel went off hire at 03:00 is
    // their job, while editing its particulars is not.
    const existing = authorizeResource(
      ctx,
      'vessel:status_update',
      await db.vessel.findFirst({ where: { id: parsed.data.id } }),
    )

    // Setting the status it already has is not an event worth auditing.
    if (existing.status === parsed.data.status) {
      return { ok: true, data: { id: parsed.data.id } }
    }

    await withAudit(
      ctx,
      {
        action: 'vessel.status_changed',
        entityType: 'Vessel',
        entityId: parsed.data.id,
        before: { status: existing.status },
        after: { status: parsed.data.status },
      },
      (tx) =>
        tx.vessel.updateMany({
          where: { id: parsed.data.id },
          data: { status: parsed.data.status },
        }),
    )

    revalidatePath('/fleet')
    revalidatePath(`/fleet/${parsed.data.id}`)
    return { ok: true, data: { id: parsed.data.id } }
  } catch (error) {
    return toFailure(error, 'fleet')
  }
}

export async function archiveVessel(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext()
    const parsed = archiveVesselSchema.safeParse(input)
    if (!parsed.success) return fieldErrors(parsed.error)

    const db = forTenant(ctx)
    authorizeResource(
      ctx,
      'vessel:archive',
      await db.vessel.findFirst({ where: { id: parsed.data.id } }),
    )

    // Archived, never deleted: positions, operations and incidents reference this
    // vessel, and a hard delete would corrupt the record of what happened.
    await withAudit(
      ctx,
      {
        action: 'vessel.archived',
        entityType: 'Vessel',
        entityId: parsed.data.id,
        before: { archivedAt: null },
        after: { archivedAt: new Date() },
      },
      (tx) =>
        tx.vessel.updateMany({
          where: { id: parsed.data.id },
          data: { archivedAt: new Date(), status: 'UNAVAILABLE' },
        }),
    )

    revalidatePath('/fleet')
    return { ok: true, data: { id: parsed.data.id } }
  } catch (error) {
    return toFailure(error, 'fleet')
  }
}

export async function syncPositions(): Promise<
  ActionResult<{ fixesRecorded: number; requested: number }>
> {
  try {
    const ctx = await getTenantContext()
    authorize(ctx, 'vessel:status_update')

    const outcome = await syncFleetPositions(ctx)

    revalidatePath('/fleet')
    return { ok: true, data: { fixesRecorded: outcome.fixesRecorded, requested: outcome.requested } }
  } catch (error) {
    if (error instanceof ProviderError) {
      return { ok: false, error: `${error.provider} is unavailable. Showing last known positions.` }
    }
    return toFailure(error, 'fleet')
  }
}
