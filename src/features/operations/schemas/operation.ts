import { OperationStatus, OperationType, Priority } from '@prisma/client'
import { z } from 'zod'

/**
 * Absent from every input schema: code, status, actualStart, actualEnd,
 * organizationId. The code is generated, the status moves only through the
 * transition table, and the actual times are stamped by the workflow — letting a
 * form set them is how plan and actual quietly become the same number.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional()

export const createOperationSchema = z
  .object({
    name: z.string().trim().min(3, 'Name is required').max(160),
    description: optionalText(2000),
    type: z.nativeEnum(OperationType),
    priority: z.nativeEnum(Priority).default(Priority.MEDIUM),
    vesselId: z.string().min(1).optional(),
    locationId: z.string().min(1).optional(),
    plannedStart: z.coerce.date(),
    plannedEnd: z.coerce.date(),
    notes: optionalText(2000),
  })
  .refine((value) => value.plannedEnd > value.plannedStart, {
    message: 'Planned end must be after planned start',
    path: ['plannedEnd'],
  })

export type CreateOperationInput = z.infer<typeof createOperationSchema>

export const updateOperationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(3).max(160),
    description: optionalText(2000),
    type: z.nativeEnum(OperationType),
    priority: z.nativeEnum(Priority),
    vesselId: z.string().min(1).optional(),
    locationId: z.string().min(1).optional(),
    plannedStart: z.coerce.date(),
    plannedEnd: z.coerce.date(),
    notes: optionalText(2000),
  })
  .refine((value) => value.plannedEnd > value.plannedStart, {
    message: 'Planned end must be after planned start',
    path: ['plannedEnd'],
  })

export const transitionOperationSchema = z.object({
  id: z.string().min(1),
  to: z.nativeEnum(OperationStatus),
  /** Shown in the event history; required when suspending, so the trail says why. */
  note: optionalText(500),
})

export const rescheduleOperationSchema = z
  .object({
    id: z.string().min(1),
    plannedStart: z.coerce.date(),
    plannedEnd: z.coerce.date(),
    note: optionalText(500),
  })
  .refine((value) => value.plannedEnd > value.plannedStart, {
    message: 'Planned end must be after planned start',
    path: ['plannedEnd'],
  })

export const operationFiltersSchema = z.object({
  search: z.string().trim().max(160).optional(),
  type: z.nativeEnum(OperationType).optional(),
  status: z.nativeEnum(OperationStatus).optional(),
  vesselId: z.string().min(1).optional(),
  /** Anything not finished, which is what an operations room looks at by default. */
  openOnly: z.coerce.boolean().default(false),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  sort: z.enum(['plannedStart', 'code', 'status', 'priority']).default('plannedStart'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})

export type OperationFilters = z.infer<typeof operationFiltersSchema>
