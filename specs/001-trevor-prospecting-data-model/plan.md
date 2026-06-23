# Implementation Plan: Trevor Prospecting Data Model

**Branch**: `001-trevor-prospecting-data-model` | **Date**: 2026-06-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-trevor-prospecting-data-model/spec.md`

## Summary

Formalize the live `trevor` prospecting schema as a repeatable, reviewable
database change for the Mitchel tenant. The implementation extends the existing
`tenet0-postgres`/`trevor` schema with cadence fields on prospects, new call
task storage, new follow-up draft storage, verification queries, and operator
runbook guidance for backup, deployment, rollback, and documentation.

## Technical Context

**Language/Version**: SQL for PostgreSQL 16; Bash runbook commands for existing migration runner

**Primary Dependencies**: Existing `tenet-0/db/migrate.sh apply-pending` migration runner; `psql`; `pg_dump`

**Storage**: `tenet0-postgres` PostgreSQL database, `trevor` schema

**Testing**: SQL dry-run/review, migration application against staging or copied database, verification SQL queries, live production read-only checks before deployment

**Target Platform**: aegis-prod Docker-hosted PostgreSQL (`tenet0-postgres`) plus repo-controlled migration artifacts

**Project Type**: Database migration and operator documentation

**Performance Goals**: Verification completes in under 10 minutes; queue-supporting lookups by next action, priority, status, and draft/task state use explicit indexes

**Constraints**: Preserve all existing `trevor.prospects`, `trevor.interactions`, and `trevor.memory` rows; do not apply production changes without a backup; do not store secrets in prospecting tables; do not send outbound messages

**Scale/Scope**: Single tenant business schema currently containing tens of prospects, designed for growth to thousands of prospects and follow-up records without changing the first query model

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer data is sacred**: Pass. The plan keeps tenant business data inside the tenant-owned `trevor` schema and does not copy records into markdown or platform tables.
- **Security is a feature**: Pass. The plan uses schema-scoped grants and avoids storing credentials or channel tokens in prospecting records.
- **Ops agent acts; owner decides**: Pass. The migration is repo-controlled and requires explicit operator deployment; no autonomous production action occurs.
- **Simple over clever**: Pass. The design uses the existing Bash + SQL migration pattern already present under `tenet-0/db`.
- **Owner time is protected**: Pass. Backup, verification, and rollback steps are documented so future deployments are repeatable.

## Project Structure

### Documentation (this feature)

```text
specs/001-trevor-prospecting-data-model/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── schema-verification.sql
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
tenet-0/
└── db/
    ├── migrate.sh
    └── migrations/
        └── 051_trevor_prospecting.sql

docs/
├── hermes-mitchel-prospecting-prd.md
└── runbooks/
    └── trevor-prospecting-data-model.md
```

**Structure Decision**: Use the existing `tenet-0/db/migrations` path because the target database is `tenet0-postgres`, not the platform Neon database managed by Drizzle. Add the deployment runbook under `docs/runbooks` in this repo and leave `overnightdesk-platform-standard` updates for the deployment step unless production is actually changed.

## Phase 0: Research

Research output is captured in [research.md](./research.md).

## Phase 1: Design & Contracts

Data model output is captured in [data-model.md](./data-model.md).

Verification contract is captured in [contracts/schema-verification.sql](./contracts/schema-verification.sql).

Operator validation is captured in [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

- **Customer data is sacred**: Pass. The final design stores only prospecting workflow metadata and avoids secrets.
- **Security is a feature**: Pass. The SQL includes scoped grants for `trevor_app` and verification for grants.
- **Ops agent acts; owner decides**: Pass. Runbook separates artifact creation from live deployment and requires explicit backup before production application.
- **Simple over clever**: Pass. One SQL migration, one runbook, one verification contract.
- **Owner time is protected**: Pass. Documented checks reduce future rediscovery.

## Complexity Tracking

No constitution violations.
