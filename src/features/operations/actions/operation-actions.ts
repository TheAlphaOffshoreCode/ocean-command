'use server'

import { revalidatePath } from 'next/cache'
import { OperationEventType, OperationStatus, Prisma } from '@prisma/client'
import type { z } from 'zod'

import { authorize, authorizeResource } from '@/lib/auth/authorize'
import { getTenantContext, type TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import { withAudit, type TenantTransaction } from '@/lib/db/with-audit'
import { assertTransitionAllowed, timestampsFor } from '@/lib/domain/operation/transitions'
import { DomainRuleError, isAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

import {
  createOperationSchema,
  rescheduleOperationSchema,
  transitionOperationSchema,
  updateOperationSchema,
} from '../schemas/operation'
import { nextOperationCode, withUniqueCodeRetry } from '../services/operation-code'
import { assertVesselAvailable } from '../services/vessel-schedule'

/**
 * Every action follows the same order: session → validate → load in tenant scope →
 * authorize → domain rule → transaction (write + event + audit) → revalidate.
 * See docs/API.md.
 */

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: Record<string, string[]> }

function fieldErrors(error: z.ZodError): ActionResult<never> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    fields[key] = [...(fields[key] ?? []), issue.message]
  }
  return { ok: false, error: 'Check the highlighted fields.', fields }
}

function toFailure(error: unknown): ActionResult<never> {
  // Domain rule messages are written for the operator and are safe to show:
  // "This vessel is already committed to OP-2026-0007" is the whole point.
  if (isAppError(error)) return { ok: false, error: error.message }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return { ok: false, error: 'That operation code is already in use.' }
  }

  const correlationId = crypto.randomUUID()
  logger.error({ err: error, module: 'operations', correlationId }, 'Unhandled operations failure')
  return { ok: false, error: `Something went wrong. Reference ${correlationId}.` }
}

/** Every status change and every reschedule leaves one of these behind. */
async function recordEvent(
  tx: TenantTransaction,
  ctx: TenantContext,
  event: {
    operationId: string
    type: OperationEventType
    fromStatus?: OperationStatus
    toStatus?: OperationStatus
    message?: string
  },
) {
  await tx.operationEvent.create({
    data: {
      organizationId: ctx.organizationId,
      operationId: event.operationId,
      type: event.type,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
      message: event.message ?? null,
      actorId: ctx.userId,
    },
  })
}

export async function createOperation(input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    const ctx = await getTenantContext()
    const parsed = createOperationSchema.safeParse(input)
    if (!parsed.success) return fieldErrors(parsed.error)

    authorize(ctx, 'operation:create')

    const data = parsed.data

    const created = await withUniqueCodeRetry(() =>
      withAudit(
        ctx,
        (operation: { id: string; code: string }) => ({
          action: 'operation.created',
          entityType: 'Operation',
          entityId: operation.id,
          after: { ...data, code: operation.code },
        }),
        async (tx) => {
          // Both checks inside the transaction: outside it, two concurrent creates
          // would each see a clear schedule and both succeed.
          await assertVesselAvailable(tx, {
            vesselId: data.vesselId,
            window: { start: data.plannedStart, end: data.plannedEnd },
          })

          const code = await nextOperationCode(
            tx,
            ctx.organizationId,
            data.plannedStart.getUTCFullYear(),
          )

          const operation = await tx.operation.create({
            data: { ...data, code, organizationId: ctx.organizationId },
          })

          await recordEvent(tx, ctx, {
            operationId: operation.id,
            type: OperationEventType.CREATED,
            toStatus: operation.status,
            message: `Created as ${operation.code}`,
          })

          return operation
        },
      ),
    )

    revalidatePath('/operations')
    revalidatePath('/command-center')
    return { ok: true, data: { id: created.id, code: created.code } }
  } catch (error) {
    return toFailure(error)
  }
}

export async function updateOperation(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext()
    const parsed = updateOperationSchema.safeParse(input)
    if (!parsed.success) return fieldErrors(parsed.error)

    const db = forTenant(ctx)
    const existing = authorizeResource(
      ctx,
      'operation:update',
      await db.operation.findFirst({ where: { id: parsed.data.id } }),
    )

    const { id, ...data } = parsed.data

    await withAudit(
      ctx,
      { action: 'operation.updated', entityType: 'Operation', entityId: id, before: existing, after: data },
      async (tx) => {
        await assertVesselAvailable(tx, {
          vesselId: data.vesselId,
          window: { start: data.plannedStart, end: data.plannedEnd },
          excludeOperationId: id,
        })

        await tx.operation.updateMany({ where: { id }, data })

        const rescheduled =
          existing.plannedStart.getTime() !== data.plannedStart.getTime() ||
          existing.plannedEnd.getTime() !== data.plannedEnd.getTime()

        await recordEvent(tx, ctx, {
          operationId: id,
          // A moved window is a different event from an edited description: one
          // affects the vessel's schedule, the other does not.
          type: rescheduled ? OperationEventType.RESCHEDULED : OperationEventType.RESOURCE_CHANGED,
          message: rescheduled ? 'Planned window changed' : 'Details updated',
        })
      },
    )

    revalidatePath('/operations')
    revalidatePath(`/operations/${id}`)
    return { ok: true, data: { id } }
  } catch (error) {
    return toFailure(error)
  }
}

export async function transitionOperation(input: unknown): Promise<ActionResult<{ status: OperationStatus }>> {
  try {
    const ctx = await getTenantContext()
    const parsed = transitionOperationSchema.safeParse(input)
    if (!parsed.success) return fieldErrors(parsed.error)

    const db = forTenant(ctx)

    // Cancelling changes the plan; starting, suspending and completing record what
    // happened. Operators hold the second set, not the first.
    const permission = parsed.data.to === OperationStatus.CANCELLED ? 'operation:cancel' : 'operation:transition'

    const existing = authorizeResource(
      ctx,
      permission,
      await db.operation.findFirst({ where: { id: parsed.data.id } }),
    )

    assertTransitionAllowed(existing.status, parsed.data.to)

    if (parsed.data.to === OperationStatus.SUSPENDED && !parsed.data.note) {
      // A suspension with no reason is the entry someone will need next week and
      // will not find.
      throw new DomainRuleError(
        'operation.suspension_needs_reason',
        'Say why the operation is being suspended — the reason goes into its history.',
      )
    }

    const now = new Date()
    const timestamps = timestampsFor(parsed.data.to, existing, now)

    await withAudit(
      ctx,
      {
        action: 'operation.status_changed',
        entityType: 'Operation',
        entityId: parsed.data.id,
        before: { status: existing.status, ...pickTimes(existing) },
        after: { status: parsed.data.to, ...timestamps },
      },
      async (tx) => {
        await tx.operation.updateMany({
          where: { id: parsed.data.id },
          data: { status: parsed.data.to, ...timestamps },
        })

        await recordEvent(tx, ctx, {
          operationId: parsed.data.id,
          type: OperationEventType.STATUS_CHANGED,
          fromStatus: existing.status,
          toStatus: parsed.data.to,
          message: parsed.data.note,
        })
      },
    )

    revalidatePath('/operations')
    revalidatePath(`/operations/${parsed.data.id}`)
    revalidatePath('/command-center')
    return { ok: true, data: { status: parsed.data.to } }
  } catch (error) {
    return toFailure(error)
  }
}

export async function rescheduleOperation(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext()
    const parsed = rescheduleOperationSchema.safeParse(input)
    if (!parsed.success) return fieldErrors(parsed.error)

    const db = forTenant(ctx)
    const existing = authorizeResource(
      ctx,
      'operation:update',
      await db.operation.findFirst({ where: { id: parsed.data.id } }),
    )

    if (existing.status === OperationStatus.COMPLETED || existing.status === OperationStatus.CANCELLED) {
      throw new DomainRuleError(
        'operation.reschedule_terminal',
        'A completed or cancelled operation cannot be rescheduled.',
      )
    }

    await withAudit(
      ctx,
      {
        action: 'operation.rescheduled',
        entityType: 'Operation',
        entityId: parsed.data.id,
        before: { plannedStart: existing.plannedStart, plannedEnd: existing.plannedEnd },
        after: { plannedStart: parsed.data.plannedStart, plannedEnd: parsed.data.plannedEnd },
      },
      async (tx) => {
        await assertVesselAvailable(tx, {
          vesselId: existing.vesselId,
          window: { start: parsed.data.plannedStart, end: parsed.data.plannedEnd },
          excludeOperationId: parsed.data.id,
        })

        await tx.operation.updateMany({
          where: { id: parsed.data.id },
          data: { plannedStart: parsed.data.plannedStart, plannedEnd: parsed.data.plannedEnd },
        })

        await recordEvent(tx, ctx, {
          operationId: parsed.data.id,
          type: OperationEventType.RESCHEDULED,
          message: parsed.data.note ?? 'Planned window changed',
        })
      },
    )

    revalidatePath('/operations')
    revalidatePath(`/operations/${parsed.data.id}`)
    return { ok: true, data: { id: parsed.data.id } }
  } catch (error) {
    return toFailure(error)
  }
}

function pickTimes(operation: { actualStart: Date | null; actualEnd: Date | null }) {
  return { actualStart: operation.actualStart, actualEnd: operation.actualEnd }
}
