# Implementation Plan: Titus Advanced Dashboard Access

**Branch**: `agent/codex/feature-024-titus-dashboard-access` | **Date**: 2026-07-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/024-titus-dashboard-access/spec.md`

## Summary

Expose Titus's existing native Hermes dashboard at the dedicated protected host
`titus-dashboard.overnightdesk.com`. Reuse the established public-client OIDC
lifecycle and selected-agent capability renderer, while making both the Nginx
verification boundary and Hermes authorization boundary resolve the exact
canonical use-case/runtime membership instead of assuming one instance per
user. A guarded dashboard-instance reconciliation links the existing Titus
runtime to the canonical records. The runtime binds dashboard port 9119 only
inside the private Docker network, never publishes it on the host, and never
uses Hermes's insecure mode. Production acceptance and normal availability
remain blocked until RED/GREEN tests, a temporary owner-directed protected
qualification, exact denial/restoration, persistence, and rollback proof pass.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Node.js 22; Bash for repository-owned Aegis deployment and qualification

**Primary Dependencies**: Next.js 15.5.18 App Router, Better Auth 1.6.23 with OAuth Provider, Drizzle ORM 0.45.2, Zod 3.24, Hermes Agent 0.18.0-coder runtime, Nginx, Docker Compose, Jest 30.4.2, Playwright 1.61.1

**Storage**: Existing Neon `instance`, canonical use-case/runtime/membership/resource-binding, OAuth-client, and audit records; existing `hermes-titus-data` Docker volume; no new schema

**Testing**: Jest pure authorization, route, reconciliation, filesystem-contract, and server-rendered component tests; shell qualification; Next production build; Aegis private/public checks; authenticated owner browser acceptance

**Target Platform**: Vercel-hosted Next.js authorization and selected-agent UI plus Aegis-hosted Nginx and `hermes-titus` native dashboard

**Project Type**: Existing full-stack web application with repository-owned production runtime and proxy configuration

**Performance Goals**: One exact-host dashboard authorization query per Nginx subrequest; selected-agent pages retain the existing parallel directory/instance reads; dashboard launch completes in no more than two owner actions

**Constraints**: Fail closed; exact active use-case/runtime membership; no agent-name UI branch; no arbitrary host; no `--insecure`; no published Titus port; public PKCE client without a client secret or refresh token; value-free evidence; Titus Chat and Walter remain independently available; responsive at 320/768/1024/1440px

**Scale/Scope**: One existing Titus native dashboard, one dedicated host and certificate, one canonical dashboard-instance projection, the shared verifier/OIDC authority path, and the four existing selected-agent surfaces

## Constitution Check

_GATE: Passed before research and re-checked after design._

- **Customer data is sacred — PASS**: The platform stores assignment and
  lifecycle metadata only. Dashboard and chat contents remain in their retained
  runtime volumes; rollback does not delete either volume.
- **Security — PASS**: The browser receives only the server-resolved HTTPS
  destination. Nginx rechecks exact host and current canonical membership on
  every protected request, while Hermes maintains its own public-client OIDC
  session. The runtime uses no insecure mode or published host port.
- **Owner decides — PASS**: Route, client, and capability activation are
  independently gated and require explicit production qualification and owner
  acceptance.
- **Simple over clever — PASS**: The design reuses the existing instance/OIDC
  lifecycle, exact-runtime selected-agent resolver, capability renderer, Titus
  volume, and established Nginx pattern. No new service or UI component is
  introduced.
- **Honesty — PASS**: Advanced Dashboard remains not deployed or unavailable
  until the canonical assignment and active OIDC route both verify.
- **Owner time — PASS**: A single platform login reaches both independent Titus
  surfaces, and the repository carries repeatable activation and rollback.
- **Platform quality — PASS**: Direct access, narrow viewports, keyboard launch,
  error state, persistence, lifecycle, and browser acceptance are release gates.
- **Test-first — PASS**: Authorization, reconciliation, runtime configuration,
  and capability tests must be observed RED before implementation and GREEN
  before any production change.
- **Cross-repository/runtime consistency — PASS**: The platform standard and
  deploy ledger closeout are required, and Walter remains on the shared
  canonical authorization behavior with its existing hostname and resources.
- **Secrets — PASS**: The OIDC client is public and has no client secret.
  Existing runtime secrets remain Phase-injected; no secret enters arguments,
  source, database details, logs, or evidence.

## Phase 0 Research Decisions

See [research.md](research.md). The chosen boundary is a dedicated Titus host
with native self-hosted OIDC plus Nginx current-authority verification. A
canonical dashboard-instance projection reuses the established lifecycle
without creating another runtime, data volume, or provider path. Canonically
linked dashboards use the same use-case membership authorizer for every agent;
legacy unlinked tenants retain their current owner fallback until migrated.

## Phase 1 Design

### Canonical dashboard assignment

Add Titus hostname and platform-instance resource bindings as data in the
existing identity template. A pure reconciliation planner consumes the exact
Titus template, the unique current owner, existing assignment rows, and a fixed
dashboard descriptor. It may plan exactly one additive `instance` projection:

- tenant ID `titus-dashboard`;
- subdomain `titus-dashboard.overnightdesk.com`;
- container `hermes-titus`;
- status `running` only after private runtime health is proven;
- an application-generated UUID inserted explicitly because the raw SQL path
  cannot use Drizzle's TypeScript-only ID default;
- exact Titus use-case and runtime identity IDs;
- no engine API key, Phase token, dashboard bearer token, or new volume.

The projection exists to reuse the established Hermes dashboard/OIDC lifecycle;
it does not represent a second agent runtime. Apply requires an explicit
confirmation sentinel, writes one value-free audit record, is idempotent, and
refuses ambiguity or conflicting state.

### Shared current-authority boundary

Replace the `verify-tenant` route's first-instance lookup with a store that
resolves exactly one running dashboard instance by normalized
`X-Original-Host`. If that instance has canonical use-case/runtime linkage, the
existing membership authorizer decides current access for the signed-in user.
Only active, unexpired, unsuspended, unrevoked membership for the exact runtime
passes. An unlinked legacy instance retains the exact legacy owner check.

The Hermes OIDC authorization and token callbacks consume the same distinction:
canonically linked instance means canonical membership; unlinked instance means
legacy owner. Walter's feature-flagged migration behavior remains compatible,
but no new Titus/Walter branch is introduced. Both the proxy subrequest and the
token boundary deny unavailable or ambiguous authority with value-free errors.

This follows the Next.js 15 guidance to perform secure authorization from
server-side data and return only minimal safe results:
https://nextjs.org/docs/15/app/guides/data-security

### Native dashboard configuration

Titus changes from loopback binding to `0.0.0.0:9119` only after a valid
self-hosted OIDC configuration is staged. The existing private Docker network
allows Nginx to reach the service, while `run-container.sh` continues to publish
no ports and retains all hardening. The command never uses `--insecure`.

The guarded deploy action writes only the dashboard public URL, issuer, public
client ID, and exact scopes into the retained configuration using an atomic
same-directory replacement, restarts only `hermes-titus`, then proves the
dashboard advertises the self-hosted provider. Hermes documents that a
non-loopback dashboard must have an auth provider and refuses to start when the
gate is not configured:
https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard

### Protected route

Add a repository-owned Nginx server for
`titus-dashboard.overnightdesk.com`. The route:

- obtains and renews its own certificate;
- sends a bodyless internal auth subrequest to the canonical platform host;
- forwards the browser cookie and exact original host;
- treats only a 2xx verifier result as authorized;
- forwards `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and WebSocket
  headers to Hermes;
- protects the callback, status, API, and dashboard paths uniformly;
- redirects unauthenticated browsers to the platform sign-in flow without
  exposing upstream content.

Nginx's official `auth_request` contract treats 2xx as allow, 401/403 as deny,
and other results as errors:
https://nginx.org/en/docs/http/ngx_http_auth_request_module.html

### OIDC lifecycle and platform capability

Reuse the existing server-owned Better Auth public client contract: one exact
callback, authorization code, S256 PKCE, `openid profile email`, no secret,
and no offline access. The client starts disabled, the Titus runtime is
configured and privately verified, then the client and canonical capability
enter a temporary owner-directed protected qualification. The OIDC client is
also recorded as an exact runtime-scoped resource binding. Normal production
availability is not accepted until the denial, lifecycle, persistence, and
rollback gates pass. Better Auth documents that public clients use
`token_endpoint_auth_method: none` and that PKCE is mandatory for public
authorization-code clients:
https://better-auth.com/docs/plugins/oauth-provider

No new frontend rendering is required. Once the exact Titus projection is
active, Overview, Chat, Settings, and Admin already resolve it by
`runtimeIdentityId` and feed the same `advanced_dashboard` descriptor to the
shared capability components.

## Project Structure

### Documentation (this feature)

```text
specs/024-titus-dashboard-access/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── dashboard-assignment.md
│   ├── dashboard-authorization.md
│   └── titus-dashboard-deployment.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/api/auth/verify-tenant/
│   ├── route.ts
│   └── __tests__/route.test.ts
├── db/
│   ├── dashboard-authorization-store.ts
│   ├── dashboard-instance-reconciliation-store.ts
│   └── dashboard-oidc-binding-store.ts
└── lib/
    ├── dashboard-authorization.ts
    ├── dashboard-instance-reconciliation.ts
    ├── hermes-oidc.ts
    ├── use-case-identity-templates.ts
    └── __tests__/

scripts/dashboard-instance-reconciliation.ts

infra/nginx/titus-hermes.conf
infra/nginx/titus-hermes-http.conf

tenants/hermes-titus/
├── runtime/
│   ├── start-all.sh
│   └── prepare-volume.sh
├── scripts/
│   ├── deploy-aegis.sh
│   └── qualify.sh
└── README.md

tests/browser/open-webui-auth-spike.spec.ts
```

**Structure Decision**: Extend the existing shared authorization, canonical
identity, OIDC, selected-agent, and Titus deployment boundaries. The only
Titus-specific elements are declarative assignment values and repository-owned
deployment files; authorization and interface behavior remain agent agnostic.

## Delivery Increments

1. **Canonical contracts RED/GREEN**: add failing tests for exact-host
   verification, canonical membership lifecycle, legacy compatibility, guarded
   idempotent projection, and shared capability visibility; implement the
   minimal shared boundaries.
2. **Disabled Titus runtime candidate**: add the Nginx and Titus runtime source,
   bind only after valid OIDC configuration, and qualify private networking,
   hardening, no published ports, persistence, and exact restart behavior.
3. **Canonical production assignment**: use the separate guarded additive
   reconciler to add only the missing repository-declared dashboard
   platform-instance and hostname bindings to the existing Titus foundation,
   then reconcile the additive Titus dashboard projection and create its public
   client plus exact runtime-scoped client binding in disabled/pending state
   with value-free plan, apply, verify, and rollback evidence.
4. **Controlled route qualification**: temporarily activate DNS/TLS, the OIDC
   client, and the protected route for owner-directed checks, then repeat
   anonymous, non-member, suspended, expired, logout, session-expiry,
   revocation, restoration, direct-route, persistence, and rollback checks.
   This state is not production acceptance.
5. **Owner acceptance and closeout**: confirm Titus dashboard launch and Chat
   preservation across Overview, Chat, Settings, and Admin; observe both agents;
   update feature artifacts, roadmap, platform standard, and `deploys.log`.

## Rollback

- Disable the Titus OIDC client before removing public routing.
- Restore Titus dashboard binding/configuration to the prior loopback-only
  source and restart only `hermes-titus`.
- Retain the exact canonical dashboard projection plus platform-instance and
  hostname selector bindings as operational metadata. The existing guarded
  OIDC lifecycle marks the projection auth `disabled` and moves only its
  runtime-scoped OIDC client binding to `rollback`; with the public route absent
  this removes the launch action without deleting identity, assignment, or
  selector history and lets restoration reuse the same exact records.
- Preserve `hermes-titus-data`, Titus Open WebUI data, chat history, Matrix,
  email intake, Phase boundaries, and all Walter resources.
- Keep `titus-chat.overnightdesk.com` independently routed and authorized
  throughout rollback.
- Re-run anonymous 401, private health, restart-count, chat canary, and
  canonical directory checks before declaring recovery.

## Complexity Tracking

No constitutional violations require justification.
