# API

Base path: `/api/v1`. Current identity endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /me`, `GET /organizations/:id`, `GET|POST /users`, and `GET /audit`. Asset endpoints are `GET|POST /assets` and `GET|PATCH|DELETE /assets/:id`. Assets are always scoped to the authenticated organization; administrators and operations coordinators can create or update them, while only administrators can delete them. `GET /health` is liveness; `GET /ready` checks PostgreSQL. Authentication is a secure cookie and all protected endpoints require it.
