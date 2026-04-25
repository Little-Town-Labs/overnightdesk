# OvernightDesk — Implementation Roadmap v2

**Source:** PRD v3.0 (2026-04-24)
**Constitution:** v2.0.0 (2026-04-24)
**Generated:** 2026-04-24

---

## Executive Summary

OvernightDesk v3 is a managed hermes-agent hosting platform. The Go daemon and Claude Code BYOS model are replaced by hermes-agent (Nous Research) + OpenRouter + Phase.dev secrets management. This roadmap covers the hermes architecture only — no carry-forward from v1. Features are added as the new stack requires them.

**Total Features:** 4
**Phases:** 2
**Critical Path:** Agent Zero Migration → Provisioner → Setup Wizard → Web Chat

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

---

## Dependency Graph

```
Feature 1 (Agent Zero Migration)
    │
    └──► Feature 2 (Hermes Provisioner)
              │
              ├──► Feature 3 (Setup Wizard)
              │         │
              └──► Feature 4 (Web Chat) ◄──┘
                         (also needs API_SERVER_KEY from Feature 3)
```

**Critical path:** 1 → 2 → 3 → 4

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
| 4 — Web Chat Interface | P1 | Medium |

**Completion gate:**
- [ ] Non-technical user can complete wizard post-payment; no server access required
- [ ] All secrets flow through Phase.dev; zero plaintext credentials in platform DB
- [ ] Authenticated hermes tenant user can chat via `/dashboard/chat` with streaming responses
- [ ] nginx `/v1/*` routing live for all provisioned tenants
- [ ] `API_SERVER_KEY` never exposed client-side
- [ ] Test coverage ≥ 80% on new platform code
- [ ] Mobile-responsive chat UI verified

---

## Execution Checklist

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

---

## Open Questions

1. **Phase service token encryption** — KMS vs app-level AES-GCM with key in Phase.dev? Resolve during Feature 3 spec.
2. **Provisioner location** — standalone service on aegis-prod vs platform API route calling aegis via SSH/API? Resolve during Feature 2 spec.
3. **Agent Zero personality/config** — hermes `config.yaml` and `SOUL.md` for Gary's new Agent Zero? Resolve during Feature 1.
4. **Web chat model selection** — single default model per tenant or user-selectable? Resolve during Feature 4 spec.
5. **Mitchel instance migration** — migrate `hermes-mitchel` to Phase.dev-managed secrets (Option B pattern) after Feature 1 validates the pattern?
