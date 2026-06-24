# Implementation Plan: Cadence Scheduler and Digest

**Branch**: `006-cadence-scheduler-digest` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-cadence-scheduler-digest/spec.md`

## Summary

Add an on-demand cadence digest workflow to the repo-controlled `trevor-db` MCP server for `hermes-mitchel`. The first deployable slice composes the existing daily call queue with new read-only stale-work and follow-up approval scans, returns a bounded digest response, documents an opt-in weekday scheduler path, and keeps scheduled execution disabled until manual production validation passes.

## Technical Context

**Language/Version**: TypeScript on Node.js 22 runtime in `hermes-mitchel`

**Primary Dependencies**: Existing `@modelcontextprotocol/sdk`, `pg`, and `zod` package used by `trevor-db`; no new runtime dependency planned

**Storage**: Existing `trevor.prospects`, `trevor.call_tasks`, `trevor.interactions`, and `trevor.followup_drafts`; no new table for the initial slice

**Testing**: Node test runner through `npm test` in `tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db`

**Target Platform**: `hermes-mitchel` tenant on `aegis-prod`, with local source under `tenet-0/tenant-workflows/hermes-mitchel`

**Project Type**: Tenant MCP server extension plus tenant skill and operator runbook

**Performance Goals**: Generate the current-production-scale digest in under 10 seconds with default limits

**Constraints**: On-demand digest first; no scheduler enabled by default; no outbound sends; no follow-up draft creation or approval; no full prospect notes, full draft bodies, secrets, or database URLs in output logs; do-not-contact records must not be presented as outreach recommendations

**Scale/Scope**: Single Mitchel tenant, current production scale of dozens of prospects and zero-to-hundreds of tasks/drafts; designed to remain bounded by configurable limits

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer Data Is Sacred**: PASS. Digest reads tenant Trevor data and returns bounded operational summaries only.
- **Security Is A Feature**: PASS. MCP inputs are validated with Zod, SQL stays parameterized, and logs must not expose secrets or raw notes.
- **Ops Agent Acts; Owner Decides**: PASS. The workflow recommends and summarizes; scheduler enablement is explicit and reversible.
- **Simple Over Clever**: PASS. Extend the existing `trevor-db` package and tenant skill model rather than adding a scheduler service in the first slice.
- **Honesty With Customers / Operators**: PASS. Digest responses indicate on-demand vs scheduled mode, warnings, and default no-write posture.

## Project Structure

### Documentation (this feature)

```text
specs/006-cadence-scheduler-digest/
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
│   │   ├── digest.ts
│   │   ├── queue.ts
│   │   ├── followup.ts
│   │   ├── db.ts
│   │   ├── index.ts
│   │   ├── safety.ts
│   │   └── types.ts
│   └── tests/
│       ├── digest-*.test.ts
│       ├── fixtures.ts
│       └── test-repo.ts
├── skills/cadence-digest/
│   └── SKILL.md
└── runbooks/cadence-scheduler.md
```

**Structure Decision**: Extend the existing `trevor-db` MCP package because it already owns call queue, post-call capture, and follow-up draft workflows over the Trevor schema. Add a separate `digest.ts` module so digest composition remains distinct from queue ranking and follow-up draft state transitions. Add tenant-facing skill guidance plus an operator runbook because scheduler enablement is an operational decision.

## Complexity Tracking

No constitution violations.
