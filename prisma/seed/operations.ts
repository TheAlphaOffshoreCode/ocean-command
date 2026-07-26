import {
  OperationEventType,
  OperationStatus,
  OperationType,
  type PrismaClient,
  Priority,
} from '@prisma/client'

/**
 * Demo operations.
 *
 * Anchored to midnight UTC of the day the seed runs, so re-running it on the same
 * day produces the same windows (idempotent), while the scenario still contains
 * work that is finished, running and planned *right now* — a schedule whose
 * operations all ended last March demonstrates nothing.
 *
 * Windows are laid out sequentially per vessel. Seeding overlapping operations on
 * one hull would populate the demo with exactly the conflict the product refuses
 * to accept through its own actions.
 */

const HOUR = 60 * 60 * 1000

type Plan = {
  name: string
  type: OperationType
  status: OperationStatus
  priority: Priority
  vesselName: string
  locationName: string
  /** Hours relative to today 00:00 UTC. Negative is in the past. */
  startOffsetH: number
  durationH: number
  /** Hours late the work actually started, for operations that have started. */
  startedLateH?: number
  notes?: string
}

const PLANS: Plan[] = [
  // OC Atlantic — supply runs, one finished, one under way, one planned.
  {
    name: 'Supply run to SB-14',
    type: OperationType.SUPPLY_OPERATION,
    status: OperationStatus.COMPLETED,
    priority: Priority.MEDIUM,
    vesselName: 'OC Atlantic',
    locationName: 'Santos Basin — Block SB-14',
    startOffsetH: -76,
    durationH: 14,
  },
  {
    name: 'Deck cargo transfer — SB-14',
    type: OperationType.CARGO_OPERATION,
    status: OperationStatus.IN_PROGRESS,
    priority: Priority.HIGH,
    vesselName: 'OC Atlantic',
    locationName: 'Santos Basin — Block SB-14',
    startOffsetH: -6,
    durationH: 18,
    startedLateH: 2,
    notes: 'Second lift postponed pending crane inspection.',
  },
  {
    name: 'Bulk transfer — SB-14 cluster',
    type: OperationType.SUPPLY_OPERATION,
    status: OperationStatus.PLANNED,
    priority: Priority.MEDIUM,
    vesselName: 'OC Atlantic',
    locationName: 'Santos Basin — SB-14 Subsea Cluster',
    startOffsetH: 30,
    durationH: 12,
  },

  // OC Horizon — anchor handling, one cancelled by weather.
  {
    name: 'Anchor handling — CB-07',
    type: OperationType.ANCHOR_HANDLING,
    status: OperationStatus.COMPLETED,
    priority: Priority.HIGH,
    vesselName: 'OC Horizon',
    locationName: 'Campos Basin — Block CB-07',
    startOffsetH: -120,
    durationH: 26,
    startedLateH: 4,
  },
  {
    name: 'Rig move support — CB-07',
    type: OperationType.ANCHOR_HANDLING,
    status: OperationStatus.CANCELLED,
    priority: Priority.MEDIUM,
    vesselName: 'OC Horizon',
    locationName: 'Campos Basin — Block CB-07',
    startOffsetH: -40,
    durationH: 20,
    notes: 'Stood down: swell above the vessel limit for anchor work.',
  },
  {
    name: 'Towage to CB-07 platform',
    type: OperationType.ANCHOR_HANDLING,
    status: OperationStatus.READY,
    priority: Priority.HIGH,
    vesselName: 'OC Horizon',
    locationName: 'Campos Basin — CB-07 Platform',
    startOffsetH: 10,
    durationH: 16,
  },

  // OC Sentinel — standby and response.
  {
    name: 'Oil spill response standby',
    type: OperationType.SURVEY,
    status: OperationStatus.IN_PROGRESS,
    priority: Priority.CRITICAL,
    vesselName: 'OC Sentinel',
    locationName: 'Campos Basin — CB-07 Platform',
    startOffsetH: -14,
    durationH: 48,
  },
  {
    name: 'Environmental survey — ES-03',
    type: OperationType.SURVEY,
    status: OperationStatus.PLANNED,
    priority: Priority.LOW,
    vesselName: 'OC Sentinel',
    locationName: 'Espírito Santo Basin — Block ES-03',
    startOffsetH: 54,
    durationH: 20,
  },

  // OC Explorer — ROV work.
  {
    name: 'ROV inspection — SB-14 manifold',
    type: OperationType.ROV_INSPECTION,
    status: OperationStatus.IN_PROGRESS,
    priority: Priority.HIGH,
    vesselName: 'OC Explorer',
    locationName: 'Santos Basin — SB-14 Subsea Cluster',
    startOffsetH: -3,
    durationH: 22,
  },
  {
    name: 'Subsea inspection — riser base',
    type: OperationType.SUBSEA_INSPECTION,
    status: OperationStatus.PLANNED,
    priority: Priority.MEDIUM,
    vesselName: 'OC Explorer',
    locationName: 'Santos Basin — SB-14 Subsea Cluster',
    startOffsetH: 26,
    durationH: 18,
  },
  {
    name: 'ROV tooling trial',
    type: OperationType.ROV_INSPECTION,
    status: OperationStatus.SUSPENDED,
    priority: Priority.LOW,
    vesselName: 'OC Explorer',
    locationName: 'Santos Basin — Block SB-14',
    startOffsetH: -30,
    durationH: 8,
    startedLateH: 1,
    notes: 'Suspended: hydraulic leak on the work-class ROV.',
  },

  // OC Pioneer — flexible pipe lay.
  {
    name: 'Flexible pipe lay — ES-03',
    type: OperationType.SUBSEA_INSPECTION,
    status: OperationStatus.IN_PROGRESS,
    priority: Priority.CRITICAL,
    vesselName: 'OC Pioneer',
    locationName: 'Espírito Santo Basin — Block ES-03',
    startOffsetH: -20,
    durationH: 60,
    startedLateH: 3,
  },
  {
    name: 'Pipe lay continuation — ES-03',
    type: OperationType.SUBSEA_INSPECTION,
    status: OperationStatus.PLANNED,
    priority: Priority.HIGH,
    vesselName: 'OC Pioneer',
    locationName: 'Espírito Santo Basin — Block ES-03',
    startOffsetH: 44,
    durationH: 48,
  },

  // OC Guardian — alongside for maintenance, so its work is preparation only.
  {
    name: 'Diving system certification',
    type: OperationType.MAINTENANCE,
    status: OperationStatus.PREPARING,
    priority: Priority.HIGH,
    vesselName: 'OC Guardian',
    locationName: 'Port of Vitória — Anchorage',
    startOffsetH: 18,
    durationH: 30,
    notes: 'Class surveyor attending; vessel remains alongside.',
  },
  {
    name: 'Saturation diving — CB-07',
    type: OperationType.DIVING_OPERATION,
    status: OperationStatus.PLANNED,
    priority: Priority.CRITICAL,
    vesselName: 'OC Guardian',
    locationName: 'Campos Basin — Block CB-07',
    startOffsetH: 96,
    durationH: 72,
  },

  // OC Venture — crew changes and drone inspection.
  {
    name: 'Crew transfer — CB-07 platform',
    type: OperationType.CREW_TRANSFER,
    status: OperationStatus.COMPLETED,
    priority: Priority.MEDIUM,
    vesselName: 'OC Venture',
    locationName: 'Campos Basin — CB-07 Platform',
    startOffsetH: -50,
    durationH: 6,
  },
  {
    name: 'RPAS flare inspection — CB-07',
    type: OperationType.RPAS_INSPECTION,
    status: OperationStatus.READY,
    priority: Priority.MEDIUM,
    vesselName: 'OC Venture',
    locationName: 'Campos Basin — CB-07 Platform',
    startOffsetH: 8,
    durationH: 5,
  },
  {
    name: 'Crew transfer — SB-14',
    type: OperationType.CREW_TRANSFER,
    status: OperationStatus.PLANNED,
    priority: Priority.LOW,
    vesselName: 'OC Venture',
    locationName: 'Santos Basin — Block SB-14',
    startOffsetH: 36,
    durationH: 7,
  },

  // OC Titan (FPSO) — on-station work.
  {
    name: 'Topside maintenance campaign',
    type: OperationType.MAINTENANCE,
    status: OperationStatus.IN_PROGRESS,
    priority: Priority.MEDIUM,
    vesselName: 'OC Titan',
    locationName: 'Santos Basin — Block SB-14',
    startOffsetH: -60,
    durationH: 120,
  },
  {
    name: 'Offloading readiness survey',
    type: OperationType.SURVEY,
    status: OperationStatus.PLANNED,
    priority: Priority.HIGH,
    vesselName: 'OC Titan',
    locationName: 'Santos Basin — Block SB-14',
    startOffsetH: 72,
    durationH: 10,
  },
]

function midnightUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export async function seedOperations(prisma: PrismaClient, organizationId: string, now = new Date()) {
  const base = midnightUtc(now)
  const year = base.getUTCFullYear()

  const [vessels, locations] = await Promise.all([
    prisma.vessel.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ])

  const vesselByName = new Map(vessels.map((vessel) => [vessel.name, vessel.id]))
  const locationByName = new Map(locations.map((location) => [location.name, location.id]))

  let created = 0

  for (const [index, plan] of PLANS.entries()) {
    const code = `OP-${year}-${String(index + 1).padStart(4, '0')}`
    const plannedStart = new Date(base.getTime() + plan.startOffsetH * HOUR)
    const plannedEnd = new Date(plannedStart.getTime() + plan.durationH * HOUR)

    const started = plan.status !== OperationStatus.PLANNED && plan.status !== OperationStatus.PREPARING
    const actualStart = started
      ? new Date(plannedStart.getTime() + (plan.startedLateH ?? 0) * HOUR)
      : null

    // Cancelled operations have no completion time: they did not complete.
    const actualEnd =
      plan.status === OperationStatus.COMPLETED && actualStart
        ? new Date(actualStart.getTime() + plan.durationH * HOUR)
        : null

    const data = {
      name: plan.name,
      type: plan.type,
      status: plan.status,
      priority: plan.priority,
      vesselId: vesselByName.get(plan.vesselName) ?? null,
      locationId: locationByName.get(plan.locationName) ?? null,
      plannedStart,
      plannedEnd,
      actualStart,
      actualEnd,
      notes: plan.notes ?? null,
    }

    const operation = await prisma.operation.upsert({
      where: { organizationId_code: { organizationId, code } },
      update: data,
      create: { ...data, code, organizationId },
    })

    // One creation event per operation, so the activity feed has history to show
    // on a fresh database. Guarded so re-running does not stack duplicates.
    const hasEvents = await prisma.operationEvent.count({ where: { operationId: operation.id } })
    if (hasEvents === 0) {
      await prisma.operationEvent.create({
        data: {
          organizationId,
          operationId: operation.id,
          type: OperationEventType.CREATED,
          toStatus: plan.status,
          message: `Created as ${code}`,
          occurredAt: new Date(plannedStart.getTime() - 24 * HOUR),
        },
      })
      created += 1
    }
  }

  return { operations: PLANS.length, events: created }
}
