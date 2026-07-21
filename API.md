# API

Base path: `/api/v1`. Current identity endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /me`, `GET /organizations/:id`, `GET|POST /users`, and `GET /audit`. `GET /health` is liveness; `GET /ready` checks PostgreSQL. Authentication is a secure cookie and all protected endpoints require it.
