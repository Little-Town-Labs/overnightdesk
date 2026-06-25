# Implementation Plan: Follow-Up Sent Logging

**Branch**: `007-follow-up-sent-logging` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-follow-up-sent-logging/spec.md`

## Summary

Add a no-send follow-up logging workflow to the repo-controlled `trevor-db` MCP server for `hermes-mitchel`. The first deployable slice lists approved follow-up drafts awaiting manual send confirmation, records explicit manual-send confirmations as `trevor.interactions`, marks confirmed drafts `manual_sent`, and keeps all outbound delivery out of scope.

## Technical Context

**Language/Version**: TypeScript on Node.js 22 runtime in `hermes-mitchel`

**Primary Dependencies**: Existing `@modelcontextprotocol/sdk`, `pg`, and `zod` package used by `trevor-db`; no new runtime dependency planned

**Storage**: Existing `trevor.followup_drafts`, `trevor.interactions`, and `trevor.prospects`; no new table for the initial slice

**Testing**: Node test runner through `npm test` in `tenants/hermes-mitchel/mcp-servers/trevor-db`

**Target Platform**: `hermes-mitchel` tenant on `aegis-prod`, with local source under `tenants/hermes-mitchel`

**Project Type**: Tenant MCP server extension plus tenant skill guidance

**Performance Goals**: List pending send confirmations or record a seeded manual-send confirmation in under 10 seconds at current production scale

**Constraints**: No direct outbound sends; explicit confirmation required; no duplicate sent interactions on retry; no full prospect notes, full draft bodies in queue output, secrets, or database URLs in logs; do-not-contact confirmations require an explicit audit-only override reason

**Scale/Scope**: Single Mitchel tenant, current production scale of dozens of prospects and zero-to-hundreds of drafts/interactions; bounded list responses with configurable limit

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer Data Is Sacred**: PASS. Tenant prospect and interaction records stay in Trevor Postgres and are not exported to markdown or hidden memory.
- **Security Is A Feature**: PASS. MCP inputs will be validated with Zod, SQL stays parameterized, and responses/logs avoid secrets and raw CRM payloads.
- **Ops Agent Acts; Owner Decides**: PASS. Trevor records only an explicit human-confirmed action; no automated send is introduced.
- **Simple Over Clever**: PASS. Extend the existing `trevor-db` package and follow-up skill rather than adding a new service.
- **Honesty With Customers / Operators**: PASS. Responses must distinguish logged human/manual sends from automated outbound sends with `outbound_sent=false`.
- **Test-First Imperative**: PASS. Tasks require failing tests before implementation because this feature mutates prospect history.

## Project Structure

### Documentation (this feature)

```text
specs/007-follow-up-sent-logging/
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
│   │   ├── safety.ts
│   │   └── types.ts
│   └── tests/
│       ├── followup-sent-*.test.ts
│       ├── fixtures.ts
│       └── test-repo.ts
└── skills/follow-up-drafting/
    └── SKILL.md
```

**Structure Decision**: Extend the existing `followup.ts` module because it already owns draft generation and draft status transitions. Add sent-log-specific functions inside that boundary, with repository methods in `db.ts` and test repo support in `test-repo.ts`.

## Complexity Tracking

No constitution violations.
