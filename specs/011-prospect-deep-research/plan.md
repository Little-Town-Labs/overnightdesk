# Implementation Plan: Prospect Deep Research

**Branch**: `011-prospect-deep-research` | **Date**: 2026-07-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-prospect-deep-research/spec.md`

## Summary

Add a durable, review-first research evidence layer for all Trevor prospects. The first implementation slice creates the foreign-keyed evidence table and bounded MCP contracts for storing and listing public findings, then later slices add prioritized claiming, automated research, reviewed promotion, and a disabled-by-default Saturday 23:00 America/Chicago scheduler for missing-email enrichment and deep research.

## Technical Context

**Language/Version**: TypeScript/Node.js for Trevor MCP server; SQL migrations for Tenet-0 Postgres.

**Primary Dependencies**: Existing Trevor DB MCP server, `pg`, Zod, existing CamoFox/web research utilities where appropriate.

**Storage**: `trevor` schema in `tenet0-postgres`; new `trevor.prospect_research_runs` and `trevor.prospect_research_evidence` tables.

**Testing**: `npm test` in `tenants/hermes-mitchel/mcp-servers/trevor-db`; SQL review through migration diff and production preflight before deploy.

**Target Platform**: Aegis `hermes-mitchel` tenant using repo-controlled Trevor MCP runtime and `tenet0-postgres`.

**Project Type**: Brownfield tenant-local MCP workflow and database schema change.

**Performance Goals**: Claim/list operations remain bounded; default batches should handle 5-10 prospects without long-running table scans.

**Constraints**: No outbound messaging; no direct `trevor.prospects.email` writes from unreviewed evidence; RDAP/WHOIS is never sufficient email evidence; source notes are bounded and sanitized summaries; production scheduler activation requires explicit operator approval after migration, MCP deploy, and on-demand smoke tests.

**Scale/Scope**: Single Mitchel tenant, hundreds of prospects, public evidence rows per prospect.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer/tenant data is sacred**: PASS. Evidence stays in Trevor Postgres and is not copied into platform tables.
- **Security and validation**: PASS. External web/RDAP data is treated as untrusted, bounded, and review-gated.
- **Ops agent acts; owner/user decides**: PASS. First slices store and review evidence; promotion requires explicit review.
- **Simple over clever**: PASS. Additive tables and MCP tools extend the existing Trevor pattern.
- **Platform quality drives retention**: PASS. Workflow is observable through status/counts and safe to operate in batches.
- **Frontend never accesses tenant internals directly**: PASS. No platform frontend access is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/011-prospect-deep-research/
├── checklists/requirements.md
├── contracts/mcp-tools.yaml
├── data-model.md
├── plan.md
├── quickstart.md
├── research.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
tenet-0/db/migrations/
└── 055_trevor_prospect_deep_research.sql

tenants/hermes-mitchel/mcp-servers/trevor-db/
├── src/
│   ├── db.ts
│   ├── index.ts
│   ├── prospect-research.ts
│   └── types.ts
└── tests/
    ├── prospect-research.test.ts
    ├── prospect-research-scheduler.test.ts
    └── test-repo.ts

tenants/hermes-mitchel/runbooks/
└── prospect-deep-research.md

tenants/hermes-mitchel/schedules/
└── prospect-weekly-research-jobs.json
```

**Structure Decision**: Keep schema under Tenet-0 migrations because the live Trevor schema is hosted by `tenet0-postgres`; keep workflow code under `tenants/hermes-mitchel/mcp-servers/trevor-db` because that owns Mitchel/Trevor tenant tools.

## Complexity Tracking

No constitution violations identified.
