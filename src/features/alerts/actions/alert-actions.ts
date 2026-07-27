'use server'

import { revalidatePath } from 'next/cache'
import { AlertEventType, AlertStatus } from '@prisma/client'
import { z } from 'zod'

import { authorize, authorizeResource } from '@/lib/auth/authorize'
import { getTenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import { withAudit } from '@/lib/db/with-audit'
import { alertTimestampsFor, assertAlertTransition } from '@/lib/domain/alert/lifecycle'
import { isAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

import { evaluateAlerts } from '../services/evaluate-alerts'

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

const transitionSchema = z.object({
  id: z.string().min(1),
  to: z.nativeEnum(AlertStatus),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
})

function toFailure(error: unknown): ActionResult<never> {
  if (isAppError(error)) return { ok: false, error: error.message }

  const correlationId = crypto.randomUUID()
  logger.error({ err: error, module: 'alerts', correlationId }, 'Unhandled alert failure')
  return { ok: false, error: `Something went wrong. Reference ${correlationId}.` }
}

/**
 * Moving an alert through its lifecycle.
 *
 * The permission split is the point of the module: **acknowledging is taking
 * ownership, resolving is declaring it over.** Any operator can do the first, so a
 * critical alert stops being unowned at 03:00; only a supervisor does the second.
 * Both are checked here, server-side, whatever the UI decided to render.
 */
export async function transitionAlert(input: unknown): Promise<ActionResult<{ status: AlertStatus }>> {
  try {
    const ctx = await getTenantContext()
    const parsed = transitionSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' }
    }

    const permission =
      parsed.data.to === AlertStatus.RESOLVED ? 'alert:resolve' : 'alert:acknowledge'

    const db = forTenant(ctx)
    const existing = authorizeResource(
      ctx,
      permission,
      await db.alert.findFirst({ where: { id: parsed.data.id } }),
    )

    assertAlertTransition(existing.status, parsed.data.to)

    const now = new Date()
    const stamps = alertTimestampsFor(parsed.data.to, existing, ctx.userId, now)

    await withAudit(
      ctx,
      {
        action: `alert.${parsed.data.to.toLowerCase()}`,
        entityType: 'Alert',
        entityId: parsed.data.id,
        before: { status: existing.status },
        after: { status: parsed.data.to, ...stamps },
      },
      async (tx) => {
        await tx.alert.updateMany({
          where: { id: parsed.data.id },
          data: { status: parsed.data.to, ...stamps },
        })

        await tx.alertEvent.create({
          data: {
            alertId: parsed.data.id,
            type:
              parsed.data.to === AlertStatus.RESOLVED
                ? AlertEventType.RESOLVED
                : parsed.data.to === AlertStatus.ACKNOWLEDGED
                  ? AlertEventType.ACKNOWLEDGED
                  : AlertEventType.REOPENED,
            actorId: ctx.userId,
            note: parsed.data.note ?? null,
          },
        })
      },
    )

    revalidatePath('/alerts')
    revalidatePath('/command-center')
    return { ok: true, data: { status: parsed.data.to } }
  } catch (error) {
    return toFailure(error)
  }
}

const assignSchema = z.object({
  id: z.string().min(1),
  assigneeId: z.string().min(1).nullable(),
})

export async function assignAlert(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext()
    const parsed = assignSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid request.' }

    const db = forTenant(ctx)
    const existing = authorizeResource(
      ctx,
      'alert:assign',
      await db.alert.findFirst({ where: { id: parsed.data.id } }),
    )

    await withAudit(
      ctx,
      {
        action: 'alert.assigned',
        entityType: 'Alert',
        entityId: parsed.data.id,
        before: { assigneeId: existing.assigneeId },
        after: { assigneeId: parsed.data.assigneeId },
      },
      async (tx) => {
        await tx.alert.updateMany({
          where: { id: parsed.data.id },
          data: { assigneeId: parsed.data.assigneeId },
        })
        await tx.alertEvent.create({
          data: {
            alertId: parsed.data.id,
            type: AlertEventType.ASSIGNED,
            actorId: ctx.userId,
            note: parsed.data.assigneeId ? 'Assigned' : 'Unassigned',
          },
        })
      },
    )

    revalidatePath('/alerts')
    return { ok: true, data: { id: parsed.data.id } }
  } catch (error) {
    return toFailure(error)
  }
}

/** Re-runs the rules. Same entry point the scheduled job uses. */
export async function evaluateAlertsAction(): Promise<
  ActionResult<{ raised: number; updated: number; autoResolved: number }>
> {
  try {
    const ctx = await getTenantContext()
    authorize(ctx, 'alert:acknowledge')

    const outcome = await evaluateAlerts(ctx)

    revalidatePath('/alerts')
    revalidatePath('/command-center')
    return {
      ok: true,
      data: {
        raised: outcome.raised,
        updated: outcome.updated,
        autoResolved: outcome.autoResolved,
      },
    }
  } catch (error) {
    return toFailure(error)
  }
}
