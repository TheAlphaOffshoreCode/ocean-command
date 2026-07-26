/**
 * Typed errors. Server actions convert these into an ActionResult instead of
 * letting them cross the network boundary as exceptions — see docs/API.md.
 *
 * Rule for `message`: it is shown to an operator. Never put a stack trace, a
 * query, or an internal id in it.
 */

export type ErrorKind =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DOMAIN_RULE'
  | 'CONFLICT'
  | 'PROVIDER_UNAVAILABLE'
  | 'INTERNAL'

export abstract class AppError extends Error {
  abstract readonly kind: ErrorKind
  /** HTTP status for route handlers. Server actions map through `kind`. */
  abstract readonly status: number

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends AppError {
  readonly kind = 'VALIDATION' as const
  readonly status = 400

  constructor(readonly fields: Record<string, string[]>) {
    super('The submitted data is invalid.')
  }
}

export class AuthenticationError extends AppError {
  readonly kind = 'UNAUTHENTICATED' as const
  readonly status = 401

  constructor(message = 'You must sign in to continue.') {
    super(message)
  }
}

export class AuthorizationError extends AppError {
  readonly kind = 'FORBIDDEN' as const
  readonly status = 403

  constructor(message = 'You do not have permission to perform this action.') {
    super(message)
  }
}

/**
 * Also thrown when a record exists but belongs to another organization. That is
 * deliberate: a 403 would confirm the record exists. See SECURITY.md §4.
 */
export class NotFoundError extends AppError {
  readonly kind = 'NOT_FOUND' as const
  readonly status = 404

  constructor(resource = 'record') {
    super(`The requested ${resource} was not found.`)
  }
}

/** A domain invariant refused the operation. The message is written for the operator. */
export class DomainRuleError extends AppError {
  readonly kind = 'DOMAIN_RULE' as const
  readonly status = 422

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export class ConflictError extends AppError {
  readonly kind = 'CONFLICT' as const
  readonly status = 409
}

export class ProviderError extends AppError {
  readonly kind = 'PROVIDER_UNAVAILABLE' as const
  readonly status = 503

  constructor(
    readonly provider: string,
    message: string,
    readonly retryable = true,
  ) {
    super(message)
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
