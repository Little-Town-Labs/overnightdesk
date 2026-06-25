# Implementation Plan: Internal Buyer Intake

**Branch**: `009-internal-buyer-intake` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-internal-buyer-intake/spec.md`

## Summary

Add a Trevor internal buyer intake workflow for Mitchel so a conversation,
referral, or manually-entered buyer lead can create or update the durable
Trevor prospect record, write a bounded interaction, preserve source
attribution, and optionally create internal next-step work without sending
outbound messages. The implementation extends the existing tenant-local
`trevor-db` MCP server because it already owns prospect lookup, call tasks,
post-call capture, follow-up drafts, prospect sourcing dedupe, and production
deployment patterns for `hermes-mitchel`.

## Technical Context

**Language/Version**: TypeScript on Node.js for the existing `trevor-db` MCP
server; SQL migrations for Trevor schema changes if existing fields are
insufficient; Markdown for tenant skills and runbooks

**Primary Dependencies**: Existing MCP SDK, `pg`, `zod`, existing Trevor DB
repository layer, existing post-call capture, follow-up drafting, call queue,
and prospect sourcing modules

**Storage**: Existing `tenet0-postgres` database, `trevor` schema. Prefer
existing `trevor.prospects`, `trevor.interactions`, `trevor.call_tasks`, and
`trevor.followup_drafts`; add only minimal columns or helper tables if required
for intake source, dedupe, and Agiled sync status.

**Testing**: Existing Node test runner via `npm test` in
`tenants/hermes-mitchel/mcp-servers/trevor-db`

**Target Platform**: `aegis-prod/hermes-mitchel` tenant data volume and
`tenet0-postgres`

**Project Type**: Tenant-specific MCP server, skill docs, runbook, and optional
schema migration inside the `overnightdesk` repo

**Performance Goals**: Single intake should complete in one MCP call with
bounded output; dedupe search should inspect a small bounded candidate set and
return no more than 5 review matches for ambiguous cases.

**Constraints**: Prospect data is sensitive business data; no secrets or full
transcripts in logs; all free-form notes and pasted content are untrusted; no
outbound sends; Agiled failures must not block local Trevor writes; public
website intake remains Feature 10.

**Scale/Scope**: Single Mitchel tenant, dozens to hundreds of prospects,
internal assistant-driven intake first, future public `mitchelbrown.com` form
reuses the contract later.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer/tenant data is sacred**: PASS. Intake records stay in Trevor
  Postgres and Agiled; no prospect exports to markdown or logs.
- **Security and validation**: PASS. MCP inputs will be validated with bounded
  schemas, free-form text is untrusted, and secret-like strings are redacted.
- **Owner/customer approval boundary**: PASS. The feature can create internal
  call tasks or drafts but must never send outbound messages.
- **Simple over clever**: PASS. Extend the existing `trevor-db` MCP server and
  repository rather than adding a new service or UI.
- **Production reality first**: PASS. Plan follows deployed Feature 4, 5, 7,
  and 8 patterns already verified on Aegis.
- **Observability for production trust**: PASS. Output includes explicit status,
  dedupe result, Agiled status, created IDs, warnings, and `outbound_sent=false`
  so production smoke can verify behavior without reading private notes.

## Project Structure

### Documentation (this feature)

```text
specs/009-internal-buyer-intake/
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
tenet-0/
├── db/migrations/
│   └── 054_trevor_internal_intake.sql        # only if schema changes are needed
tenants/hermes-mitchel/
├── mcp-servers/trevor-db/
│   ├── src/
│   │   ├── index.ts                          # register intake tool
│   │   ├── intake.ts                         # intake orchestration
│   │   ├── db.ts                             # DB repository implementation
│   │   ├── types.ts                          # input/output types
│   │   └── safety.ts                         # shared redaction/bounds
│   └── tests/
│       ├── intake-create.test.ts
│       ├── intake-dedupe.test.ts
│       ├── intake-next-actions.test.ts
│       ├── intake-agiled.test.ts
│       └── intake-safety.test.ts
├── runbooks/internal-buyer-intake.md
└── skills/internal-buyer-intake/SKILL.md
```

**Structure Decision**: Extend the existing `trevor-db` MCP server because it is
the canonical local boundary for Trevor prospecting writes and already contains
the related dedupe, post-call, follow-up, and sourcing behavior. Add a tenant
skill and runbook so Trevor uses the new tool consistently and operators can
deploy/rollback it like prior Mitchel features.

## Complexity Tracking

No constitution violations identified.
