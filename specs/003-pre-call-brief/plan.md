# Implementation Plan: Pre-Call Brief

**Branch**: `003-pre-call-brief` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-pre-call-brief/spec.md`

## Summary

Add an on-demand pre-call brief tool to the repo-controlled `trevor-db` MCP server for `hermes-mitchel`. The first deployable slice reads Trevor Postgres prospect, call-task, and interaction data; returns a compact brief with honest missing-context warnings; and preserves the no-outbound boundary.

## Technical Context

**Language/Version**: TypeScript on Node.js 22 runtime in `hermes-mitchel`

**Primary Dependencies**: Existing `@modelcontextprotocol/sdk`, `pg`, and `zod` package used by `trevor-db`

**Storage**: Existing `trevor.prospects`, `trevor.call_tasks`, and `trevor.interactions`; no new table

**Testing**: Node test runner through `npm test` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db`

**Target Platform**: `hermes-mitchel` tenant on `aegis-prod`, with local source under `tenet-0/tenant-workflows/hermes-mitchel`

**Project Type**: Tenant MCP server extension plus tenant skill guidance

**Performance Goals**: Generate a brief from seeded data in under 10 seconds; query bounded candidate lists for ambiguity

**Constraints**: Read-only workflow; no interactions, follow-up drafts, Agiled writes, outbound calls, or sends; no full prospect notes in logs

**Scale/Scope**: Single Mitchel tenant, dozens to hundreds of prospects, on-demand use

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer Data Is Sacred**: PASS. Tenant prospect data stays in Postgres/Agiled; no markdown exports or hidden memory storage.
- **Security Is A Feature**: PASS. MCP inputs are validated with Zod and SQL remains parameterized.
- **Ops Agent Acts; Owner Decides**: PASS. Brief generation is read-only and does not perform outreach or CRM mutations.
- **Simple Over Clever**: PASS. Extend the existing `trevor-db` package rather than adding a new service.
- **Honesty With Customers / Operators**: PASS. Missing Agiled and inventory context is explicit.

## Project Structure

### Documentation (this feature)

```text
specs/003-pre-call-brief/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── mcp-tools.yaml
└── tasks.md
```

### Source Code (repository root)

```text
tenet-0/tenant-workflows/hermes-mitchel/
├── mcp-servers/trevor-db/
│   ├── src/
│   │   ├── brief.ts
│   │   ├── db.ts
│   │   ├── index.ts
│   │   ├── queue.ts
│   │   ├── safety.ts
│   │   └── types.ts
│   └── tests/
│       ├── brief-*.test.ts
│       ├── fixtures.ts
│       └── test-repo.ts
└── skills/pre-call-brief/
    └── SKILL.md
```

**Structure Decision**: Extend the existing `trevor-db` MCP package because Feature 2 already deployed the queue/task boundary and this feature is the next read-only workflow over the same tenant data.

## Complexity Tracking

No constitution violations.
