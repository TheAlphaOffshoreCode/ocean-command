import { hash, verify, type Algorithm } from '@node-rs/argon2'

// `Algorithm` is an ambient const enum, which isolatedModules (required by Next)
// forbids reading at runtime. The value is its Argon2id member.
const ARGON2ID = 2 as Algorithm

/**
 * Argon2id, with OWASP's second recommended parameter set (19 MiB, t=2, p=1).
 *
 * Shared by Better Auth and the seed, so a seeded account and one created
 * through the product are hashed identically — a seed that hashes differently is
 * a seed that stops proving anything about sign-in.
 */
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await verify(digest, password, ARGON2_OPTIONS)
  } catch {
    // A malformed or truncated digest is a failed verification, not a crash.
    return false
  }
}
