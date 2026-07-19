# Implementation Plan: Embedded Open WebUI Workspace

**Branch**: `020-open-webui-platform` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

## Summary

Replace the custom chat card in the Vercel-hosted dashboard with a full-height
Open WebUI workspace. Vercel and Better Auth remain the control and identity
plane. Aegis runs one persistent Open WebUI deployment per Hermes use-case and
memory boundary. Feature 021 supplies canonical runtime assignment and active
membership; Nginx enforces that target gate while retaining the existing
exact-owner read for migration rollback. Open WebUI uses a separate
OvernightDesk OIDC client and connects privately to the matching Hermes
OpenAI-compatible API. Mitchel is the first canary user and
Trevor is his agent persona; the native Hermes dashboard remains the rollback
surface.

## Technical Context

**Frontend**: Next.js 15.5 / React 19 on Vercel; Better Auth; responsive
workspace shell

**Stateful workload**: Version-pinned Open WebUI container on `aegis-prod`, one
container and named volume per Hermes runtime

**Agent interface**: Hermes OpenAI-compatible API on `:8642`; Chat Completions
for the first release

**Ingress and auth**: Nginx TLS plus Better Auth `auth_request`; separate Open
WebUI OIDC client and exact `/oauth/oidc/callback` redirect

**Secrets**: Phase app `overnightdesk`; per-runtime Open WebUI path; no secret
values in Vercel responses, source control, tests, or logs

**Testing**: Next.js unit/integration tests; Nginx configuration assertions;
container health and persistence checks; Playwright desktop/mobile auth,
embedding, chat, logout, denial, and rollback checks

## Constitution Check

- **Customer data is sacred**: PASS. Each Open WebUI deployment and volume is
  bound to one Hermes use case. The platform database continues to hold only
  operational assignment metadata, not chats or API credentials.
- **Security**: CONDITIONAL PASS. OIDC-in-embed behavior, frame policy, exact
  membership and non-member denial, local-auth shutdown, and secret non-exposure must pass the
  canary before broad use.
- **Owner decides**: PASS. The canary and cleanup are separate gates. Titus
  Teams work and broader rollout require later approval.
- **Simple over clever**: PASS. Open WebUI uses Hermes' documented OpenAI
  compatibility directly; Vercel does not relay streaming chat traffic.
- **Quality and rollback**: PASS. The native dashboard and both state volumes
  are retained through an observation window.

## Architecture

```text
Browser
  |
  +-- https://www.overnightdesk.com/dashboard/chat
  |      Vercel: Better Auth, instance lookup, workspace shell
  |
  +-- iframe/top-level auth bootstrap to per-runtime WebUI hostname
         |
         v
      Aegis Nginx: TLS + exact Better Auth membership gate + frame policy
         |
         v
      open-webui-<runtime> :8080
         |  server-side bearer auth on private Docker network
         v
      hermes-<runtime> :8642/v1
         |
         +-- runtime-local tools, skills, memory, model routing
```

### Boundary decisions

1. **Run Open WebUI on Aegis**. It requires persistent accounts, chats,
   connection configuration, WebSockets/streaming, and a durable secret key.
2. **Keep Vercel as the shell**. It owns Better Auth, instance authorization,
   navigation, billing/status, and the server-side workspace assignment.
3. **Do not proxy chat through Vercel**. The browser talks to the authenticated
   Open WebUI origin; Open WebUI talks server-to-server to Hermes.
4. **Deploy per runtime/use case**. This mirrors the primary-memory boundary
   and prevents one Open WebUI database or admin account from spanning tenants.
5. **Prefer OIDC to trusted headers**. Reuse the self-hosted OvernightDesk
   provider with a separate client. A short auth spike must prove session
   bootstrap and callback behavior with the embedded origin. Trusted-header
   auth is not an automatic fallback because it would make Nginx an identity
   assertion boundary and requires a separate security decision.
6. **Use Chat Completions first**. Hermes documents it as the recommended mode
   that works without experimental Responses behavior.

## Repository Ownership

```text
overnightdesk/
├── specs/020-open-webui-platform/       feature contract and rollout tasks
├── src/app/(protected)/dashboard/       workspace shell and routing
├── src/app/api/auth/                    OIDC/membership authorization
├── src/lib/                             workspace assignment/config
├── infra/open-webui/                    compose and nginx templates
└── tests/                               route, auth, and UI coverage

overnightdesk-platform-standard/
├── WHAT/open-webui.yaml                 planned/live service contract
├── WHAT/services.yaml                   inventory and /sessions correction
└── HOW/open-webui.md                     deploy, verify, rollback runbook
```

## Delivery Sequence

1. **Identity contract**: Accept Feature 021 terminology, UUID/number
   semantics, membership authorization, runtime/persona separation, and
   resource-binding compatibility rules.
2. **Open WebUI auth spike**: Pin the Open WebUI version, decide hostname
   template, register a separate OIDC client for Mitchel's Trevor workspace,
   and prove top-level login,
   iframe session reuse, logout semantics, and frame policy without exposing the
   service broadly. This may overlap the additive identity implementation.
3. **Mitchel/Trevor identity prerequisite**: Complete Feature 021's additive
   schema, canonical resolver, Mitchel user membership, Trevor persona
   assignment, and use-case/runtime bindings. Keep all existing resource names
   and the prior single-owner read available.
4. **Mitchel/Trevor stateful canary**: Add Phase-backed secrets, a dedicated volume,
   private Hermes connection, health checks, and a canary-only Nginx route
   assigned through the canonical runtime and membership.
5. **Frontend workspace redesign**: Create a wide dashboard shell and Chat
   route, keep Trevor status surfaces concise, and add unavailable/native
   dashboard fallbacks.
6. **Browser and rollback proof**: Verify member and non-member behavior,
   streaming, reload persistence, mobile layout, logout, container recreation,
   and sub-15-minute route rollback.
7. **Cleanup**: After the observation gate, remove the custom chat component,
   `/api/engine/chat`, `/api/engine/sessions`, the undeployed provisioner
   `/sessions` client, and dependencies used only by that bridge.
8. **Expansion**: Evaluate Walter and later Titus separately. Teams integration
   remains its own feature.

## Priority Against Remaining Work

1. **Now — Feature 021 identity contract and additive foundation (P0)**:
   Establish canonical UUIDs, optional stable numbers, membership, persona
   assignments, and resource bindings before a stateful shared-access canary.
2. **Parallel after contract — Feature 020 release/auth spike (P1)**: OIDC,
   embedding, frame policy, and pinned-release research can proceed while the
   additive identity schema and Mitchel backfill are implemented.
3. **Separate owner gate — Feature 12 scheduler activation**: Prospect deep
   research is implemented and deployed; only task T024 remains, and it
   explicitly requires operator approval. It does not block Feature 020 source
   work.
4. **Next — Feature 021 Mitchel vertical slice, then Feature 020 canary and
   frontend cutover (P1)**.
5. **After canary — Mitchel landing page (P2)**: Public acquisition remains
   valuable but depends on a trustworthy authenticated operator experience.
6. **Deferred — provisioner `/sessions` route**: Do not implement a legacy
   session bridge solely for the custom chat that Feature 020 will retire.
7. **Separate roadmap — Titus shared membership, Open WebUI, and Teams
   integration**.

The May 2026 three-phase provisioner/orchestrator convergence sketch
(`OPERATOR_RESEED` bootstrap wiring, `/provision-infra`, and wizard parallel
calls) is abandoned planning, not active backlog. The current wizard continues
to use the working Hermes provisioner directly. This classification does not
retire the existing platform orchestrator or its other responsibilities.

## Rollback

- Disable the Feature 020 canary assignment or restore the prior Chat route.
- Restore the prior Nginx vhost and reload only after configuration validation.
- Stop, but do not delete, the Open WebUI container or named volume.
- Keep the Hermes API, runtime volume, native dashboard, and existing OIDC
  client unchanged.
- Record the canary outcome and any production state change in the platform
  standard and suite `deploys.log`.
