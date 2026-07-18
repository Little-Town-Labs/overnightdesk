# Implementation Plan: Hermes Dashboard OIDC SSO

**Branch**: `017-hermes-oidc-sso` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-hermes-oidc-sso/spec.md`

## Summary

Turn OvernightDesk's existing Better Auth installation into a narrowly scoped
self-hosted OIDC issuer for the native Hermes dashboard. Each instance receives
one server-provisioned public client with an exact callback, authorization code
flow with S256 PKCE, RS256 ID tokens, and no refresh-token scope. Authorization
is owner-only and fail-closed at the issuer, token, reverse-proxy, and tenant
lifecycle boundaries. The platform repo owns identity and client lifecycle; the
engine repo owns rendering and applying Hermes tenant configuration; the
platform-standard repo records the production contract and rollback.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 22; Go 1.24 for the Hermes provisioner

**Primary Dependencies**: Next.js 15.2, React 19, Better Auth 1.6.23,
`@better-auth/oauth-provider` 1.6.23, Drizzle ORM 0.39, Echo 4, yaml.v3

**Storage**: PostgreSQL/Neon for Better Auth clients, keys, tokens, consents,
instance linkage, and redacted audit events; tenant-local Hermes `config.yaml`
for the OIDC consumer configuration

**Testing**: Jest and ts-jest in `overnightdesk`; Go `testing` and testify in
`overnightdesk-engine`; contract, negative authorization, migration, build, and
canary qualification checks

**Target Platform**: Vercel-hosted Next.js issuer and Linux Docker tenant
containers behind nginx on `aegis-prod`

**Project Type**: Multi-repository web application plus host provisioner

**Performance Goals**: Healthy owner launch completes within 10 seconds;
authorization checks use indexed point lookups; revocation blocks new sessions
within one minute

**Constraints**: Owner-only; full upstream Hermes UI; independent 15-minute
Hermes tokens; no client secret; no dynamic registration; exact callback and
issuer; S256 only; RS256 only; no tokens or private keys in logs; canary before
broad rollout; production changes require the `aegis-ssh` workflow

**Scale/Scope**: One client per Hermes tenant, initially one owner per instance;
three repositories and one production standard; no team authorization or
general-purpose OAuth developer platform

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Gate | Pre-design | Post-design evidence |
|---|---|---|
| Customer and tenant isolation | Pass | Client-to-instance linkage, owner lookup, exact callback, and nginx host verification all fail closed. |
| Human control over high-impact operations | Pass | Client provisioning and activation are server/operator actions; no dynamic registration or customer client-management API is exposed. |
| Durable enforcement | Pass | Authorization is backed by PostgreSQL constraints and lifecycle state, not prompts or UI state. |
| Secret handling | Pass | Hermes uses a public client; private signing keys remain in Better Auth storage; protocol artifacts are redacted from evidence. |
| Test-first behavior changes | Pass | Tasks require a failing test checkpoint before each platform and provisioner implementation slice. |
| Source-driven implementation | Pass | Research uses official Hermes, Better Auth, OpenID Connect, OAuth security, and PKCE sources. |
| API and architecture documentation | Pass | Provider and provisioner contracts, a data model, quickstart, and ADR are required deliverables. |
| Production observability | Pass | Redacted event categories and canary verification are defined without token or customer-data capture. |
| Cross-repository ownership | Pass | Each change is made, committed, and reviewed in the repository that owns the runtime behavior. |
| Quality gateway | Pass | `code-review-and-quality` runs after all verification and blocks on Critical or Required findings. |

No constitution exceptions are required.

## Architecture and Flow

1. The platform creates or reuses a disabled-by-default per-instance OAuth
   client through Better Auth's server-only API.
2. The platform sends the non-secret issuer, client ID, callback, scopes, and
   public URL to the authenticated Hermes provisioner contract.
3. The provisioner validates the issuer and tenant URLs, atomically merges the
   `dashboard.oauth` configuration, removes insecure dashboard startup, and
   restarts or provisions the tenant.
4. After configuration succeeds, the platform marks the linkage active and
   enables launch at the tenant root.
5. Hermes starts authorization with code flow and S256 PKCE. Better Auth carries
   its signed OAuth query through the OvernightDesk sign-in page.
6. Before any code is issued, the provider resolves `client_id` from the signed
   request and verifies the linked instance, exact owner, running status,
   active linkage, callback, and scopes. It repeats the canonical owner and
   lifecycle check during ID-token creation.
7. Hermes verifies the RS256 token through issuer discovery and JWKS, then
   creates its own short-lived session. Nginx continues to require the matching
   OvernightDesk owner cookie for dashboard routes.
8. Suspension, cancellation, deletion, or deprovision disables the OIDC client
   before asynchronous infrastructure cleanup. Existing Hermes sessions expire
   independently; no new session can be minted.

## Project Structure

### Documentation (this feature)

```text
specs/017-hermes-oidc-sso/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── oidc-provider.md
│   └── hermes-provisioner.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repositories)

```text
overnightdesk/
├── drizzle/                         # generated PostgreSQL migration
├── docs/decisions/                  # OIDC architecture decision
├── src/app/api/auth/                # Better Auth and well-known routing
├── src/app/(auth)/sign-in/           # signed OAuth continuation
├── src/app/(protected)/dashboard/    # launch and safe error state
├── src/db/schema.ts                  # OAuth/JWKS tables and instance link
└── src/lib/
    ├── auth.ts                       # JWT and OAuth provider plugins
    ├── auth-client.ts                # OAuth continuation client plugin
    ├── hermes-dashboard.ts           # root launch policy
    ├── hermes-oidc.ts                # authorization and lifecycle service
    └── provisioner.ts                # typed dashboard-auth contract

../overnightdesk-engine/
└── internal/hermes/
    ├── handlers.go                   # authenticated dashboard-auth endpoint
    ├── provisioner.go                # request validation and lifecycle
    ├── dashboard_oidc.go             # atomic YAML merge
    └── *_test.go                     # contract and abuse-case tests

../overnightdesk-platform-standard/
├── WHAT/hermes.yaml                  # live auth contract
└── HOW/tenant-provisioning.md         # canary, rollback, and lifecycle runbook
```

**Structure Decision**: `overnightdesk` remains the identity and product
integration owner. `overnightdesk-engine` is the existing Hermes provisioner
owner and consumes only a documented non-secret contract.
`overnightdesk-platform-standard` changes only when the implementation is ready
for production qualification. No feature code is placed in `overnightdesk-ops`.

## Delivery Phases

### Phase A — Provider foundation

- Upgrade Better Auth to the patched 1.6.23 line and add the supported OAuth
  provider package.
- Add provider/JWKS schemas and migration, with the instance-to-client unique
  linkage and lifecycle state.
- Publish issuer metadata at the path Hermes expects and preserve signed OAuth
  state through email/password sign-in.

### Phase B — Authorization and lifecycle

- Add the pre-code and token-time canonical owner checks.
- Add idempotent ensure, activate, disable, and revoke services and redacted
  events.
- Wire provisioning, cancellation, deletion, and launch behavior without
  broadening the browser API-key surface.

### Phase C — Hermes consumer configuration

- Extend the provisioner request contract and add an authenticated reconfigure
  endpoint for existing tenants.
- Atomically merge self-hosted OIDC settings into `config.yaml`, remove
  `--insecure`, retain nginx owner verification, and keep tenant data volumes.

### Phase D — Qualification and rollout documentation

- Verify discovery, JWKS, callback, owner/non-owner behavior, expiry, restart,
  revocation, and rollback against an isolated canary.
- Record the production contract and deployment sequence only after local and
  preview verification pass. Broad rollout is a separate approved operation.

## Migration and Rollback

- Database migration is additive: OAuth/JWKS tables plus nullable instance
  linkage and status columns. Existing tenants remain on the prior protected
  path while linkage is null or not active.
- The Better Auth dependency upgrade lands with the schema and full existing
  auth suite; no OIDC client is created merely by deploying code.
- Canary activation order is issuer -> client -> tenant config -> discovery and
  callback verification -> active linkage -> root launch.
- Rollback order is disable client -> restore prior protected Hermes dashboard
  auth -> restart only the canary -> clear active linkage. Never remove or
  recreate tenant data volumes.

## Quality Gateway

The feature is not ready to merge until the `code-review-and-quality` skill has
reviewed correctness, readability, architecture, security, performance, and
test/build evidence. The gateway requires:

- no unresolved Critical or Required findings;
- targeted tests observed failing before implementation and then passing;
- full Jest and Go test suites, TypeScript type checking, production Next.js
  build, Go build, migration generation/inspection, and diff checks passing;
- explicit negative tests for non-owner, wrong client, wrong callback, missing
  PKCE, disabled registration, replay/expiry, malformed provisioner payload,
  and secret/log leakage;
- source citations and ADR/runbook consistency reviewed against implementation.

## Complexity Tracking

No constitution violations require justification.
