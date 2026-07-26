import { VesselStatus, VesselType } from '@prisma/client'
import { z } from 'zod'

import { isValidCallsign, isValidIMO, isValidMMSI } from '@/lib/domain/vessel/identifiers'

/**
 * One definition for the form and the server action.
 *
 * Note what is absent: organizationId, id, and every `last*` position column.
 * Server-owned fields are never part of an input schema — if a field can be
 * derived or is a privilege, the client does not get to send it.
 */

/** Empty inputs arrive as '' from a form; treat that as "not provided". */
const optionalText = (schema: z.ZodString) =>
  z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .optional()
    .pipe(schema.optional())

const imo = optionalText(
  z.string().refine(isValidIMO, 'IMO must be 7 digits with a valid check digit'),
)

const mmsi = optionalText(
  z.string().refine(isValidMMSI, 'MMSI must be 9 digits starting with 2–7 for a ship station'),
)

const callsign = optionalText(
  z
    .string()
    .toUpperCase()
    .refine(isValidCallsign, 'Callsign must be 3–7 letters or digits'),
)

const dimension = (label: string, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => (value === '' ? undefined : Number(value)))
    .optional()
    .refine(
      (value) => value === undefined || (Number.isFinite(value) && value > 0 && value <= max),
      `${label} must be between 0 and ${max} m`,
    )

export const createVesselSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  type: z.nativeEnum(VesselType),
  // ISO 3166-1 alpha-2. Two letters is a weak check, but a wrong-length flag is
  // the mistake that actually happens.
  flag: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, 'Flag must be a 2-letter ISO country code'),
  operator: optionalText(z.string().max(120)),
  imo,
  mmsi,
  callsign,
  lengthM: dimension('Length', 500),
  beamM: dimension('Beam', 100),
  draftM: dimension('Draft', 40),
  status: z.nativeEnum(VesselStatus).default(VesselStatus.AVAILABLE),
})

export type CreateVesselInput = z.infer<typeof createVesselSchema>

export const updateVesselSchema = createVesselSchema.extend({
  id: z.string().min(1),
})

export type UpdateVesselInput = z.infer<typeof updateVesselSchema>

export const updateVesselStatusSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(VesselStatus),
})

export const archiveVesselSchema = z.object({
  id: z.string().min(1),
})

/** Fleet list filters. Parsed from search params, so everything is a string. */
export const fleetFiltersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  type: z.nativeEnum(VesselType).optional(),
  status: z.nativeEnum(VesselStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  sort: z.enum(['name', 'status', 'type', 'lastPositionAt']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
})

export type FleetFilters = z.infer<typeof fleetFiltersSchema>
