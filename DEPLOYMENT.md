# Deployment

Local infrastructure is defined in `docker-compose.yml`. Production deployment must use managed or self-hosted PostgreSQL/PostGIS with backups, TLS, non-example secrets and isolated object storage. Run database migrations as a single deployment step before starting a new API version.
