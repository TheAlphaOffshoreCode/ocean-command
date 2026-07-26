'use client'

import { useSyncExternalStore } from 'react'

/**
 * "4m ago", without a hydration mismatch and without a clock in the render path.
 *
 * Computing a relative time during render is wrong in a client component: the
 * server renders it at one instant and the browser hydrates at another, so React
 * sees two different strings — and on a slow connection the gap is large enough
 * to be visibly wrong, not merely noisy.
 *
 * `useSyncExternalStore` is the API for exactly this: `getServerSnapshot` returns
 * null, so the server (and the first client paint) renders the absolute time, and
 * the relative form appears once the store is subscribed. The snapshot is bucketed
 * to 30 s so it is stable between renders — returning `Date.now()` directly would
 * be a new value every render, which is an infinite loop.
 *
 * A first attempt set state inside an effect. That works, but it is the pattern
 * React's own lint rule flags, and it renders twice on mount for no reason.
 */

const TICK_MS = 30_000

function subscribe(onStoreChange: () => void) {
  const timer = setInterval(onStoreChange, TICK_MS)
  return () => clearInterval(timer)
}

/** Bucketed, so the value only changes once per tick. */
function getSnapshot(): number {
  return Math.floor(Date.now() / TICK_MS)
}

/** Null on the server: nothing time-dependent is rendered until the client runs. */
function getServerSnapshot(): null {
  return null
}

function relative(from: Date, now: number): string {
  const seconds = Math.round((now - from.getTime()) / 1000)

  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86_400)}d ago`
}

/** Stable on both sides of hydration: UTC, no locale, no clock. */
function absolute(value: Date): string {
  return `${value.toISOString().slice(11, 16)}Z`
}

/**
 * The client clock, bucketed and hydration-safe. Null until the client is running.
 *
 * Exported because more than one component needs "how old is this?" — and every
 * component that computes it from Date.now() during render reintroduces the
 * hydration mismatch this file exists to avoid.
 */
export function useNowBucket(): number | null {
  const bucket = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return bucket === null ? null : bucket * TICK_MS
}

export function TimeAgo({ value, fallback = 'never' }: { value: Date | null; fallback?: string }) {
  const bucket = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (!value) return <span>{fallback}</span>

  const date = new Date(value)

  return (
    <time dateTime={date.toISOString()} title={date.toISOString()}>
      {bucket === null ? absolute(date) : relative(date, bucket * TICK_MS)}
    </time>
  )
}
