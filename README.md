# OvernightDesk

**Your business never sleeps.**

Existing-account internal business workspace for OvernightDesk and Timeless
Technology Solutions. It provides owner sign-in and recovery,
membership-scoped chat and dashboard access, named agent-runtime source, and
operator-facing administration. It has no public registration, pricing,
checkout, billing, or customer-runtime provisioning journey.

## Architecture

OvernightDesk is a multi-repo platform deployed on aegis-prod:

| Repo | Language | Purpose | Status |
|------|----------|---------|--------|
| **overnightdesk** (this repo) | TypeScript/Next.js | Vercel workspace shell, auth, memberships, dashboards, and named-runtime source | Active |
| [overnightdesk-engine](../overnightdesk-engine) | Go | Historical orchestrator plus isolated managed-variable service source | Orchestrator retired; isolated managed-variable service active |
| [overnightdesk-securityteam](../overnightdesk-securityteam) | TypeScript/Fastify | Message traffic security, outbound guards, approval support | Active |
| [overnightdesk-SecurityCouncil](../overnightdesk-SecurityCouncil) | Go | Platform security scanning and review | Active |
| [overnightdesk-communicationmodule](../overnightdesk-communicationmodule) | Go | gRPC notification bus for Telegram and Discord dispatch | Active |

## Current Product Boundary

The frontend serves one actively used owner account and leaves other existing
identities untouched. New identities cannot self-register, subscription state
does not authorize access, and self-service account deletion is unavailable.
Existing access is determined by current identity, role, and exact workspace
membership. The retained product is sign-in and password recovery plus the
chat, dashboard, settings, and administration needed for named Timeless
Technology Solutions and OvernightDesk workspaces.

Feature 040 removed the legacy signup, verification, pricing, checkout,
Stripe, subscription, setup-wizard, customer callback, lifecycle-control, and
account-deletion source. The zero-state Neon cleanup removed the empty
subscription table and enum types plus the unused instance wizard column while
preserving active identities, memberships, and instances. T044 deployed the
isolated Aegis managed-variable service, and T045 completed as a metadata-only
no-op because no obsolete provider or secret target was found. The owner
waived the proposed T046 observation period after a passing baseline sample.
T043 still requires owner-authenticated password-recovery, chat, and dashboard
smoke evidence before Feature 040 and Issue #215 can close.

## Current Agent Control-Surface Delivery

Production `main` at `99edf7d` includes Feature 022's unified agent control
surfaces from PR 85. Overview, Settings, and selected-agent Admin Configuration
share one exact membership-filtered agent context and consistent Identity,
Runtime, capability, and configuration structure. Variable name/logo
presentation and the selected-agent Open Chat and Advanced Dashboard actions
remain on Overview; Open Chat is intentionally not a permanent primary-
navigation tab. Titus Open WebUI is the accepted reference canary. Walter Open
WebUI now has its own container, volume, hostname, Phase boundary, OIDC client,
and canonical use-case/runtime bindings; controlled activation and membership
denial/restoration, chat/history persistence, and the complete session
lifecycle passed on 2026-07-22. Objective cross-surface health, provider,
canonical linkage, isolation, rollback, and owner dashboard-click checks also
pass. PRs 94-97 deployed the chat-dominant workspace, bounded owner-managed
persona logos, persona-named Open WebUI model presentation, Arena removal, and
the shared authorization repair. PR 127 repaired the production persona grants,
PR 128 enforced database-backed native-dashboard session revalidation, and PR
129 reconciled Walter's exact active platform-instance and runtime-scoped OIDC
bindings. Walter retains its independently linked native Hermes dashboard and
primary Codex OAuth provider. On 2026-07-24 the owner accepted Walter's
name/logo presentation, Arena absence, and composed Chat plus Advanced
Dashboard experience.

The legacy arbitrary credential-map endpoint is retired. Cataloged replacements
are write-only, role checked, and metadata audited. The reviewed engine source
isolates this managed-variable operation, and the T044 ARM64 Aegis deployment
now exposes only the qualified managed-variable and health boundaries; the old
provision/deprovision routes return 404. Frontend lifecycle callers are
removed and the T036 preflight found no in-flight lifecycle work. Only the
qualified Titus runtime/OpenRouter
tuple may be enabled through the server-only
`MANAGED_VARIABLE_TITUS_RUNTIME_BOUNDARY_ID`; Walter and all other catalog
combinations remain read-only. The governing contract is
[`specs/022-agent-control-surfaces/contracts/managed-variable-replacement.md`](specs/022-agent-control-surfaces/contracts/managed-variable-replacement.md),
and the frontend uses its typed, value-free endpoint without legacy
`writeSecrets` or separate restart calls. Feature 022 is complete.

Feature 023 now defines and prototypes that follow-up through one composable,
capability-driven selected-agent workspace. The initial interaction keeps
qualified chat embedded and launches the exact native Hermes dashboard in an
independent safe window or tab; the shared contract remains layout-neutral.
Agents with only one surface retain it with an explicit state for the other.
Walter's isolated chat deployment passed disabled installation, private
qualification, rollback rehearsal, controlled public activation, denial and
restoration, session lifecycle, history persistence, cross-surface health, and
final owner acceptance. Walter's primary Codex OAuth provider policy is
unchanged. Platform-standard PRs 44 and 45 are merged, and exact `90b46c1` is
synchronized on Aegis. OvernightDesk PR 130 merged at exact `bf4bad1`; its
Vercel production deployment is Ready and the public/Aegis health boundaries
passed. The
[Feature 023 task list](specs/023-composable-agent-workspace/tasks.md) is
complete at 44/44.

Feature 024 adds Titus's existing native Hermes dashboard as an independent
selected-agent capability without copying Walter policy or creating a
Titus-specific page branch. The protected
`titus-dashboard.overnightdesk.com` route uses the exact current canonical
use-case/runtime membership, active platform-instance and hostname selectors,
and one runtime-scoped public S256-PKCE OIDC client. Titus publishes no host
port, retains `hermes-titus-data`, and keeps Chat available independently.
Controlled non-member, suspension, expiry, logout, token expiry, revocation,
restart persistence, active rollback/restoration, owner-visible Titus-only
Kanban scope, and the production observation window passed on 2026-07-24. The
same membership-scoped capability path serves Overview, Chat, Settings, and
Admin, including authorized non-owner members, and fails closed on ambiguous or
drifted canonical selectors. The [Feature 024 task
list](specs/024-titus-dashboard-access/tasks.md) records its completed 57/57
closeout.

## Runtime Model

Current agent runtimes use Hermes and are divided by use case and primary-memory
boundary. A runtime may expose more than one persona; a person may be authorized
to more than one runtime. Shared knowledge access does not merge runtime-local
history.

| Runtime | Use case | Default persona | Primary memory |
|---------|----------|-----------------|----------------|
| `hermes-walter` | OvernightDesk/Aegis platform operations | Walter | Existing platform runtime volume (`hermes-agent-data`) |
| `hermes-titus` | Timeless Tech Solutions operations and collaboration | Titus | Titus runtime memory |
| `hermes-mitchel` | Mitchel business workflows | Trevor | Mitchel/Trevor runtime memory and business records |
| `hermes-rex` | Gary's personal tooling, off Aegis | Rex | Separate personal runtime memory |

The retained `hermes-agent` name is a rollback identity during the Walter
migration. References to the upstream Hermes Agent product or image keep the
upstream `hermes-agent` name.

Gary and Austin share the Titus business workspace through separate
authenticated accounts and exact Titus memberships. They do not share
credentials, sessions, recovery material, or access to unrelated runtimes.

## Production Management Boundary

Aegis hosts a small set of named, human-approved business workloads. It is not
a general customer container-hosting service. New runtime creation, retirement,
identity, secret, or authority changes require explicit owner approval and a
reviewed deployment and rollback procedure.

Feature 042's Buzz pilot is in Gate 0 planning and evidence collection only.
Its proposed ingress reuses the existing Nginx process on an explicitly
assigned secondary private listener address reached by an exact host-advertised Tailscale `/32`,
with separate byte-exact WebSocket and NIP-98 HTTPS URL contracts behind that
transport boundary. The bounded pilot accepts the current owner-controlled
tailnet-wide transport policy; Buzz membership separately admits the owner and
distinct Walter, Titus, and Mitchel/Trevor identities, one agent at a time
after a canary. Issue #249 reopened for planning on 2026-09-02; no Buzz
service, route, identity, secret, DNS record, or production state has been
created. Gate 0 has rejected the historical MinIO images and Garage v2.3.0;
[ADR-009](docs/decisions/009-buzz-object-store-qualification.md) keeps a
conformance-qualified object store mandatory and identifies RustFS only as the
next local candidate to evaluate. No storage backend has been selected or
deployed.

Future customer workloads and customer data planes normally belong in
separately approved infrastructure outside `aegis-prod`—for example a
customer- or engagement-specific Azure, Vultr, or other provider environment.
Provider selection follows the engagement's security, data, capacity,
contractual, recovery, and cost requirements.

New first-party services, agents, operational daemons, CLIs, and infrastructure
automation default to Go when practical. Browser UI and small changes inside an
established non-Go service stay in their existing stack unless a deliberate
migration is justified and approved.

The former platform orchestrator and Docker socket proxy are retired from
active deployment under
[`specs/028-orchestrator-retirement`](specs/028-orchestrator-retirement).
Legacy customer-lifecycle source and zero-state Neon schema are retired under
[`specs/040-legacy-lifecycle-retirement`](specs/040-legacy-lifecycle-retirement).
The remaining production closeout is explicit: complete the owner-authenticated
frontend acceptance and reconcile the final inventories before closing Feature
040. T044 deployed the isolated managed-variable service, T045 found no
obsolete provider/secret targets to mutate, and the owner waived the proposed
T046 observation period after a passing baseline sample.

## Tenant Workflow Source

Tenant-specific Hermes workflow source lives under `tenants/<tenant-id>/`.
These directories are repo-controlled deploy sources for tenant-local MCP
servers, skills, schedules, and runbooks that are synced into tenant runtimes on
`aegis-prod`.

Walter's default persona source is `tenants/hermes-walter/`. Mitchel's tenant is
`tenants/hermes-mitchel/`. It contains Trevor's prospecting
MCP server, tenant skills, operator runbooks, and Trevor database migrations
under `tenants/hermes-mitchel/mcp-servers/trevor-db/ops/migrations/`.

## Project Structure

```text
overnightdesk/
├── src/                              Next.js app, API routes, lib, db schema
├── drizzle/                          Generated app database migrations
├── tenants/
│   ├── hermes-walter/                 Walter platform-operations persona source
│   ├── hermes-titus/                  Titus/TTS runtime source
│   └── hermes-mitchel/                Mitchel/Trevor tenant workflow source
├── vercel.json                       Cron jobs config
├── .specify/                         Spec-kit specifications and roadmap
└── .env.example                      Required env vars
```

## Commands

```bash
npm install
npm run dev
npm test
npm run build
```

## Environment Variables

See `.env.example` for the full list. Key groups:

- `DATABASE_URL`, `DATABASE_TEST_URL`
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `ADMIN_EMAILS`
- `RESEND_API_KEY`, `EMAIL_FROM`
- `PROVISIONER_URL`, `PROVISIONER_SECRET` for the server-side managed-variable
  service boundary; they are not customer-hosting authority
- `MANAGED_VARIABLE_TITUS_RUNTIME_BOUNDARY_ID` (server-only; unset means read-only)
- `CRON_SECRET`, owner notification settings

Stripe, billing-enable, invite-list, wizard, and legacy customer-callback
variables are not part of the repository environment contract. T045's
production-side metadata reconciliation found no obsolete target; the active
managed-variable service credentials remain intentionally retained.

## Notes

Some application database fields still contain legacy column names such as
`claude_auth_status` and `claude_calls`. Those names are compatibility fields in
the app schema and should only be renamed through a deliberate database
migration.
