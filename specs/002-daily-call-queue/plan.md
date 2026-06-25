# Implementation Plan: Daily Call Queue

**Branch**: `002-daily-call-queue` | **Date**: 2026-06-24 | **Spec**: `specs/002-daily-call-queue/spec.md`

**Input**: Feature specification from `specs/002-daily-call-queue/spec.md`

## Summary

Build an on-demand daily call queue for Mitchel's `hermes-mitchel` tenant by adding a purpose-built Trevor queue workflow around the deployed `trevor` Postgres schema. The first implementation should keep `trevor.prospects` and `trevor.call_tasks` as the durable state, expose queue generation through a safe MCP tool contract, and deploy a tenant-local skill that tells Trevor how to request, explain, and verify the queue without direct outbound outreach.

The implementation deliberately avoids scheduled automation, direct channel sends, and durable inventory matching. It proves the human-in-the-loop daily queue first: rank due/stale/high-priority prospects, suppress do-not-contact records, mark not-call-ready rows clearly, and write stable queue items to `trevor.call_tasks`.

## Technical Context

**Language/Version**: TypeScript/Node.js for tenant MCP tooling; SQL for Trevor query and verification contracts; Markdown for tenant skill and operator runbook.

**Primary Dependencies**: Existing `@modelcontextprotocol/sdk`, `pg`, and `zod` pattern from live `trevor-db`; existing `hermes-mitchel` tenant with `trevor-db` and Agiled MCP servers.

**Storage**: Existing production Postgres `tenet0.trevor` schema, especially `trevor.prospects`, `trevor.interactions`, and `trevor.call_tasks`.

**Testing**: Contract SQL verification plus focused Node tests for ranking, suppression, idempotent task persistence, and tool output shaping before any production sync.

**Target Platform**: `aegis-prod` / `hermes-mitchel` tenant-local `/opt/data` runtime.

**Project Type**: Tenant workflow + MCP server extension, repo-controlled from `overnightdesk`.

**Performance Goals**: Generate a representative queue from at least 10 prospects in under 10 seconds during operator validation; target normal MCP response under 2 seconds for current 43-row production prospect scale.

**Constraints**: No autonomous calls or sends; do-not-contact records never appear as callable recommendations; no secrets or full prospect notes in logs; repeat generation against unchanged data must not create duplicate open tasks.

**Scale/Scope**: Current production scale is 43 prospects, 0 interactions, 0 call tasks, and 0 follow-up drafts after Feature 1 deployment. Design should comfortably support hundreds of prospects without new infrastructure.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer Data Is Sacred**: PASS. Queue data remains in tenant-owned Postgres; no prospect exports to markdown or platform database.
- **Security Is A Feature**: PASS. Tool contracts use parameterized queries, bounded limits, no secrets, no outbound-send actions, and no raw SQL in the high-level queue path.
- **Ops Agent Acts / Owner Decides**: PASS. Trevor recommends and records queue tasks; Mitchel remains the human caller. No automated outreach.
- **Simple Over Clever**: PASS. Reuses existing Postgres schema and tenant MCP pattern rather than adding a dashboard, scheduler, external search, or new database.
- **Business Pays Before It Grows**: PASS. No paid service or infrastructure dependency is introduced.
- **Honesty With Customers / Operators**: PASS. Queue output must label missing Agiled or inventory context instead of inventing it.
- **Owner's Time Protected**: PASS. Operator verification is scripted; daily queue is on-demand before any cron work.
- **Platform Quality Drives Retention**: PASS. The workflow includes deterministic ranking, idempotent task persistence, and explicit failure visibility.

## Project Structure

### Documentation (this feature)

```text
specs/002-daily-call-queue/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── mcp-tools.yaml
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
tenants/
└── hermes-mitchel/
    ├── mcp-servers/
    │   └── trevor-db/
    │       ├── package.json
    │       ├── src/
    │       │   ├── index.ts
    │       │   └── queue.ts
    │       └── tests/
    │           └── queue.test.ts
    └── skills/
        └── daily-call-queue/
            └── SKILL.md

specs/002-daily-call-queue/
└── contracts/
    ├── mcp-tools.yaml
    └── queue-verification.sql
```

**Structure Decision**: Put repo-controlled tenant workflow source under `tenants/hermes-mitchel/` because the deployed runtime is tenant-local `/opt/data`, not the public Next.js app. Keep contracts and verification SQL in the feature spec directory. Do not modify `src/app` or platform database code for this feature.

## Phase 0: Research

Research output is in `research.md`. Decisions resolved:

- The durable queue should be produced by a purpose-built MCP tool, not raw SQL prompts.
- Ranking should be deterministic and database-backed.
- Agiled and inventory context are optional enrichment for this slice.
- Persistence should reuse `trevor.call_tasks` with idempotency checks instead of adding new tables.
- Observability should use sanitized structured MCP result metadata and verification SQL, not prospect detail logs.

## Phase 1: Design & Contracts

Design outputs:

- `data-model.md`: queue entities, state transitions, validation rules, and query semantics.
- `contracts/mcp-tools.yaml`: MCP tools for `generate_daily_call_queue`, `list_call_tasks`, and `mark_call_task_status`.
- `quickstart.md`: local review, production validation, and deployment checklist.

## Constitution Check — Post Design

- **Data boundary**: PASS. The only writes are to `trevor.call_tasks` through parameterized MCP functions.
- **Security boundary**: PASS. Contracts explicitly exclude send-capable actions, secrets, raw SQL, and full note logging.
- **Human approval**: PASS. Generated tasks are recommendations; completion or discard requires explicit human/operator action.
- **Simplicity**: PASS. No scheduler or inventory store is added.
- **Operability**: PASS. Quickstart requires validation of DNC suppression, idempotency, and persisted tasks before deployment is complete.

## Complexity Tracking

No constitution violations require justification.
