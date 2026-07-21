# Self hosting

Provide PostgreSQL with PostGIS, Redis, S3-compatible storage and Node 22+. Configure values from `.env.example` using a secret manager, run `pnpm db:migrate`, then start API and web behind TLS. Do not expose database, Redis or MinIO ports publicly.
