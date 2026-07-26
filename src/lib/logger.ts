import 'server-only'

import pino from 'pino'

import { env, isProduction, isTest } from '@/config/env'

/**
 * Structured JSON logs to stdout. Never log a secret, a password, a token or a
 * request body: the redaction list below is the last line of defence, not the
 * first — the first is not passing them in.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'secret',
      '*.password',
      '*.passwordHash',
      '*.token',
      'req.headers.cookie',
      'req.headers.authorization',
    ],
    censor: '[redacted]',
  },
  // Pretty output is a development convenience; production stays machine-readable.
  ...(isProduction ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
})

export type LogContext = {
  requestId?: string
  organizationId?: string
  userId?: string
  module?: string
}

/** A child logger carrying the request's context on every line it writes. */
export function contextLogger(context: LogContext) {
  return logger.child(context)
}
