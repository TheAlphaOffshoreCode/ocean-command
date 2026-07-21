# Changelog

## Unreleased

- Added the first Fase 2 slice: tenant-scoped offshore asset CRUD, migration and audit events.
- Added tenant-scoped asset-area and equipment management with dependency-safe removal and audit events.
- Added tenant-scoped vessel management, vessel position history, personnel and competency catalogs, and POB registration.

## 0.1.1 - 2026-07-21

- Added the reproducible `pnpm-lock.yaml` and explicit approvals for required native dependency builds.
- Fixed API error typing and made migration bootstrapping idempotent.
- Validated the full build, test and local infrastructure path against PostgreSQL/PostGIS.

## 0.1.0 - 2026-07-20

Initial Fase 0–1 foundation: local infrastructure, identity, RBAC, tenant isolation and audit trail.
