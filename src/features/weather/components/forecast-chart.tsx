'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ForecastPoint } from '@/features/weather/queries/get-conditions'

/**
 * Wind and wave over the forecast horizon, with the limits drawn on.
 *
 * The reference lines are the point of the chart. A wind curve on its own says
 * "it gets windier on Thursday"; the same curve crossing a dashed line at 25 knots
 * says "the crew transfer cannot sail on Thursday", which is the question the page
 * exists to answer.
 */

type Props = {
  forecast: ForecastPoint[]
  /** Thresholds for the selected operation type, drawn as reference lines. */
  limits: {
    windMarginal: number
    windUnsafe: number
    waveMarginal: number
    waveUnsafe: number
  }
}

const AXIS = '#5f758f'
const GRID = '#1d3048'

export function ForecastChart({ forecast, limits }: Props) {
  const data = forecast.map((point) => ({
    // Hour label only: a full timestamp on every tick is unreadable at 48 points.
    time: `${point.forecastFor.toISOString().slice(11, 13)}h`,
    iso: point.forecastFor.toISOString(),
    wind: point.windSpeedKn,
    gust: point.windGustKn,
    wave: point.waveHeightM,
  }))

  return (
    <div className="space-y-4">
      <Chart
        data={data}
        label="Wind and gusts (kn)"
        series={[
          { key: 'wind', colour: '#22d3ee', name: 'Wind' },
          { key: 'gust', colour: '#5f758f', name: 'Gusts' },
        ]}
        marginal={limits.windMarginal}
        unsafe={limits.windUnsafe}
        unit="kn"
      />

      <Chart
        data={data}
        label="Significant wave height (m)"
        series={[{ key: 'wave', colour: '#38bdf8', name: 'Hs' }]}
        marginal={limits.waveMarginal}
        unsafe={limits.waveUnsafe}
        unit="m"
      />
    </div>
  )
}

type ChartDatum = {
  time: string
  iso: string
  wind: number | null
  gust: number | null
  wave: number | null
}

function Chart({
  data,
  label,
  series,
  marginal,
  unsafe,
  unit,
}: {
  data: ChartDatum[]
  label: string
  series: Array<{ key: 'wind' | 'gust' | 'wave'; colour: string; name: string }>
  marginal: number
  unsafe: number
  unit: string
}) {
  const hasValues = data.some((datum) => series.some((entry) => datum[entry.key] !== null))

  if (!hasValues) {
    return (
      <div>
        <p className="text-ink-faint mb-1 text-[11px]">{label}</p>
        <p className="text-ink-faint border-line rounded border border-dashed px-3 py-6 text-center text-xs">
          The provider returned no data for this metric.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-ink-faint mb-1 text-[11px]">{label}</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: AXIS, fontSize: 10 }}
              stroke={GRID}
              interval={5}
            />
            <YAxis tick={{ fill: AXIS, fontSize: 10 }} stroke={GRID} width={40} />

            <ReferenceLine
              y={marginal}
              stroke="#fbbf24"
              strokeDasharray="4 4"
              label={{ value: `marginal ${marginal}${unit}`, fill: '#fbbf24', fontSize: 9, position: 'insideTopRight' }}
            />
            <ReferenceLine
              y={unsafe}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              label={{ value: `unsafe ${unsafe}${unit}`, fill: '#f43f5e', fontSize: 9, position: 'insideBottomRight' }}
            />

            {series.map((entry) => (
              <Line
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                name={entry.name}
                stroke={entry.colour}
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            ))}

            <Tooltip
              contentStyle={{
                background: '#132234',
                border: `1px solid ${GRID}`,
                borderRadius: 6,
                fontSize: 11,
              }}
              labelStyle={{ color: '#93a9c2' }}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.iso?.slice(0, 16).replace('T', ' ') ?? ''
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
