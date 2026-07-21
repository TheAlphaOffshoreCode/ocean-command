# Threat model

Primary threats are cross-tenant data disclosure, credential attacks, unauthorized operational changes and audit tampering. Controls: organization-scoped queries, server-side RBAC, Argon2id, rate limits, secure cookies, validation, parameterized queries and append-only application audit records. Future controls include row-level security, token revocation, MFA, immutable external audit storage and security testing.
