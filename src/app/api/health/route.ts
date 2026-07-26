import { NextResponse } from 'next/server'

/** Liveness. No database access, no data: it answers "is this process up?". */
export function GET() {
  return NextResponse.json({ status: 'ok' })
}
