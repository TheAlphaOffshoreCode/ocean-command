import { type PrismaClient, RiskCategory, RiskStatus } from '@prisma/client'

import { scoreRisk } from '../../src/lib/domain/risk/risk-engine'

/**
 * Demo risk register.
 *
 * Scores and levels are computed with the same engine the application uses, never
 * hard-coded — a seed that writes score 12 next to probability 3 and impact 5
 * would sit there contradicting the CHECK constraint and the matrix at once.
 *
 * Spread across every band on purpose, so the matrix has something in each colour
 * and the alert rules have critical risks to raise.
 */

type RiskSeed = {
  title: string
  description: string
  category: RiskCategory
  probability: number
  impact: number
  status: RiskStatus
  origin: string
  vesselName?: string
  operationCode?: string
  actions?: string[]
}

const RISKS: RiskSeed[] = [
  {
    title: 'Crane wire beyond inspection interval',
    description:
      'Main crane wire on OC Atlantic is approaching the certified inspection interval while the vessel is committed to back-to-back cargo runs.',
    category: RiskCategory.TECHNICAL,
    probability: 4,
    impact: 5,
    status: RiskStatus.OPEN,
    origin: 'Planned maintenance review',
    vesselName: 'OC Atlantic',
    actions: ['Book class surveyor for next port call', 'Restrict lifts to 60% SWL until inspected'],
  },
  {
    title: 'Simultaneous operations at SB-14',
    description:
      'ROV inspection and cargo transfer are planned in the same field within overlapping windows, with shared deck space.',
    category: RiskCategory.OPERATIONAL,
    probability: 4,
    impact: 4,
    status: RiskStatus.MITIGATING,
    origin: 'Weekly planning meeting',
    actions: ['Separate the windows by four hours', 'Nominate a single deck coordinator'],
  },
  {
    title: 'Diver decompression exposure on extended campaign',
    description:
      'Saturation campaign at CB-07 runs close to maximum planned exposure with limited weather margin.',
    category: RiskCategory.SAFETY,
    probability: 3,
    impact: 5,
    status: RiskStatus.OPEN,
    origin: 'Dive plan review',
    vesselName: 'OC Guardian',
    actions: ['Add a contingency day to the campaign'],
  },
  {
    title: 'Swell above DSV limit during winter window',
    description:
      'Seasonal swell in Campos frequently exceeds the diving support vessel limit, threatening standby days.',
    category: RiskCategory.WEATHER,
    probability: 4,
    impact: 3,
    status: RiskStatus.MONITORED,
    origin: 'Metocean study',
    vesselName: 'OC Guardian',
  },
  {
    title: 'Single supply vessel covering three fields',
    description:
      'OC Atlantic is the only PSV assigned across Santos and Campos, leaving no cover if it goes off hire.',
    category: RiskCategory.OPERATIONAL,
    probability: 3,
    impact: 4,
    status: RiskStatus.OPEN,
    origin: 'Fleet utilisation review',
    vesselName: 'OC Atlantic',
    actions: ['Identify a charter option for peak weeks'],
  },
  {
    title: 'Dropped object during heavy lift',
    description: 'Heavy lift planned over live subsea infrastructure at the SB-14 cluster.',
    category: RiskCategory.SAFETY,
    probability: 2,
    impact: 5,
    status: RiskStatus.MITIGATING,
    origin: 'Lift plan',
    actions: ['Exclusion zone around the lift path', 'Second banksman on deck'],
  },
  {
    title: 'ROV hydraulic leak recurrence',
    description:
      'The work-class ROV on OC Explorer has leaked twice in six months; a third failure would stop the inspection campaign.',
    category: RiskCategory.TECHNICAL,
    probability: 3,
    impact: 3,
    status: RiskStatus.MITIGATING,
    origin: 'Equipment failure history',
    vesselName: 'OC Explorer',
    actions: ['Replace hose assemblies at next port call'],
  },
  {
    title: 'Crew change delayed by helicopter availability',
    description: 'Crew rotation depends on a single aviation provider with no standby aircraft.',
    category: RiskCategory.OPERATIONAL,
    probability: 3,
    impact: 2,
    status: RiskStatus.OPEN,
    origin: 'Logistics review',
  },
  {
    title: 'Fuel bunkering spill at anchorage',
    description: 'Bunkering at the Vitória anchorage in exposed conditions.',
    category: RiskCategory.ENVIRONMENTAL,
    probability: 2,
    impact: 4,
    status: RiskStatus.MONITORED,
    origin: 'Environmental aspect register',
  },
  {
    title: 'Position reference loss during DP operation',
    description: 'DP reference redundancy reduced while one system awaits a spare part.',
    category: RiskCategory.TECHNICAL,
    probability: 2,
    impact: 4,
    status: RiskStatus.OPEN,
    origin: 'DP assurance audit',
    vesselName: 'OC Pioneer',
    actions: ['Expedite the spare', 'Restrict to two-reference operations meanwhile'],
  },
  {
    title: 'Late permit approval for subsea work',
    description: 'Regulatory approval for the ES-03 campaign is still pending three weeks out.',
    category: RiskCategory.REGULATORY,
    probability: 3,
    impact: 3,
    status: RiskStatus.MITIGATING,
    origin: 'Permit tracker',
  },
  {
    title: 'Fatigue during extended pipe-lay campaign',
    description: 'Continuous operations planned over 60 hours with a single crew rotation.',
    category: RiskCategory.SAFETY,
    probability: 3,
    impact: 3,
    status: RiskStatus.OPEN,
    origin: 'Campaign planning',
    vesselName: 'OC Pioneer',
  },
  {
    title: 'Communications outage in remote field',
    description: 'Satellite coverage at ES-03 has intermittent dropouts affecting reporting.',
    category: RiskCategory.TECHNICAL,
    probability: 2,
    impact: 2,
    status: RiskStatus.MONITORED,
    origin: 'IT incident review',
  },
  {
    title: 'Unauthorised access at the port terminal',
    description: 'Terminal access control relies on a shared code.',
    category: RiskCategory.SECURITY,
    probability: 2,
    impact: 2,
    status: RiskStatus.ACCEPTED,
    origin: 'Security review',
  },
  {
    title: 'Minor hydraulic oil drips on deck',
    description: 'Recurring small drips from deck machinery, contained by drip trays.',
    category: RiskCategory.ENVIRONMENTAL,
    probability: 3,
    impact: 1,
    status: RiskStatus.CLOSED,
    origin: 'Deck inspection',
  },
]

export async function seedRisks(prisma: PrismaClient, organizationId: string, now = new Date()) {
  const year = now.getUTCFullYear()

  const [vessels, operations] = await Promise.all([
    prisma.vessel.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.operation.findMany({ where: { organizationId }, select: { id: true, code: true } }),
  ])

  const vesselByName = new Map(vessels.map((vessel) => [vessel.name, vessel.id]))
  const operationByCode = new Map(operations.map((operation) => [operation.code, operation.id]))

  let highest = 0

  for (const [index, risk] of RISKS.entries()) {
    const code = `RSK-${year}-${String(index + 1).padStart(4, '0')}`
    highest = index + 1

    // Computed, never written by hand: the database CHECK enforces the same thing.
    const scored = scoreRisk(risk.probability, risk.impact)

    const data = {
      title: risk.title,
      description: risk.description,
      category: risk.category,
      probability: scored.probability,
      impact: scored.impact,
      score: scored.score,
      level: scored.level,
      status: risk.status,
      origin: risk.origin,
      vesselId: risk.vesselName ? (vesselByName.get(risk.vesselName) ?? null) : null,
      operationId: risk.operationCode ? (operationByCode.get(risk.operationCode) ?? null) : null,
      reviewDate: new Date(now.getTime() + (index + 7) * 24 * 60 * 60 * 1000),
    }

    const record = await prisma.risk.upsert({
      where: { organizationId_code: { organizationId, code } },
      update: data,
      create: { ...data, code, organizationId },
    })

    const existingActions = await prisma.riskAction.count({ where: { riskId: record.id } })
    if (existingActions === 0 && risk.actions) {
      for (const description of risk.actions) {
        await prisma.riskAction.create({
          data: {
            riskId: record.id,
            description,
            dueDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
          },
        })
      }
    }
  }

  // Keep the shared counter ahead of what was written directly, so the first risk
  // created through the product does not collide with the seed.
  await prisma.sequenceCounter.upsert({
    where: { organizationId_kind_year: { organizationId, kind: 'RISK', year } },
    update: { lastSequence: highest },
    create: { organizationId, kind: 'RISK', year, lastSequence: highest },
  })

  return { risks: RISKS.length }
}
