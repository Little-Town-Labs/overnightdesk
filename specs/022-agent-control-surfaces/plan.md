# Implementation Plan: Agent Control Surfaces

**Branch**: `022-agent-control-surfaces` | **Date**: 2026-07-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/022-agent-control-surfaces/spec.md`

## Summary

Replace all first-instance and agent-specific dashboard decisions with one
server-resolved selected-agent context. Overview, Settings, and selected-agent
Admin content will share the same identity header, selector, Runtime panel, and
capability states. Account settings and fleet/metrics remain explicitly global.
The existing arbitrary credential map is replaced with a typed allowlisted
mutation contract. Full canonical Phase rotation remains disabled until the
Aegis provisioner has a separately reviewed boundary-aware endpoint that can
honor the selected runtime's exact Phase App, environment, and path.

## Implementation Checkpoint — 2026-07-22

The frontend P1-P4 increments shipped through PR 85 at production main commit
`1e44360`. The complete verification passed 80 Jest suites with 919 active
tests, the production Next.js build using the documented unreachable build-only
database URL, and the Chromium release suite. Focused route review also verifies
safe 503 mapping when canonical context or boundary authorities fail
unexpectedly. Public Vercel and read-only Aegis post-deployment checks passed.

The later engine and frontend increments completed the provisioner follow-up,
typed adoption, rollback proof, and production qualification. The owner
accepted the authenticated Overview, Settings, Admin, Open Chat, and
Titus/Walter Runtime experience on 2026-07-22, completing Feature 022. The
2026-07-22 production dependency audit reports two high
and one moderate finding;
the high finding is inherited from `sharp <0.35.0` through Next.js, whose
supported range does not yet admit the patched Sharp release. Do not use the
audit tool's suggested breaking Next.js downgrade as an automatic fix.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Node.js 22; a later provisioner increment uses Go in the sibling `overnightdesk-engine` repository

**Primary Dependencies**: Next.js 15.5.18 App Router, Better Auth 1.6.23, Drizzle ORM 0.45.2, Zod 3.24, Tailwind CSS 4

**Storage**: Existing Neon PostgreSQL canonical identity, membership, instance, secret-boundary, and platform audit tables; Phase remains the external value store

**Testing**: Jest 30 with `ts-jest`, existing Drizzle integration fixtures, Playwright 1.61 Chromium, `npm run build`, `npm audit`

**Target Platform**: Vercel-hosted Next.js application; Aegis-hosted provisioner and Hermes runtimes

**Project Type**: Existing full-stack web application with a separately owned production provisioner

**Performance Goals**: Resolve the directory and selected context in one bounded server render; avoid per-panel duplicate membership reads; preserve dashboard TTFB below the constitutional one-second goal under normal conditions

**Constraints**: Fail closed; no secret values in server-rendered props, responses, logs, or audit rows; no client-selected Phase coordinates; no first-instance fallback; desktop/mobile parity; no new runtime authority from presentation data

**Scale/Scope**: Current small fleet, 1-3 authorized agents per member, Overview plus Settings and Admin; hidden legacy tabs remain out of scope until migrated

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Customer data is sacred — PASS**: The selected context contains operational identity/capability metadata only. No conversation or secret value enters the platform database.
- **Security — PASS**: Zod validates every selector and mutation; membership and role are rechecked server-side; Phase coordinates are derived from canonical bindings; arbitrary maps are removed; audit failure denies mutation.
- **Owner decides — PASS**: High-impact variable replacements require explicit confirmation and no autonomous variable discovery or mutation is introduced.
- **Simple over clever — PASS**: One resolver, one presentation model, one variable catalog, and existing App Router patterns replace conditional per-agent UI.
- **Honesty — PASS**: Missing workspace, dashboard, instance link, or mutation support is rendered as explicit state instead of hidden or claimed healthy.
- **Owner time — PASS**: The design supports bounded self-service rotations while retaining strong recovery and audit signals.
- **Platform quality — PASS**: Shared components, responsive layouts, keyboard access, and clear empty/error/partial-success states are required.
- **Test-first — PASS**: Each behavior starts with a failing regression or contract test, then a minimal implementation and full verification.
- **Cross-repository consistency — PASS**: The frontend contract does not broaden the existing provisioner. The later provisioner change must be implemented and deployed in `overnightdesk-engine` with its own tests and standard update.

## Phase 0 Research Decisions

See [research.md](research.md). All technical unknowns are resolved for the
frontend increments. Canonical multi-App Phase writes are deliberately gated on
the later provisioner contract rather than guessed.

## Phase 1 Design

### Selected-agent resolution

`resolveAgentDirectory` remains the membership-filtered database boundary, but
its records gain runtime slug/state and membership role. A new pure selection
and presentation layer produces one discriminated `SelectedAgentContext`:

- `available`: exact selected directory entry, safe Runtime presentation,
  capabilities, exact optional platform instance, and allowed settings;
- `empty`: no active authorized agent;
- `unavailable`: canonical storage or record validation failed;
- invalid explicit selectors are handled as not found and never fall back.

The directory default remains deterministic only when no `agent` parameter was
provided. An explicit selector must match exactly one authorized entry. Exact
instance association uses `runtimeIdentityId`; `instances[0]` is prohibited on
agent-scoped paths.

### Shared presentation

`AgentContextHeader`, `AgentRuntimePanel`, and `AgentCapabilityList` are shared
by Overview and selected-agent Settings/Admin sections. Each capability always
has a state (`available`, `not_deployed`, `unavailable`, `not_applicable`).
Actions are rendered from capability data. No component branches on `titus`,
`walter`, tenant IDs, or array position.

### Page scope

- **Overview**: selector, shared identity header, Runtime panel, capability
  states, then available Open Chat and Advanced Dashboard actions.
- **Settings**: account-wide profile/password/deletion first; selected-agent
  context and configuration second. The same `?agent=` URL state is used.
- **Admin**: one protected layout and internal navigation for Fleet, Metrics,
  and Configuration. Fleet/Metrics are labeled global. Configuration is
  selected-agent scoped and uses the shared context.
- **Other tabs**: remain hidden for Hermes until a later task migrates each one
  off `getInstanceForUser` and proves the shared contract.

### Current caller inventory

- `dashboard/page.tsx` reads all member instances plus the canonical agent
  directory, but previously mixed exact identity selection with an
  `instances[0]` fallback.
- `dashboard/settings/page.tsx` calls `getInstanceForUser` and therefore cannot
  preserve a multi-agent selection.
- `dashboard/admin/fleet/page.tsx` and `dashboard/admin/metrics/page.tsx` are
  separate owner-only pages without a shared Admin scope/navigation contract.
- `api/settings/update-credential/route.ts` accepts a caller-provided secret
  map and forwards it through the legacy single-instance provisioner boundary.
- `db/open-webui-workspace-directory.ts` is the canonical membership-filtered
  directory source used to derive selected-agent context for every migrated
  surface.

### Managed-variable boundary

The browser sends only `agentKey`, a stable catalog `variableId`, a bounded new
value, and an exact confirmation token. The server maps the variable ID to an
allowlisted definition and the agent key to an active membership/runtime. It
then derives the exact Phase boundary from `secret_boundary_binding`.

The current provisioner contract cannot honor arbitrary canonical Phase Apps or
paths; it accepts `{tenantId, secrets}` and writes to one configured App at
`/{tenantId}`. Therefore:

1. this frontend branch removes arbitrary-map acceptance and locks supported
   legacy mutations to an exact instance plus approved catalog entry;
2. unsupported canonical boundaries render read-only/not-available;
3. a later `overnightdesk-engine` slice adds a server-authenticated endpoint
   that accepts a server-issued boundary identifier plus one approved key/value,
   resolves its local allowlist, passes the value only through stdin, and returns
   value-free outcome metadata;
4. only after that endpoint is deployed and qualified does the frontend enable
   canonical Phase replacement for Titus/Walter.

Phase's official API supports `POST`/`PUT` secret operations and service-account
tokens with role-derived permissions, but requires App server-side encryption.
The platform never exposes such a token to the browser and never uses a human
PAT. Sources: https://docs.phase.dev/public-api,
https://docs.phase.dev/public-api/secrets,
https://docs.phase.dev/access-control/service-accounts.

### Framework pattern

Pages/layouts remain Server Components; only selectors and forms use Client
Components. Route Handlers use Web Request/Response APIs, parse JSON through
Zod, and return the repository's `{success,data?,error?,meta?}` envelope.
Sources: https://nextjs.org/docs/app/getting-started/server-and-client-components
and https://nextjs.org/docs/15/app/api-reference/file-conventions/route.

## Project Structure

### Documentation (this feature)

```text
specs/022-agent-control-surfaces/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── selected-agent-context.md
│   └── managed-variable-replacement.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/(protected)/dashboard/
│   ├── page.tsx
│   ├── agent-overview.tsx
│   ├── agent-runtime-panel.tsx
│   ├── settings/
│   └── admin/
├── app/api/settings/update-credential/route.ts
├── db/open-webui-workspace-directory.ts
└── lib/
    ├── open-webui-workspace.ts
    ├── selected-agent-context.ts
    ├── managed-agent-variable.ts
    └── managed-agent-variable-audit.ts

tests/browser/open-webui-auth-spike.spec.ts
```

**Structure Decision**: Extend the existing single Next.js App Router project
and canonical directory rather than creating a parallel dashboard framework.
The sibling Go provisioner remains a separate repository and rollout gate.

## Delivery Increments

1. **P1 context and Runtime consistency**: extend canonical records, add shared
   selection/presentation contract, reproduce and fix Titus/Walter Runtime
   mismatch, and refactor Overview with no behavior expansion.
2. **P2 Settings scope redesign**: move Settings to the shared context, separate
   account-wide and agent-scoped panels, and remove first-instance selection.
3. **P3 Admin redesign**: unify global Admin navigation and selected-agent
   Configuration presentation with server-side admin gates.
4. **P4 credential hardening**: contract-test and replace arbitrary secret maps,
   add the allowlisted catalog/audit adapter, and make unsupported canonical
   boundaries explicitly read-only.
5. **Separate provisioner follow-up**: design, test, deploy, and qualify a
   boundary-aware Phase write endpoint before enabling canonical replacements.

## Rollback

- Each UI increment is independently revertible and contains no schema change.
- The canonical directory remains additive; reverting presentation restores the
  prior Overview without changing identity or membership data.
- The credential hardening may be reverted only to the last allowlisted
  contract, never to arbitrary client-supplied secret maps.
- A future Phase endpoint rolls back by disabling the catalog entry/front-end
  capability; it does not delete secret versions, bindings, or runtime data.

## Complexity Tracking

No constitutional violations require justification.
