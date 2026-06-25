# Implementation Plan: Mitchel Prospecting Dashboard in OvernightDesk

**Branch**: `010-mitchel-prospecting-dashboard` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-mitchel-prospecting-dashboard/spec.md`

## Summary

Add an authenticated, tenant-gated Mitchel prospecting workspace inside the
existing OvernightDesk dashboard. The first implementation is read/review-first:
Mitchel can see Trevor-only prospects, staged candidates, call tasks,
review-needed items, and follow-up drafts while keeping the existing Hermes chat
and dashboard link. The platform must not receive Trevor database credentials or
expose Hermes dashboard plugin routes directly; data should come through a
narrow authenticated interface that preserves Trevor Postgres as the prospecting
source of truth. Prefer documented, stock Hermes Agent surfaces and adapt
OvernightDesk/Trevor around them rather than patching Hermes internals.

## Technical Context

**Language/Version**: TypeScript with Next.js App Router in the OvernightDesk
frontend; TypeScript/Node.js for existing `trevor-db` MCP server contracts if a
tenant-local read surface is required

**Primary Dependencies**: Existing Better Auth session handling, existing
dashboard/instance resolver, existing engine chat/dashboard integration, Zod for
route response validation, documented Hermes Agent API/dashboard/Kanban
extension points where they fit, existing Trevor MCP contracts from Features 8
and 9

**Storage**: No new platform storage in the first slice. Trevor prospecting
records remain in the `trevor` schema hosted by `tenet0-postgres`; Agiled
remains CRM. The platform may display bounded summaries but must not store
Trevor business records as a shadow source of truth.

**Testing**: Existing OvernightDesk test/build scripts for dashboard/API route
changes; focused tests for tenant gate, response mapping, empty/error states,
and no-outbound/no-mutation guarantees. Existing Trevor MCP tests remain under
`tenants/hermes-mitchel/mcp-servers/trevor-db` for tenant-local contract changes.

**Target Platform**: Vercel-hosted OvernightDesk frontend talking to
`aegis-prod/hermes-mitchel` through existing authenticated tenant boundaries.

**Project Type**: Brownfield authenticated web dashboard with a narrow
server-side data boundary to a tenant-local prospecting workflow.

**Performance Goals**: Workspace should render the initial summary in under 2s
for normal tenant data volumes and bound each queue to a small review-focused
list. Failure in one queue should not blank the whole workspace.

**Constraints**: Prospect data is sensitive tenant business data; scraped and
pasted notes are untrusted display text; no automatic outbound sends; no
platform-held `TREVOR_DB_URL`; no direct public exposure of Hermes plugin
routes; explicit `hermes-mitchel` tenant gate required; avoid custom Hermes
forks or private internals unless no documented surface can satisfy the need.

**Scale/Scope**: Single Mitchel tenant, dozens to hundreds of prospects, first
release focused on operator visibility and review. Public landing page and buyer
form are Feature 11.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Customer/tenant data is sacred**: PASS. Trevor prospect data remains in the
  tenant-owned Trevor boundary; the platform displays bounded summaries and does
  not copy prospect data into platform tables.
- **Security and validation**: PASS. The plan requires authenticated session
  checks, explicit tenant authorization, validated responses, escaped display of
  untrusted notes, and generic errors.
- **Ops agent acts; owner/user decides**: PASS. The first slice is read/review
  focused. Any future write action must be a visible human decision with tests
  proving no outbound send.
- **Simple over clever**: PASS. Extend the existing dashboard and reuse existing
  chat/dashboard paths rather than adding a separate application. Prefer stock
  Hermes Agent features before adding custom platform behavior.
- **Platform quality drives retention**: PASS. The workspace requires clear
  loading, empty, unavailable, and partial-failure states.
- **Frontend never accesses tenant internals directly**: PASS with constraint.
  The platform must not receive Trevor DB credentials or query tenant storage
  directly; any data access must go through a narrow tenant-local API/workflow
  boundary. If Hermes can provide the boundary through documented configuration
  or extension points, use that before custom code.

## Project Structure

### Documentation (this feature)

```text
specs/010-mitchel-prospecting-dashboard/
├── checklists/requirements.md
├── contracts/dashboard-api.yaml
├── data-model.md
├── plan.md
├── quickstart.md
├── research.md
├── spec.md
└── tasks.md                         # Created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (protected)/dashboard/
│   │   ├── page.tsx                  # Tenant-gated Mitchel workspace entry
│   │   └── mitchel-prospecting/       # Workspace components if separated
│   └── api/
│       └── mitchel/
│           └── prospecting/
│               └── summary/route.ts  # Narrow authenticated read endpoint
├── components/
│   └── dashboard/
│       └── mitchel-prospecting/       # Presentation components
└── lib/
    ├── instance.ts                    # Existing instance/tenant helpers
    ├── resolve-instance.ts            # Existing auth + instance resolver
    └── mitchel-prospecting/           # Mapping/client boundary helpers

tenants/hermes-mitchel/
└── mcp-servers/trevor-db/             # Source of Trevor contract changes only
```

**Structure Decision**: Keep the user-facing surface in the existing
OvernightDesk dashboard because that is where Mitchel already logs in and where
Hermes chat/dashboard access already exists. Keep Trevor data access behind a
server-side, tenant-gated boundary and do not move Trevor database access into
platform routes. Treat Hermes Agent as a stock dependency: configure and
integrate with documented Hermes APIs/plugins where possible, and keep
Mitchel-specific logic in OvernightDesk or the tenant-local Trevor boundary.

## Complexity Tracking

No constitution violations identified.
