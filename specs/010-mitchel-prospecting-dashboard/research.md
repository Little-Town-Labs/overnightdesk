# Research: Mitchel Prospecting Dashboard in OvernightDesk

## Decision: Prefer Plain-Vanilla Hermes Agent Features

**Decision**: Use documented Hermes Agent features, configuration, APIs,
dashboard extension points, and Kanban surfaces wherever they satisfy the
feature need. Avoid custom Hermes patches, private Python internals, or
platform assumptions that would make future Hermes upgrades fragile.

**Rationale**: The user wants future Hermes upgrades to remain smooth. Keeping
Mitchel-specific behavior in OvernightDesk and the tenant-local Trevor boundary
lets Hermes remain a replaceable/upgradeable dependency while still supporting
Mitchel's workflow.

**Alternatives considered**:

- Patch Hermes dashboard/plugin internals for a custom Mitchel screen. Rejected
  because it increases upgrade friction.
- Query private Hermes files or SQLite state directly from OvernightDesk.
  Rejected because it couples the platform to Hermes internals and can bypass
  documented auth and tenant boundaries.

## Decision: Make Feature 10 Read/Review-First

**Decision**: The first dashboard slice lists Trevor prospecting work and
review queues, but does not promote candidates, create call tasks, approve
drafts, or send outbound messages.

**Rationale**: This provides immediate value while preserving the human approval
boundary for prospect data and outreach. The existing Trevor MCP tools already
support candidate review, call queues, intake, and follow-up drafts; the first
dashboard can expose the state without adding new mutation risk.

**Alternatives considered**:

- Include candidate promotion immediately. Rejected for the first slice because
  it needs stricter audit, confirmation, and no-outbound tests.
- Build only a chat shortcut. Rejected because the user specifically wants
  Mitchel to see and interact with prospect data without asking Trevor for every
  status update.

## Decision: Use an Explicit `hermes-mitchel` Tenant Gate

**Decision**: The workspace is shown only when the authenticated user's active
tenant/instance is explicitly `hermes-mitchel`.

**Rationale**: Existing dashboard logic has broad Hermes tenant behavior, but
this feature displays Mitchel-specific business data. A broad Hermes check risks
showing a tenant-specific workspace to future Hermes tenants.

**Alternatives considered**:

- Gate on all Hermes tenants. Rejected because prospect data and workflows are
  tenant-specific.
- Gate on user email only. Rejected because tenant instance identity is the
  durable authorization boundary for dashboard data.

## Decision: Do Not Put Trevor Database Credentials in OvernightDesk

**Decision**: Platform routes must not receive or store `TREVOR_DB_URL`; the
dashboard should consume bounded summaries from a tenant-local workflow/API
boundary.

**Rationale**: The platform constitution says tenant data should not be queried
directly by the frontend. Keeping the data access boundary tenant-local avoids
turning OvernightDesk into a shadow CRM or broad data plane.

**Alternatives considered**:

- Direct platform Postgres connection to `trevor`. Rejected because it expands
  platform secret scope and bypasses the tenant-local Trevor boundary.
- Copy records into platform tables. Rejected because it creates a second source
  of truth and data retention ambiguity.

## Decision: Treat Hermes API Server as Chat/Capability Surface, Not Trevor CRUD

**Decision**: The Hermes OpenAI-compatible API is useful for chat, runs,
sessions, capabilities, skills, and toolset discovery, but Feature 10 should not
assume it provides Trevor dashboard CRUD. If the live tenant enables the API
server with standard Hermes configuration later, OvernightDesk should use the
documented `/v1/capabilities`, sessions, runs, and skills/toolsets surfaces
before introducing custom transport.

**Rationale**: Hermes docs describe `/v1/chat/completions`, `/v1/responses`,
`/v1/capabilities`, runs, jobs, sessions, skills, and toolsets as authenticated
agent surfaces. The live `hermes-mitchel` check on Aegis also showed port 8642
was not listening inside the container during planning, so the dashboard cannot
depend on that API without separate enablement.

**Alternatives considered**:

- Use Hermes `/v1/responses` to ask Trevor for dashboard data. Rejected for v1
  because it would make deterministic dashboard rendering depend on an agent
  turn rather than a stable data contract.

Sources:

- Hermes API Server docs:
  https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- Aegis read-only check on 2026-06-25: `hermes-mitchel` returned connection
  refused for `http://127.0.0.1:8642/health` from inside the container.

## Decision: Do Not Expose Hermes Kanban Plugin Routes Directly

**Decision**: Any Kanban or process view must be proxied through OvernightDesk
auth and mapped back to Trevor durable records. The first slice may skip Kanban
if the live route shape is not needed. If Kanban is used, use the documented
Hermes dashboard/plugin behavior as-is behind an OvernightDesk tenant/auth
wrapper rather than modifying Hermes plugin code.

**Rationale**: Hermes Kanban is backed by local SQLite and dashboard plugin
routes. Documentation describes plugin routes under `/api/plugins/kanban/`, and
the live Aegis probe returned `401 Unauthorized` for a Kanban plugin endpoint.
Both facts support treating Kanban as a protected internal surface, not a public
platform API.

**Alternatives considered**:

- Embed or link directly to Kanban plugin routes as the dashboard data source.
  Rejected because it would couple the platform to dashboard plugin auth and
  could bypass OvernightDesk tenant authorization.
- Make Kanban the source of truth. Rejected because Trevor Postgres already
  owns prospects, candidates, tasks, interactions, and drafts.

Sources:

- Hermes Kanban docs:
  https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban
- Aegis read-only check on 2026-06-25:
  `http://127.0.0.1:9119/api/plugins/kanban/boards` returned `401 Unauthorized`.

## Decision: Dashboard API Returns Bounded Queue Summaries

**Decision**: Define one dashboard-facing summary contract for the first slice:
candidate review counts/items, prospect summaries, today's call tasks,
review-needed items, follow-up drafts, source metadata, and per-section status.

**Rationale**: A single bounded response keeps the page simple and supports
partial failure states. It also avoids leaking full records or raw transcripts
into the platform UI.

**Alternatives considered**:

- Separate endpoint per queue. Deferred until usage shows the summary response
  is too large or sections need independent polling.
- Stream via agent run events. Rejected for the initial dashboard because the
  user needs deterministic status, not a conversational transcript.
- Patch Hermes to add custom Trevor JSON endpoints. Rejected because the
  preferred upgrade path is stock Hermes plus tenant-local Trevor/OvernightDesk
  adaptation.

## Current Code Comparison: OvernightDesk Dashboard

**Observed current structure**:

- The running Hermes overview is implemented in
  `src/app/(protected)/dashboard/page.tsx`.
- Hermes chat is embedded directly on `/dashboard`; `src/app/(protected)/dashboard/chat/page.tsx`
  redirects back to `/dashboard`.
- `src/lib/instance.ts` already defines `isHermesTenant()` based on
  `containerId` starting with `hermes-`.
- `src/app/(protected)/dashboard/dashboard-nav.tsx` hides most dashboard tabs
  for Hermes tenants via `HERMES_ALLOWED_TABS`.
- Hermes session reads already go through `provisionerClient.getSessions()` in
  `src/lib/provisioner.ts`, using the container id rather than direct browser
  or database access.
- Jest is rooted at `src`, so platform tests for this feature should live under
  `src/**/__tests__`.

**Implementation impact**:

- Add `isHermesMitchelTenant()` beside the existing `isHermesTenant()` helper
  instead of creating a disconnected tenant gate.
- Preserve the existing overview-first Hermes layout and embedded chat. Do not
  create a separate Mitchel chat page.
- Use the existing server-side provisioner/container boundary as the preferred
  place to add a narrow Trevor summary read if stock Hermes does not already
  expose the needed deterministic data.
- Be careful with any new nav entry: Hermes tenants currently see only the
  allowed Overview/Settings/Admin tabs, so the MVP should integrate the Mitchel
  workspace into Overview unless a separate nav decision is made.

## Decision: Treat Live Trevor Summary as Cross-Repo Provisioner Work

**Decision**: Implementing live Trevor dashboard data should be planned as a
small `overnightdesk-engine` hermes provisioner extension, not as direct
OvernightDesk database access.

**Rationale**: The current frontend already reads Hermes sessions through
`provisionerClient.getSessions(containerId)`, and the matching provisioner
source lives in `overnightdesk-engine/internal/hermes/handlers.go`. That route
uses authenticated provisioner access and Docker/container context. A matching
read-only Trevor summary endpoint keeps platform code thin and avoids placing
Trevor DB credentials in Vercel/Next.js.

**Alternatives considered**:

- Add `TREVOR_DB_URL` to the frontend environment. Rejected because it expands
  platform secret scope and violates the tenant data boundary.
- Query Hermes/Trevor through an LLM chat turn. Rejected because the dashboard
  needs deterministic structured data and stable empty/error states.
- Delay all frontend work until the provisioner route exists. Rejected because
  the frontend can safely ship a fail-closed unavailable state and typed
  contract first.

**Implementation evidence**:

- The provisioner route lives in `overnightdesk-engine/internal/hermes` as
  `GET /mitchel/prospecting/summary`, guarded by the existing bearer secret and
  an explicit `containerId=hermes-mitchel` allow-list.
- The Trevor-specific SQL and handler are isolated in
  `internal/hermes/trevor_summary.go` so the generic handler file remains route
  wiring and shared auth.
- A read-only Aegis check on 2026-06-25 executed the exact summary SQL against
  `tenet0-postgres` and returned bounded JSON with 25 prospects, 10 staged
  candidates, 1 review item, empty call tasks, empty follow-up drafts, and
  `outboundSent=false`.
