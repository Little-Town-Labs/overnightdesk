# Implementation Plan: Embedded Open WebUI Workspace

**Branch**: `020-open-webui-platform` | **Date**: 2026-07-19 | **Spec**: [spec.md](spec.md)

## Summary

Replace the custom chat card in the Vercel-hosted dashboard with a full-height
Open WebUI workspace. Vercel and Better Auth remain the control and identity
plane. Aegis runs one persistent Open WebUI deployment per Hermes use-case and
memory boundary. Feature 021 supplies canonical runtime assignment and active
membership; Nginx enforces that target gate. Existing consumers may retain an
exact-owner compatibility read, while the new Titus workspace rolls back by
closing its assignment and route. Open WebUI uses a separate
OvernightDesk OIDC client and connects privately to the matching Hermes
OpenAI-compatible API. Gary and Titus are the first canary user/runtime;
Walter follows through a separate deployment using the same pattern, and
Mitchel/Trevor remains gated on Mitchel's active membership. The native Hermes
dashboard remains unchanged where already exposed; Titus rolls back to its
existing Matrix and email interaction paths.

## Technical Context

**Frontend**: Next.js 15.5 / React 19 on Vercel; Better Auth; responsive
workspace shell

**Stateful workload**: Version-pinned Open WebUI container on `aegis-prod`, one
container and named volume per Hermes runtime

**Agent interface**: Hermes OpenAI-compatible API on `:8642`; Chat Completions
for the first release

**Ingress and auth**: Nginx TLS plus Better Auth `auth_request`; separate Open
WebUI OIDC client and exact `/oauth/oidc/callback` redirect

**Secrets**: Phase App selected by use-case trust boundary; Titus uses
`timeless-tech-solutions`, Walter uses `overnightdesk`, and every deployment
uses its own Open WebUI path; no secret values in Vercel responses, source
control, tests, or logs

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
- **Owner decides**: PASS. Titus, Walter, and cleanup are separate gates.
  Titus Teams work and broader rollout require later approval.
- **Simple over clever**: PASS. Open WebUI uses Hermes' documented OpenAI
  compatibility directly; Vercel does not relay streaming chat traffic.
- **Quality and rollback**: PASS. The native dashboard and both state volumes
  are retained through an observation window, and Titus Matrix/email remain
  unchanged.

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
   template, register a separate OIDC client for the Titus workspace,
   and prove top-level login,
   iframe session reuse, logout semantics, and frame policy without exposing the
   service broadly. This may overlap the additive identity implementation.
3. **Titus identity prerequisite**: Complete Feature 021's guarded Tenet 2
   foundation and separate Gary membership operation. Keep every Matrix,
   AgentMail, Teams, runtime, and rollback identifier unchanged.
4. **Titus/Gary stateful canary**: Add TTS Phase-backed secrets, a dedicated volume,
   private Hermes connection, health checks, and a canary-only Nginx route
   assigned through the canonical runtime and membership.
5. **Frontend workspace redesign**: Create a wide dashboard shell and Chat
   route, keep Titus status surfaces concise, and add an honest unavailable
   state that points back to the existing Matrix/email paths.
6. **Browser and rollback proof**: Verify member and non-member behavior,
   streaming, reload persistence, mobile layout, logout, container recreation,
   and sub-15-minute route rollback.
7. **Cleanup**: Only after Titus and Walter are accepted and all remaining
   consumers are accounted for, verify zero use and remove the custom chat
   component, `/api/engine/chat`, `/api/engine/sessions`, the undeployed
   provisioner `/sessions` client, and dependencies used only by that bridge.
8. **Expansion**: Provision Walter through a separate container, volume,
   hostname, OIDC client, Phase path, and Hermes connection after the Titus
   canary. Mitchel/Trevor follows after Mitchel's active membership. Teams
   remains its own channel feature.

## Priority Against Remaining Work

1. **Now — Feature 021 identity contract and additive foundation (P0)**:
   Establish canonical UUIDs, optional stable numbers, membership, persona
   assignments, and resource bindings before a stateful shared-access canary.
2. **Parallel after contract — Feature 020 release/auth spike (P1)**: OIDC,
   embedding, frame policy, and pinned-release research can proceed while the
   guarded Tenet 2 foundation and Gary membership are prepared.
3. **Separate owner gate — Feature 12 scheduler activation**: Prospect deep
   research is implemented and deployed; only task T024 remains, and it
   explicitly requires operator approval. It does not block Feature 020 source
   work.
4. **Next — Feature 021 Titus foundation/membership, then the Feature 020
   Titus canary and frontend cutover (P1)**.
5. **After Titus — Walter Open WebUI (P1)**: Reuse the qualified pattern but
   preserve a separate workload, state, client, and secret boundary.
6. **After Mitchel membership — Mitchel/Trevor Open WebUI (P1)**: Do not block
   Titus or Walter on Mitchel's registration.
7. **After canary — Mitchel landing page (P2)**: Public acquisition remains
   valuable but depends on a trustworthy authenticated operator experience.
8. **Deferred — provisioner `/sessions` route**: Do not implement a legacy
   session bridge solely for the custom chat that Feature 020 will retire.
9. **Separate roadmap — Titus Teams integration and Austin membership**.

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
- Verify the existing Titus Matrix and email paths remain healthy.
- Record the canary outcome and any production state change in the platform
  standard and suite `deploys.log`.

## Titus production canary checkpoint — 2026-07-21

The Tenet 2 foundation, separate Gary membership, Open WebUI resource
bindings, Phase boundary, OIDC client, isolated workload and volume, TLS route,
canonical assignment, SSO, clean browser load, streaming chat, logout, and SSO
re-entry are deployed and verified. The prior conversation remained in the
Open WebUI database for the same user and became visible when the user opened
the restored collapsed sidebar, which triggered the chat-list request. One
earlier auxiliary OAuth refresh failed because the original client did not
issue refresh tokens; the bounded replacement contract is implemented in
source and awaits deployment plus renewal evidence. Container recreation,
controlled denial/restoration, rollback-time proof, platform-standard
publication, and observation remain required before the canary is accepted or
Walter work begins.
