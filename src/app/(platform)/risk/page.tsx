import type { Metadata } from 'next'

import { Badge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/states'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { RiskMatrix } from '@/features/risk/components/risk-matrix'
import { buildMatrix, listRisks, riskBands } from '@/features/risk/queries/list-risks'
import { requireTenantContext } from '@/lib/auth/tenant-context'

export const metadata: Metadata = { title: 'Risk' }

const LEVEL_TONE = {
  LOW: 'normal',
  MODERATE: 'attention',
  HIGH: 'warning',
  CRITICAL: 'critical',
} as const

export default async function RiskPage() {
  const ctx = await requireTenantContext()

  const bands = await riskBands(ctx)
  const risks = await listRisks(ctx, { openOnly: true })
  const matrix = buildMatrix(risks, bands)

  const byLevel = {
    CRITICAL: risks.filter((risk) => risk.level === 'CRITICAL').length,
    HIGH: risks.filter((risk) => risk.level === 'HIGH').length,
    MODERATE: risks.filter((risk) => risk.level === 'MODERATE').length,
    LOW: risks.filter((risk) => risk.level === 'LOW').length,
  }

  const overdueReviews = risks.filter(
    (risk) => risk.reviewDate !== null && risk.reviewDate < new Date(),
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-ink text-xl font-semibold tracking-tight">Risk Center</h1>
        <p className="text-ink-muted mt-1 text-sm">What could go wrong?</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(['CRITICAL', 'HIGH', 'MODERATE', 'LOW'] as const).map((level) => (
          <Panel key={level}>
            <PanelBody className="py-3">
              <p className="text-ink-faint text-[11px] tracking-wide uppercase">
                {level.toLowerCase()}
              </p>
              <p
                className={`numeric mt-1 text-2xl font-semibold ${
                  level === 'CRITICAL'
                    ? 'text-critical'
                    : level === 'HIGH'
                      ? 'text-warning'
                      : level === 'MODERATE'
                        ? 'text-attention'
                        : 'text-ink'
                }`}
              >
                {byLevel[level]}
              </p>
            </PanelBody>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Panel>
          <PanelHeader
            title="Risk matrix"
            description={`Bands: low ≤ ${bands.low}, moderate ≤ ${bands.moderate}, high ≤ ${bands.high}, above that critical`}
          />
          <PanelBody>
            <RiskMatrix matrix={matrix} />
          </PanelBody>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Register" description={`${risks.length} open risks, worst first`} />
            <PanelBody className="p-0">
              {risks.length === 0 ? (
                <EmptyState title="No open risks" />
              ) : (
                <ul className="divide-line max-h-[28rem] divide-y overflow-auto">
                  {risks.slice(0, 20).map((risk) => (
                    <li key={risk.id} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-ink min-w-0 text-xs">
                          <span className="numeric text-ink-faint mr-1.5">{risk.code}</span>
                          {risk.title}
                        </p>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="numeric text-ink-faint text-[11px]">{risk.score}</span>
                          <Badge tone={LEVEL_TONE[risk.level]}>{risk.level}</Badge>
                        </span>
                      </div>
                      <p className="text-ink-faint mt-0.5 text-[11px]">
                        {risk.category.toLowerCase()} · {risk.status.toLowerCase()}
                        {risk.openActions > 0 ? ` · ${risk.openActions} open action(s)` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>

          {overdueReviews.length > 0 ? (
            <Panel>
              <PanelHeader
                title="Reviews overdue"
                description="A register nobody revisits stops describing reality"
              />
              <PanelBody className="p-0">
                <ul className="divide-line divide-y">
                  {overdueReviews.map((risk) => (
                    <li key={risk.id} className="px-4 py-2 text-xs">
                      <span className="numeric text-ink-faint mr-1.5">{risk.code}</span>
                      <span className="text-ink">{risk.title}</span>
                    </li>
                  ))}
                </ul>
              </PanelBody>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  )
}
