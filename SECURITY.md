# Security

Report vulnerabilities privately; do not open public issues with exploit details. This foundation uses Argon2id password hashing, input validation, parameterized PostgreSQL queries, CORS allowlisting, security headers, rate limits, httpOnly same-site cookies and API-side RBAC. Before production, replace all example secrets, enable TLS, configure a reverse proxy/WAF, rotate credentials and complete a penetration test.

Production metrics must be protected with `METRICS_TOKEN`; configure it as a secret alongside `DATABASE_URL` and `JWT_SECRET`. Backups are excluded from Git and restore is guarded by an explicit `-ConfirmRestore` flag. See [docs/PRODUCTION.md](./docs/PRODUCTION.md) for deployment and recovery procedures.
