// `server-only` throws when resolved outside a React Server Component, which is
// exactly its job — and which would stop the test runner from importing the very
// modules we need to test. Vitest aliases the package to this no-op.
export {}
