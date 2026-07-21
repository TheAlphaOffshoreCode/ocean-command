# Architecture

Ocean Command starts as a modular `pnpm`/Turborepo monorepo. `apps/web` is a Next.js App Router client; `apps/api` is the sole database-facing Fastify REST API. PostgreSQL/PostGIS is the system of record, Redis is prepared for cache/events and MinIO for object storage. Modules communicate through typed HTTP contracts now and versioned events as domains mature.

Identity is tenant-scoped by `organization_id`; authorization is enforced in API handlers, never only by the web layer. Passwords use Argon2id, session JWTs are short lived and held in `httpOnly` cookies, and mutations write audit events.

For self-hosting, the web and API are independently containerized and the Helm chart deploys stateless replicas with Kubernetes readiness/liveness checks. PostgreSQL/PostGIS, Redis and S3-compatible storage are operator-managed dependencies. Request IDs are structured-log correlation keys; incoming W3C `traceparent` is preserved for integration with tracing infrastructure, while `/metrics` exposes protected Prometheus-format metrics.
