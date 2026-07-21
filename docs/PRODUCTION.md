# Production and self-hosting

Ocean Command is self-hostable. The supplied Dockerfiles produce separate web and API images; the Helm chart deploys stateless replicas while PostgreSQL/PostGIS, Redis and S3-compatible object storage remain managed services selected by the operator.

## Build and deploy

```bash
docker build -f Dockerfile.api -t ocean-command-api:latest .
docker build -f Dockerfile.web -t ocean-command-web:latest .
kubectl create secret generic ocean-command-secrets \
  --from-literal=DATABASE_URL='postgres://...' \
  --from-literal=JWT_SECRET='replace-with-a-strong-random-secret' \
  --from-literal=METRICS_TOKEN='replace-with-a-separate-strong-token'
helm upgrade --install ocean-command ./deploy/helm/ocean-command
```

Use TLS at the ingress, set `config.webOrigin` to the public HTTPS URL and use immutable image tags. Do not deploy development defaults from `.env.example`.

## Observability

- Fastify emits structured JSON logs and adds `x-request-id` to every response.
- Incoming W3C `traceparent` is propagated in the response for trace correlation at a reverse proxy or OpenTelemetry collector.
- `GET /metrics` exposes Prometheus text metrics. Set `METRICS_TOKEN` in production and scrape with `Authorization: Bearer <token>`.
- `/health` is a liveness endpoint; `/ready` verifies PostgreSQL connectivity and is the readiness endpoint.

## Backup and restore

```powershell
.\scripts\backup-postgres.ps1
.\scripts\restore-postgres.ps1 -BackupPath .\backups\ocean-command-YYYYMMDD-HHMMSS.dump -ConfirmRestore
```

The backup is a PostgreSQL custom-format archive. Restore is deliberately guarded by `-ConfirmRestore`, uses `--clean --if-exists`, and must be performed only against a verified target. Test restores in a separate non-production database before scheduling production recovery drills.

## Hardening checklist

- Store all secrets in Kubernetes secrets or a dedicated secret manager; rotate `JWT_SECRET`, database credentials and `METRICS_TOKEN`.
- Restrict the database network, enforce TLS from ingress to clients, and set secure backup retention and encryption.
- Configure resource limits, replica count, monitoring alerts and an external Postgres backup policy.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `helm lint` and `helm template` before release.
- This software supports coordination; it is not an operational safety authority or a substitute for qualified human approval.
