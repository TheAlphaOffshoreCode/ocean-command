import 'server-only'

import type { Prisma, RiskCategory, RiskLevel, RiskStatus } from '@prisma/client'

import type { TenantContext } from '@/lib/auth/tenant-context'
import { forTenant } from '@/lib/db/tenant'
import { DEFAULT_RISK_BANDS, levelFor, type RiskBands } from '@/lib/domain/risk/risk-engine'

export type RiskListItem = {
  id: string
  code: string
  title: string
  description: string
  category: RiskCategory
  probability: number
  impact: number
  score: number
  level: RiskLevel
  status: RiskStatus
  origin: string | null
  reviewDate: Date | null
  vessel: { id: string; name: string } | null
  operation: { id: string; code: string } | null
  openActions: number
}

const SELECT = {
  id: true,
  code: true,
  title: true,
  description: true,
  category: true,
  probability: true,
  impact: true,
  score: true,
  level: true,
  status: true,
  origin: true,
  reviewDate: true,
  vessel: { select: { id: true, name: true } },
  operation: { select: { id: true, code: true } },
  actions: { where: { completedAt: null }, select: { id: true } },
} satisfies Prisma.RiskSelect

/** Per-organization band overrides, from Organization.settings. */
export async function riskBands(ctx: TenantContext): Promise<RiskBands> {
  const [membership] = await forTenant(ctx).membership.findMany({
    where: { organizationId: ctx.organizationId },
    select: { organization: { select: { settings: true } } },
    take: 1,
  })

  const settings = membership?.organization.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return DEFAULT_RISK_BANDS
  }

  const bands = (settings as Record<string, unknown>).riskBands
  if (!bands || typeof bands !== 'object') return DEFAULT_RISK_BANDS

  const candidate = bands as Partial<RiskBands>
  // Anything malformed falls through to the defaults rather than throwing on a
  // page load — a bad settings row must not take the risk register down.
  return typeof candidate.low === 'number' &&
    typeof candidate.moderate === 'number' &&
    typeof candidate.high === 'number'
    ? { low: candidate.low, moderate: candidate.moderate, high: candidate.high }
    : DEFAULT_RISK_BANDS
}

export async function listRisks(
  ctx: TenantContext,
  filters: { status?: RiskStatus; level?: RiskLevel; openOnly?: boolean } = {},
): Promise<RiskListItem[]> {
  const where: Prisma.RiskWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.level ? { level: filters.level } : {}),
    ...(filters.openOnly && !filters.status
      ? { status: { in: ['OPEN', 'MITIGATING', 'MONITORED'] } }
      : {}),
  }

  const rows = await forTenant(ctx).risk.findMany({
    where,
    select: SELECT,
    // Worst first, which is the order a register is read in.
    orderBy: [{ score: 'desc' }, { code: 'asc' }],
    take: 200,
  })

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category,
    probability: row.probability,
    impact: row.impact,
    score: row.score,
    level: row.level,
    status: row.status,
    origin: row.origin,
    reviewDate: row.reviewDate,
    vessel: row.vessel,
    operation: row.operation,
    openActions: row.actions.length,
  }))
}

/**
 * A cell of the grid. Deliberately not a ScoredRisk: that type carries the
 * human-readable axis labels, and an earlier version satisfied it by filling them
 * with empty strings — a type the value does not really have.
 */
export type MatrixCell = {
  probability: number
  impact: number
  score: number
  level: RiskLevel
  risks: RiskListItem[]
}

/**
 * The 5×5 grid with the register's risks placed in their cells.
 *
 * Built here rather than in the component so the level shown on a cell and the
 * level stored on a risk come from the same function — a matrix that colours a
 * cell High while the risk in it says Moderate is worse than no matrix.
 */
export function buildMatrix(risks: RiskListItem[], bands: RiskBands): MatrixCell[][] {
  return Array.from({ length: 5 }, (_, row) => {
    const probability = 5 - row

    return Array.from({ length: 5 }, (_, column) => {
      const impact = column + 1
      const score = probability * impact

      return {
        probability,
        impact,
        score,
        level: levelFor(score, bands),
        risks: risks.filter((risk) => risk.probability === probability && risk.impact === impact),
      }
    })
  })
}
