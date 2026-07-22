# Implementation Plan: Composable Agent Workspace

**Branch**: `agent/codex/feature-023-composable-workspace` | **Date**: 2026-07-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/023-composable-agent-workspace/spec.md`

## Summary

Extend the existing selected-agent capability contract into one composable
workspace that supports agents with chat only, dashboard only, both, or neither.
The initial prototype keeps the qualified Open WebUI chat embedded and exposes
the exact native Hermes dashboard as a safe independent-window link from the
same workspace. The page remains server-resolved and fail closed. A later,
separately gated slice installs and qualifies Walter Open WebUI without sharing
Titus resources or changing Walter's primary Codex OAuth provider path.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Node.js 22; shell/Compose and existing TypeScript qualification tooling for the later Walter deployment

**Primary Dependencies**: Next.js 15.5.18 App Router, Better Auth 1.6.23, Drizzle ORM 0.45.2, Zod 3.24, Tailwind CSS 4, Jest 30, Playwright 1.61

**Storage**: Existing Neon membership/runtime/OIDC records; existing per-runtime Open WebUI persistent volumes on Aegis; no frontend schema change

**Testing**: Jest server-rendered component and pure-model tests, existing Chromium browser suite/fixture server, production build, public endpoint and authenticated owner checks

**Target Platform**: Vercel-hosted Next.js application plus Aegis-hosted Hermes dashboards and isolated Open WebUI deployments

**Project Type**: Existing full-stack web application with repository-owned Aegis deployment source

**Performance Goals**: One parallel server read for instances and the authorized agent directory; no extra client data fetch; no new always-loaded client bundle for the native-link prototype

**Constraints**: Fail closed; server-resolved HTTPS OvernightDesk hosts only; no agent-name branches; no cross-runtime session, data, OIDC, service-account, or provider reuse; responsive at 320/768/1024/1440px; Walter deployment disabled until qualified

**Scale/Scope**: Current owner/member population with 1-3 authorized agents; one shared workspace page and existing Overview capability actions; one later Walter Open WebUI deployment

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Customer data is sacred — PASS**: The frontend receives operational
  capability metadata only. Chat and dashboard contents remain in their owning
  runtimes and the platform does not persist conversations.
- **Security — PASS**: Membership, exact runtime-instance linkage, OIDC state,
  and URLs are resolved server-side. Invalid selectors fail closed. External
  windows use native safe-link semantics and preserve each surface's auth/CSP.
- **Owner decides — PASS**: The prototype does not deploy Walter or broaden
  authority. Walter activation remains a separate owner acceptance gate.
- **Simple over clever — PASS**: Existing `AgentCapability`, selected-agent
  context, server page, iframe, and native anchor patterns are extended; no new
  state or component library is introduced.
- **Honesty — PASS**: Chat-only, dashboard-only, absent, and unavailable states
  remain visible instead of hiding a missing capability.
- **Owner time — PASS**: One selected-agent workspace removes navigation
  bouncing while preserving established recovery paths.
- **Platform quality — PASS**: Responsive, keyboard, focus, blocked-window,
  lifecycle, and owner browser checks are explicit release gates.
- **Test-first — PASS**: Pure contract and rendered component regressions fail
  before the minimal implementation; browser coverage follows each increment.
- **Cross-repository/runtime consistency — PASS**: Walter qualification uses
  separate runtime-scoped resources and requires the platform standard update.

## Phase 0 Research Decisions

See [research.md](research.md). The initial composition uses embedded chat plus
a native independent-window dashboard link. This avoids claiming the Hermes
dashboard is frameable and preserves its clickjacking policy while retaining a
layout-neutral capability model.

## Phase 1 Design

### Shared workspace model

A pure `buildAgentWorkspaceComposition` function accepts the selected
`AgentDirectoryEntry` and the already-built `AgentCapability[]`. It returns a
discriminated result:

- `available`: identity plus independently modeled `open_chat` and
  `advanced_dashboard` surfaces;
- `unavailable`: canonical context could not be proven;
- an individual surface always retains its capability state and has a launch
  only when the shared builder supplied one.

The model does not know persona names. It validates invariants that should not
be spread through React: exactly one entry per supported capability, chat may
embed only the selected agent's canonical workspace URL, and dashboard launch
must remain an external HTTPS OvernightDesk URL.

### Server and client boundary

`/dashboard/chat` remains the stable selected-agent workspace route. Its Server
Component fetches the membership-filtered directory and member instances in
parallel, resolves the exact selected agent, builds dashboard linkage through
the existing Hermes helper, and passes only serializable safe capability data
to presentation. This follows the Next.js guidance that pages and database
access remain Server Components; no browser API is needed for a native
`target="_blank"` link. Sources:

- https://nextjs.org/docs/app/getting-started/server-and-client-components
- https://nextjs.org/docs/15/app/guides/data-security

### Interaction choice

The initial prototype keeps chat in its existing iframe and adds an Advanced
Dashboard action to the same identity header/workspace. The action is a normal
HTTPS anchor with `target="_blank"` and explicit `rel="noopener noreferrer"`.
This preserves a standard link when popup APIs are blocked and prevents opener
control. A new tab is the mobile equivalent. Sources:

- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/noopener
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors

The capability contract does not encode a permanent layout; a later qualified
split view may consume the same model if the target surface explicitly permits
framing.

### Selected-agent and absence behavior

- An explicit `agent` must match an active authorized directory entry.
- With no explicit selector, the workspace prefers the first authorized agent
  with chat, retaining current Open Chat default behavior.
- Dashboard-only agents render their identity, honest chat absence, and usable
  dashboard launch.
- Chat-only agents keep the current embedded chat and show dashboard state.
- Directory failure, conflicting linkage, malformed URL, or invalid selector
  reveals no launch URLs.
- The selector receives every authorized agent, not only chat-enabled agents,
  so one shared interface represents the full capability set.

### Walter isolated qualification

Walter Open WebUI will reuse the deployment pattern, not Titus's runtime
resources. It requires distinct deployment/container identity, persistent
volume, hostname, Better Auth OIDC client, resource bindings, Phase service
account/boundary, provider configuration, rollback target, and evidence. Codex
OAuth remains Walter's primary Hermes provider. Any OpenRouter credential is a
named supplemental/fallback input for the Open WebUI-to-Hermes chat boundary,
never an implicit primary-provider replacement.

The install order is: read-only preflight; install disabled; verify private
health and exact configuration; prove rollback; enable route/OIDC mapping;
repeat denial/restoration, persistence, session-lifecycle and chat canaries;
owner acceptance; standard/deploy-ledger closeout.

## Project Structure

### Documentation (this feature)

```text
specs/023-composable-agent-workspace/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── workspace-composition.md
│   └── walter-open-webui-qualification.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/(protected)/dashboard/
│   ├── page.tsx
│   ├── agent-capability-list.tsx
│   └── chat/
│       ├── page.tsx
│       ├── agent-workspace.tsx
│       └── __tests__/
└── lib/
    ├── agent-capabilities.ts
    ├── agent-workspace.ts
    ├── open-webui-workspace.ts
    └── selected-agent-context.ts

tests/browser/open-webui-auth-spike.spec.ts
infra/open-webui/walter/                 # Later isolated deployment slice
```

**Structure Decision**: Extend the existing App Router route and canonical
capability model. Do not add a parallel frontend, per-agent component, or new
runtime service for composition. Walter deployment source will be an isolated
sibling of the existing Titus source only when its qualification slice begins.

## Delivery Increments

1. **Contract and prototype**: create the pure composition contract and rendered
   shared workspace with chat/dashboard-only fixtures.
2. **Server integration**: resolve all authorized agents and exact linked
   instance data on `/dashboard/chat`, preserving explicit-selector failure and
   current default-chat behavior.
3. **Responsive/lifecycle qualification**: browser coverage for desktop,
   mobile, keyboard, safe external launch, absence, and session transitions.
4. **Walter disabled install**: create distinct deployment source and qualify
   private health, persistence, credentials, provider policy, and rollback.
5. **Walter controlled activation**: enable only the Walter route/OIDC mapping,
   repeat the full denial/restoration and OAuth lifecycle matrix, obtain owner
   acceptance, and close documentation/evidence.

## Rollback

- The frontend prototype is additive and reverts to the existing chat-only page
  without database or runtime changes.
- The old `/dashboard/chat?agent=` URL remains valid throughout.
- Walter installs disabled and can be removed from routing/OIDC assignment
  without deleting its persistent volume or changing Titus.
- Walter rollback restores the prior native-dashboard-only capability state and
  preserves its Codex OAuth configuration.
- No rollback may reintroduce arbitrary hosts, shared service accounts, or
  agent-name interface branches.

## Complexity Tracking

No constitutional violations require justification.
