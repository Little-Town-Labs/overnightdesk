# Implementation Plan: Post-Call Capture

**Branch**: `004-post-call-capture` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-post-call-capture/spec.md`

## Summary

Add an approval-safe post-call capture workflow to the repo-controlled `trevor-db` MCP server for `hermes-mitchel`. The first deployable slice writes one durable local interaction, updates prospect cadence state, closes or updates the associated call task, reports missing required fields before any write, and keeps Agiled note mirroring separate from outbound follow-up sending.

## Technical Context

**Language/Version**: TypeScript on Node.js 22 runtime in `hermes-mitchel`

**Primary Dependencies**: Existing `@modelcontextprotocol/sdk`, `pg`, and `zod` package used by `trevor-db`

**Storage**: Existing `trevor.prospects`, `trevor.call_tasks`, and `trevor.interactions`; no new table for the first slice

**Testing**: Node test runner through `npm test` in `tenants/hermes-mitchel/mcp-servers/trevor-db`

**Target Platform**: `hermes-mitchel` tenant on `aegis-prod`, with local source under `tenants/hermes-mitchel`

**Project Type**: Tenant MCP server extension plus tenant skill guidance

**Performance Goals**: Capture a seeded call task in under 10 seconds during operator validation

**Constraints**: Human-submitted capture only; no outbound sends; no follow-up draft creation in this feature; no secret or full CRM payload logging; local capture must remain reliable when Agiled note creation is skipped or fails

**Scale/Scope**: Single Mitchel tenant, dozens to hundreds of prospects, on-demand post-call use

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer Data Is Sacred**: PASS. Tenant prospect and call history stay in Trevor Postgres and Agiled; no markdown exports or hidden memory storage.
- **Security Is A Feature**: PASS. MCP inputs are validated with Zod and SQL remains parameterized.
- **Ops Agent Acts; Owner Decides**: PASS. The feature records Mitchel's reported outcome and does not send follow-up or make autonomous outreach decisions.
- **Simple Over Clever**: PASS. Extend the existing `trevor-db` package rather than adding a new service.
- **Honesty With Customers / Operators**: PASS. Local write status and Agiled note status are reported separately.

## Project Structure

### Documentation (this feature)

```text
specs/004-post-call-capture/
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
tenants/hermes-mitchel/
├── mcp-servers/trevor-db/
│   ├── src/
│   │   ├── capture.ts
│   │   ├── db.ts
│   │   ├── index.ts
│   │   ├── queue.ts
│   │   ├── brief.ts
│   │   ├── safety.ts
│   │   └── types.ts
│   └── tests/
│       ├── capture-*.test.ts
│       ├── fixtures.ts
│       └── test-repo.ts
└── skills/post-call-capture/
    └── SKILL.md
```

**Structure Decision**: Extend the existing `trevor-db` MCP package because Features 2 and 3 already deployed queue, task, and pre-call context over the same tenant data. Add a separate `capture.ts` module so write behavior remains auditable and isolated from read-only queue/brief logic.

## Complexity Tracking

No constitution violations.
