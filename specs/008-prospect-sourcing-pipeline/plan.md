# Implementation Plan: Prospect Sourcing Pipeline

**Branch**: `008-prospect-sourcing-pipeline` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-prospect-sourcing-pipeline/spec.md`

## Summary

Productize the existing live Mitchel prospect-sourcing workflow by bringing the
BrowserAct and CamoFox skill instructions under repo control, adding a safe
candidate staging/review boundary to the Trevor DB MCP server, and integrating
approved candidates with existing Trevor prospect and call-queue behavior. The
workflow starts with BrowserAct for bulk discovery and template contact finding,
then uses CamoFox to enrich or verify BrowserAct candidates when deeper website
scraping is needed. The first deployable slice must be source-attributed,
deduped, approval-gated, and free of committed production secrets.

## Technical Context

**Language/Version**: TypeScript on Node.js for the existing
`trevor-db` MCP server; Markdown for tenant skills and runbooks

**Primary Dependencies**: Existing MCP SDK, `pg`, `zod`, existing BrowserAct
REST workflow documented as a skill, existing CamoFox native Hermes tool

**Storage**: Existing `tenet0-postgres` database, `trevor` schema; add staged
candidate storage only if existing tables cannot safely represent review-only
data

**Testing**: Existing Node test runner via `npm test` in
`tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db`

**Target Platform**: `aegis-prod/hermes-mitchel` tenant data volume and
`tenet0-postgres`

**Project Type**: Tenant-specific MCP server, skill docs, runbook, and schema
migration inside the `overnightdesk` repo

**Performance Goals**: Bounded list responses; process a 30-business sourcing
run and expose no more than 15 recommended candidates for immediate review

**Constraints**: No live credentials in source; no outbound sends; scraped
content is untrusted; BrowserAct API access must be env-backed; CamoFox is a
native Hermes tool, not an MCP server

**Scale/Scope**: Single Mitchel tenant, dozens to hundreds of prospects, staged
candidate batches from public business listings and enrichment workflows

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer Data Is Sacred**: PASS. Candidate data remains in Trevor Postgres
  or transient review output; no markdown prospect exports.
- **Human Approval for Outreach**: PASS. The feature promotes prospects and
  queue tasks only after explicit approval and never sends outbound messages.
- **Secrets Stay Out of Source**: PASS. BrowserAct and CamoFox credentials are
  referenced through environment variables only.
- **Production Reality First**: PASS. Plan is grounded in live Aegis evidence:
  BrowserAct/CamoFox skills, CamoFox container, previous Tysons scrape memory,
  and existing Trevor schema/tools. The documented order is BrowserAct
  discovery first, CamoFox enrichment second.
- **Test-First Imperative**: PASS. Tasks require failing tests before MCP
  behavior changes.

## Project Structure

### Documentation (this feature)

```text
specs/008-prospect-sourcing-pipeline/
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
│   └── 053_trevor_prospect_sourcing.sql
└── tenant-workflows/hermes-mitchel/
    ├── mcp-servers/trevor-db/
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── sourcing.ts
    │   │   ├── db.ts
    │   │   └── types.ts
    │   └── tests/
    │       ├── sourcing-candidates.test.ts
    │       ├── sourcing-review.test.ts
    │       ├── sourcing-promote.test.ts
    │       └── sourcing-safety.test.ts
    ├── runbooks/prospect-sourcing.md
    └── skills/
        ├── prospect-sourcing/SKILL.md
        └── web/
            ├── browseract/SKILL.md
            └── camofox-browser/SKILL.md
```

**Structure Decision**: Extend the existing `trevor-db` MCP server because it
already owns purpose-built Trevor prospect, queue, briefing, capture, follow-up,
digest, and sent-log tools. Source-control the existing live web-scraping skill
knowledge under `tenet-0/tenant-workflows/hermes-mitchel/skills` so production
tenant behavior can be reviewed and redeployed without copying secrets.

## Complexity Tracking

No constitution violations identified.
