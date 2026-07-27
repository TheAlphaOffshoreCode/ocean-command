'use client'

import { useState } from 'react'

import { Badge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/states'
import type { MatrixCell, RiskListItem } from '@/features/risk/queries/list-risks'
import { IMPACT_LABELS, PROBABILITY_LABELS } from '@/lib/domain/risk/risk-engine'
import { cn } from '@/lib/utils'

/**
 * The 5×5 matrix, with the register's risks in their cells.
 *
 * The grid is the artefact everyone in the industry already reads, so it is drawn
 * the way it hangs on a wall: probability descending down the rows, impact
 * increasing to the right, worst corner top-right. Clicking a cell drills into the
 * risks that live there — a matrix you cannot click is a picture, not a tool.
 */

const LEVEL_CLASS: Record<string, string> = {
  LOW: 'bg-normal-soft text-normal',
  MODERATE: 'bg-attention-soft text-attention',
  HIGH: 'bg-warning-soft text-warning',
  CRITICAL: 'bg-critical-soft text-critical',
}

const LEVEL_TONE: Record<string, 'normal' | 'attention' | 'warning' | 'critical'> = {
  LOW: 'normal',
  MODERATE: 'attention',
  HIGH: 'warning',
  CRITICAL: 'critical',
}

export function RiskMatrix({ matrix }: { matrix: MatrixCell[][] }) {
  const [selected, setSelected] = useState<MatrixCell | null>(null)

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-1">
          <caption className="text-ink-faint mb-2 text-left text-[11px]">
            Probability × impact. Each cell shows its score and how many open risks sit there.
          </caption>
          <thead>
            <tr>
              <th className="text-ink-faint w-24 text-left text-[10px] font-normal">
                Probability ↓ / Impact →
              </th>
              {IMPACT_LABELS.map((label, index) => (
                <th key={label} className="text-ink-faint text-[10px] font-normal">
                  <span className="numeric">{index + 1}</span>
                  <span className="block">{label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const probability = row[0]!.probability

              return (
                <tr key={probability}>
                  <th className="text-ink-faint text-right text-[10px] font-normal">
                    <span className="numeric">{probability}</span>{' '}
                    {PROBABILITY_LABELS[probability - 1]}
                  </th>

                  {row.map((cell) => {
                    const isSelected =
                      selected?.probability === cell.probability &&
                      selected?.impact === cell.impact

                    return (
                      <td key={cell.impact}>
                        <button
                          type="button"
                          onClick={() => setSelected(isSelected ? null : cell)}
                          aria-pressed={isSelected}
                          aria-label={`Probability ${cell.probability}, impact ${cell.impact}, score ${cell.score}, ${cell.risks.length} risks`}
                          className={cn(
                            'flex h-14 w-full flex-col items-center justify-center rounded transition-opacity',
                            LEVEL_CLASS[cell.level],
                            cell.risks.length === 0 && 'opacity-40',
                            isSelected && 'ring-accent ring-2',
                          )}
                        >
                          <span className="numeric text-xs font-semibold">{cell.score}</span>
                          {cell.risks.length > 0 ? (
                            <span className="numeric text-[10px]">{cell.risks.length}</span>
                          ) : null}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="border-line rounded border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-ink text-xs font-medium">
              Probability {selected.probability} × impact {selected.impact} ={' '}
              <span className="numeric">{selected.score}</span>
            </p>
            <Badge tone={LEVEL_TONE[selected.level] ?? 'neutral'}>{selected.level}</Badge>
          </div>

          {selected.risks.length === 0 ? (
            <p className="text-ink-faint text-[11px]">No risks in this cell.</p>
          ) : (
            <ul className="divide-line divide-y">
              {selected.risks.map((risk) => (
                <RiskRow key={risk.id} risk={risk} />
              ))}
            </ul>
          )}
        </div>
      ) : (
        <EmptyState
          title="Select a cell"
          description="Pick a square to see the risks scored there."
        />
      )}
    </div>
  )
}

function RiskRow({ risk }: { risk: RiskListItem }) {
  return (
    <li className="py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink text-xs">
            <span className="numeric text-ink-faint mr-2">{risk.code}</span>
            {risk.title}
          </p>
          <p className="text-ink-faint mt-0.5 text-[11px]">
            {risk.category.toLowerCase()} · {risk.status.toLowerCase()}
            {risk.vessel ? ` · ${risk.vessel.name}` : ''}
            {risk.openActions > 0 ? ` · ${risk.openActions} open action(s)` : ''}
          </p>
        </div>
      </div>
    </li>
  )
}
