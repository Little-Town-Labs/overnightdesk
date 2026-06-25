# Implementation Plan: Follow-Up Drafting

**Branch**: `005-follow-up-drafting` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-follow-up-drafting/spec.md`

## Summary

Add a draft-only follow-up workflow to the repo-controlled `trevor-db` MCP server for `hermes-mitchel`. The first deployable slice generates deterministic channel-specific copy from a captured interaction and buyer profile, stores the draft in `trevor.followup_drafts`, exposes explicit approve/discard transitions, and never sends outbound messages.

## Technical Context

**Language/Version**: TypeScript on Node.js 22 runtime in `hermes-mitchel`

**Primary Dependencies**: Existing `@modelcontextprotocol/sdk`, `pg`, and `zod` package used by `trevor-db`

**Storage**: Existing `trevor.followup_drafts`, `trevor.interactions`, and `trevor.prospects`; no new table

**Testing**: Node test runner through `npm test` in `tenants/hermes-mitchel/mcp-servers/trevor-db`

**Target Platform**: `hermes-mitchel` tenant on `aegis-prod`, with local source under `tenants/hermes-mitchel`

**Project Type**: Tenant MCP server extension plus tenant skill guidance

**Performance Goals**: Generate or return a seeded draft in under 10 seconds during operator validation

**Constraints**: Draft-only; no outbound sends; no sent status or external message ID updates; no secret or full CRM payload logging; do-not-contact prospects must not receive persuasive follow-up language

**Scale/Scope**: Single Mitchel tenant, dozens to hundreds of prospects and drafts, on-demand use

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer Data Is Sacred**: PASS. Tenant draft data stays in Trevor Postgres and is not exported to markdown or hidden memory.
- **Security Is A Feature**: PASS. MCP inputs are validated with Zod and SQL remains parameterized.
- **Ops Agent Acts; Owner Decides**: PASS. The workflow drafts and records approval state only; Mitchel remains the human sender.
- **Simple Over Clever**: PASS. Extend the existing `trevor-db` package rather than adding a new service.
- **Honesty With Customers / Operators**: PASS. Responses explicitly state `outbound_sent=false` and expose draft status.

## Project Structure

### Documentation (this feature)

```text
specs/005-follow-up-drafting/
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
│   │   ├── followup.ts
│   │   ├── capture.ts
│   │   ├── db.ts
│   │   ├── index.ts
│   │   ├── queue.ts
│   │   ├── brief.ts
│   │   ├── safety.ts
│   │   └── types.ts
│   └── tests/
│       ├── followup-*.test.ts
│       ├── fixtures.ts
│       └── test-repo.ts
└── skills/follow-up-drafting/
    └── SKILL.md
```

**Structure Decision**: Extend the existing `trevor-db` MCP package because Features 2 through 4 already own the prospecting loop over the same tenant tables. Add a separate `followup.ts` module so draft generation and approval state stay isolated from call capture.

## Complexity Tracking

No constitution violations.
