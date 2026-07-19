# OvernightDesk — Implementation Roadmap v2

**Source:** PRD v3.0 (2026-04-24)
**Constitution:** v2.0.0 (2026-04-24)
**Generated:** 2026-04-24
**Last Reconciled:** 2026-07-19

---

## Executive Summary

OvernightDesk v3 is a managed hermes-agent hosting platform. The Go daemon and Claude Code BYOS model are replaced by hermes-agent (Nous Research) + OpenRouter + Phase.dev secrets management. This roadmap covers the hermes architecture only — no carry-forward from v1. Features are added as the new stack requires them.

**Total Features:** 6 (four original v3 features plus Features 020 and 021)
**Phases:** 2
**Current UX Path:** Feature 021 identity contract/foundation + Feature 020 auth
spike → Mitchel-user/Trevor-agent identity backfill → Open WebUI canary → dashboard cutover

---

## What Already Exists (v3 baseline)

| Component | Location | Status |
|-----------|----------|--------|
| OvernightDesk platform (auth, billing, dashboard) | overnightdesk (Vercel) | Shipped |
| hermes-agent container image | nousresearch/hermes-agent:latest | Available — gateway + dashboard sidecar pattern established |
| Hermes hub page + filtered nav (hermes tenants) | overnightdesk | Shipped |
| isHermesTenant() helper | overnightdesk/src/lib/instance.ts | Shipped |
| Phase CLI v2.1.0 | aegis-prod host | Installed |
| Phase.dev `phase secrets export` pattern | aegis-prod | Validated on existing tenants |
| Phase.dev `/tenant-0/` path | Phase.dev | Active — established secrets pattern |
| nginx `{tenantId}.overnightdesk.com` routing pattern | aegis-prod | Established |
| Constitution v2.0.0 | .specify/memory/constitution.md | Ratified |

---

## Feature Inventory

### Feature 1: Agent Zero — Hermes Migration
**Source:** PRD v3.0 Section 5, Phase 9
**Description:** Replace `overnightdesk-tenant-0` (Go daemon) with a hermes-agent instance as the new Agent Zero on aegis-prod. Validates the `phase secrets export --path /agent-zero > /opt/agent-zero/.env` → hermes-agent startup pattern end-to-end. Gary's ops instance. The resulting deploy script becomes the authoritative template for all tenant provisioning. `overnightdesk-tenant-0` decommissioned once stable.
**Complexity:** Medium
**Priority:** P0 (Critical — gates all v3 provisioning)
**Dependencies:** Phase.dev `/agent-zero/` path configured with hermes secrets, hermes-agent image on aegis-prod
**Blocks:** Features 2, 3, 4

---

### Feature 2: Hermes Provisioner
**Source:** PRD v3.0 Section 5, Phase 10
**Description:** Automated hermes-agent tenant provisioning pipeline. Stripe payment confirmed → provisioner service on aegis-prod receives request → creates Phase.dev `/{tenantId}/` path via Phase API → stores Phase service token in `instance.phaseServiceToken` → runs `phase secrets export` to write `.env` → starts gateway container + dashboard sidecar → provisions nginx server block + certbot TLS for `{tenantId}.overnightdesk.com` → polls health → updates instance status (`queued → provisioning → running`). Deprovision on cancellation: containers stopped, `/opt/{tenantId}/` data retained 30 days.
**Complexity:** Large
**Priority:** P0 (Critical)
**Dependencies:** Feature 1 (validated deploy pattern), Stripe webhooks (existing), Phase.dev API access
**Blocks:** Features 3, 4

---

### Feature 3: Self-Service Setup Wizard
**Source:** PRD v3.0 Section 5, Phase 11
**Description:** Post-payment wizard in the OvernightDesk dashboard. Non-technical users configure their hermes-agent instance without touching the server. Steps: (1) OpenRouter API key — validated with a test call; (2) Telegram bot token + allowed user IDs — optional; (3) Agent name, timezone, personality. Platform writes all secrets to Phase.dev via API — never stores plaintext in the platform DB. Phase service token stored encrypted in `instance.phaseServiceToken`. Settings page allows secret updates: update Phase.dev + restart container. Real-time provisioning progress displayed in dashboard.
**Complexity:** Medium
**Priority:** P1 (High)
**Dependencies:** Feature 2 (provisioner), Phase.dev API integration in platform

---

### Feature 4: Web Chat Interface
**Source:** PRD v3.0 Section 5, Phase 12
**Description:** `/dashboard/chat` page for hermes tenants only. Vercel AI SDK `useChat` hook streams responses from the hermes OpenAI-compatible API server on port 8642. Platform `/api/engine/chat` Next.js API route validates session + hermes tenant, proxies to `https://{tenantId}.overnightdesk.com/v1/chat/completions` with `API_SERVER_KEY` as bearer token. nginx `/v1/*` location block on `{tenantId}.overnightdesk.com` routes to hermes gateway container on `:8642`. "Chat" tab added to `HERMES_ALLOWED_TABS` in `dashboard-nav.tsx`. Conversation history rendered in chat UI. Mobile-responsive. `API_SERVER_KEY` stored in Phase.dev, never exposed client-side.
**Complexity:** Medium
**Priority:** P1 (High)
**Dependencies:** Feature 2 (running hermes containers), Feature 3 (`API_SERVER_KEY` in Phase.dev)

**Status (2026-07-19): Superseded by Feature 020.** A custom Vercel AI SDK
chat exists, but the provisioner `/sessions` route it expects is not deployed
and the UI duplicates conversation-management behavior now provided by Open
WebUI. Keep it only as rollback/compatibility code until the Feature 020 canary
passes; do not extend it or implement `/sessions` solely for this design.

---

### Feature 5: Embedded Open WebUI Workspace (Feature 020)
**Source:** Owner direction on 2026-07-19 and `specs/020-open-webui-platform/`
**Description:** Replace the custom dashboard chat with a full-height Open WebUI
workspace. Vercel and Better Auth remain the platform shell. Aegis runs one
persistent Open WebUI deployment per Hermes use-case/memory boundary, connected
privately to that runtime's OpenAI-compatible API. Begin with Mitchel as the
canary user and Trevor as his Hermes agent persona,
retain the native Hermes dashboard, and remove the custom chat/session bridge
only after browser, isolation, persistence, and rollback proof.
**Complexity:** Large
**Priority:** P1 (next active platform development slice)
**Dependencies:** Running Hermes API; Feature 021 canonical runtime assignment
and active membership for the canary; separate Open WebUI OIDC client; pinned
Open WebUI release; Nginx frame policy; Phase-backed secrets and persistent
volume
**Spec:** `specs/020-open-webui-platform/`

---

### Feature 6: Use-Case Identity Foundation (Feature 021)
**Source:** Owner direction on 2026-07-19 and `specs/021-use-case-identity-foundation/`
**Description:** Define and implement an additive canonical identity layer for
use cases, runtime/memory boundaries, persona assignments, multi-person
membership, and infrastructure resource bindings. Keep UUIDs as internal and
security identifiers; optionally allocate an immutable, never-reused number for
human-facing `Tenet N` references. Preserve existing instance, orchestrator,
container, volume, hostname, Phase, OIDC, and intake identifiers during
migration. The Mitchel business use case is the first vertical slice: Mitchel
is the person/member, Trevor is his agent persona, and `hermes-mitchel` is the
current runtime resource alias.
**Complexity:** Large
**Priority:** P0 foundation for shared access and Feature 020 canary
**Dependencies:** Accepted terminology/identity contract; additive schema and
resolver; explicit number allocation approval for each backfill
**Blocks:** Feature 020 Mitchel stateful canary; multi-person Titus access;
future broad identity propagation
**Does not block:** Feature 020 release/OIDC/frame-policy research after the
contract is accepted; independently owner-gated Feature 12 activation
**Spec:** `specs/021-use-case-identity-foundation/`

---

## Current Priority Decision — 2026-07-19

| Order | Work | Priority decision |
|------:|------|-------------------|
| 1 | Feature 021 terminology, contract, and additive schema/resolver | Start first. Canonical UUID, optional stable number, membership, persona assignment, and resource-binding semantics are foundational. |
| 2 | Feature 020 release/authentication/embedding spike | May overlap Feature 021 implementation after the identity contract is accepted; it does not need production identity backfill to test OIDC/frame behavior. |
| 3 | Feature 021 Mitchel-user/Trevor-agent identity and membership vertical slice | Required before the stateful Open WebUI canary. Preserve all current resource names. |
| 4 | Feature 12 prospect scheduler activation (T024) | Separate owner gate. Implementation and deployment are complete; activation requires explicit approval and does not block identity or Open WebUI source work. |
| 5 | Feature 020 Mitchel-user/Trevor-agent canary and dashboard redesign | Continue only after both the auth spike and identity gate pass. Preserve native Hermes dashboard rollback. |
| 6 | Mitchel Feature 11 landing page | P2 after the authenticated operator experience is trustworthy. |
| 7 | Provisioner `/sessions` route | Deferred/superseded. Do not build it solely for custom chat that Feature 020 removes. |
| 8 | Titus shared membership, Open WebUI, and Teams integration | Separate future feature after the identity foundation; design Titus surfaces and Gary/Austin roles together. |

This order is the durable restart point. It supersedes the stale unchecked
execution checklist below, which describes the original April v3 sequence but
does not reflect the current deployed platform.

The three-phase provisioner/orchestrator convergence sketch recorded in the
initial 2026-05-07 standard (`OPERATOR_RESEED` startup wiring,
`/provision-infra`, and wizard parallel calls) is abandoned planning, not
unfinished Feature 020 or customer-rollout work. The current wizard continues
to call the working Hermes provisioner directly. This does not retire the
existing platform orchestrator's other responsibilities.

---

## Dependency Graph

```
Feature 1 (Agent Zero Migration)
    │
    └──► Feature 2 (Hermes Provisioner)
              │
              ├──► Feature 3 (Setup Wizard)
              │         │
              └──► Feature 4 (Custom Web Chat, superseded)
                         │
                         └──► Feature 020 (Embedded Open WebUI auth spike)

Feature 021 (Use-Case Identity Foundation)
    ├──► Mitchel-user/Trevor-agent identity/membership vertical slice
    │         └──► Feature 020 stateful Mitchel canary
    └──► future Titus multi-person membership and channel work
```

**Current chat path:** Accept Feature 021 contract → run additive identity
foundation while Feature 020 auth research overlaps → verify Mitchel-user/Trevor-agent identity
mapping → stateful Mitchel canary → dashboard cutover → custom-chat cleanup.

---

## Implementation Phases

### Phase 1: Foundation — Validated Provisioning Pattern
**Goal:** Agent Zero running on hermes-agent, `phase secrets export` pattern proven, automated provisioner live.

| Feature | Priority | Complexity |
|---------|----------|------------|
| 1 — Agent Zero Hermes Migration | P0 | Medium |
| 2 — Hermes Provisioner | P0 | Large |

**Completion gate:**
- [ ] Gary's hermes-agent instance live as Agent Zero; `overnightdesk-tenant-0` decommissioned
- [ ] `phase secrets export` → `.env` → hermes container pattern validated and scripted
- [ ] Stripe payment → automated provisioning produces a live hermes tenant at `{tenantId}.overnightdesk.com`
- [ ] Fleet events logged at every provisioning state transition
- [ ] Test coverage ≥ 80% on new platform provisioning code

---

### Phase 2: Self-Service — User-Facing Configuration + Chat
**Goal:** Customers can configure their own instance and chat with their agent from the platform.

| Feature | Priority | Complexity |
|---------|----------|------------|
| 3 — Self-Service Setup Wizard | P1 | Medium |
| 4 — Custom Web Chat Interface | Superseded | Medium |
| 021 — Use-Case Identity Foundation | P0 | Large |
| 020 — Embedded Open WebUI Workspace | P1 | Large |

**Completion gate:**
- [ ] Non-technical user can complete wizard post-payment; no server access required
- [ ] All secrets flow through Phase.dev; zero plaintext credentials in platform DB
- [ ] Canonical UUID identity, optional non-authorizing stable number, Mitchel membership, Trevor persona assignment, and resource bindings pass the first vertical slice
- [ ] Authenticated Mitchel can chat with his Trevor agent through the embedded Open WebUI workspace with streaming responses
- [ ] Open WebUI reaches only its assigned Hermes API over the private network
- [ ] `API_SERVER_KEY` never exposed client-side
- [ ] Test coverage ≥ 80% on new platform code
- [ ] Desktop/mobile, non-member/suspended-member denial, persistence, logout, and rollback checks pass

---

## Historical April 2026 Execution Checklist

This checklist is retained as source history. Use
`specs/020-open-webui-platform/tasks.md` for current chat work and the Current
Priority Decision above for sequencing.

### Phase 1

- [ ] **Feature 1: Agent Zero — Hermes Migration**
  - [ ] `/speckit-specify 1-agent-zero-hermes-migration`
  - [ ] `/speckit-plan`
  - [ ] `/speckit-tasks`
  - [ ] `/speckit-implement`
  - [ ] `/code-review`

- [ ] **Feature 2: Hermes Provisioner**
  - [ ] `/speckit-specify 2-hermes-provisioner`
  - [ ] `/speckit-plan`
  - [ ] `/speckit-tasks`
  - [ ] `/speckit-implement`
  - [ ] `/code-review`

**Phase 1 completion gate passed → proceed to Phase 2**

### Phase 2

- [ ] **Feature 3: Self-Service Setup Wizard**
  - [ ] `/speckit-specify 3-self-service-setup-wizard`
  - [ ] `/speckit-plan`
  - [ ] `/speckit-tasks`
  - [ ] `/speckit-implement`
  - [ ] `/code-review`

- [ ] **Feature 4: Web Chat Interface**
  - [ ] `/speckit-specify 4-web-chat-interface`
  - [ ] `/speckit-plan`
  - [ ] `/speckit-tasks`
  - [ ] `/speckit-implement`
  - [ ] `/code-review`

**Phase 2 completion gate passed → platform v3 live**

---

## Risk Assessment

| Feature | Risk | Severity | Mitigation |
|---------|------|----------|------------|
| 1 | `phase secrets export` format incompatible with hermes `.env` parser | Medium | Validate in test container before decommissioning Agent Zero |
| 1 | hermes-agent memory footprint exceeds aegis-prod capacity at scale | Low | Benchmark idle + active; scale-out plan at 18 tenants |
| 2 | Phase.dev API rate limits during burst provisioning | Low | Queue provisioning requests; retry with backoff |
| 2 | Partial provisioning failure (nginx written, container failed) | Medium | Idempotent provisioner: detect and resume from last good state |
| 3 | OpenRouter key validation call leaks timing info | Low | Validate server-side only, return generic error client-side |
| 4 | hermes API server ephemeral token changes on restart, breaking chat | Medium | `API_SERVER_KEY` env var patch or `phase run` injects stable key |
| 021 | Sequential number is mistaken for an authorization key | High | UUID-only authorization, membership checks, enumerable-number tests, and contract review |
| 021 | Additive identity diverges from legacy routing/resource strings | Medium | Explicit bindings, dual-read comparison, one-use-case canary, and retained legacy reads |
| 021 | Shared membership broadens runtime access unintentionally | High | Scoped roles/states, denial tests, metadata-only audit, and canary feature flag |

---

## Open Questions

1. **Phase service token encryption** — KMS vs app-level AES-GCM with key in Phase.dev? Resolve during Feature 3 spec.
2. **Provisioner location** — standalone service on aegis-prod vs platform API route calling aegis via SSH/API? Resolve during Feature 2 spec.
3. **Agent Zero personality/config** — hermes `config.yaml` and `SOUL.md` for Gary's new Agent Zero? Resolve during Feature 1.
4. **Web chat model selection** — single default model per tenant or user-selectable? Resolve during Feature 4 spec.
5. **Mitchel instance migration** — migrate `hermes-mitchel` to Phase.dev-managed secrets (Option B pattern) after Feature 1 validates the pattern?
