# Tasks: Embedded Open WebUI Workspace

**Input**: Design documents from `/specs/020-open-webui-platform/`

**Status**: Planning captured; no runtime, Vercel, Phase, or production changes
are authorized by this task list.

## Phase 1: Decision and Source Baseline

- [x] T001 Create Feature 020 spec, plan, research, integration contract, and requirements checklist
- [x] T002 Update the active feature pointer and platform roadmap with the current priority decision
- [x] T003 Record planned state and the obsolete `/sessions` inventory correction in `overnightdesk-platform-standard`
- [ ] T004 Pin an Open WebUI release and review its image provenance, license, release notes, default headers, database behavior, and security advisories

## Phase 2: Authentication and Embedding Spike

- [ ] T005 Add failing tests for exact instance-to-workspace assignment and wrong-owner denial
- [ ] T006 Define a separate Open WebUI OIDC client kind without weakening the native Hermes dashboard client contract
- [ ] T007 Prove top-level OIDC login, embedded session reuse, logout, and re-login with the pinned Open WebUI release
- [ ] T008 Prove restrictive `frame-ancestors`, cookie, WebSocket/SSE, and text-only permissions behavior
- [ ] T009 Run spoofed assignment/header, wrong-owner, unapproved-frame, oversized-request, unavailable-backend, and tool-authority abuse tests
- [ ] T010 Record the trusted-header alternative as rejected or separately approve and threat-model it if OIDC cannot satisfy the embedded flow

## Phase 3: Mitchel Stateful Canary

- [ ] T011 Add version-pinned, rootless/read-only-where-compatible Open WebUI deployment source with health checks and a dedicated volume
- [ ] T012 Add Phase secret names and value-suppressed qualification for the Mitchel Open WebUI path
- [ ] T013 Add a private `hermes-mitchel:8642/v1` Chat Completions connection with Ollama and unrelated connections disabled
- [ ] T014 Add a canary-only Nginx vhost and Better Auth exact-owner gate
- [ ] T015 Add metadata-only security audit events plus explicit request, concurrency, model, and cost bounds
- [ ] T016 Verify container recreation preserves chats and no browser/log surface exposes protected values

## Phase 4: Vercel Dashboard Redesign

- [ ] T017 Add failing route, assignment, unavailable-state, and responsive layout tests
- [ ] T018 Replace the fixed-width Chat card with a dedicated full-height `/dashboard/chat` workspace route
- [ ] T019 Preserve concise Overview/Trevor status surfaces and the native Hermes dashboard fallback
- [ ] T020 Add desktop and mobile browser coverage for navigation, chat, reload, auth expiry, and unavailable behavior

## Phase 5: Canary Review and Cleanup

- [ ] T021 Run the five-axis code, security, data, operations, and UX review
- [ ] T022 Perform approved Aegis/Vercel canary deployment with rollback evidence and deploy-log/standards updates
- [ ] T023 Complete owner and non-owner browser checks and an observation window
- [ ] T024 Remove the custom chat component, `/api/engine/chat`, `/api/engine/sessions`, provisioner `getSessions`, and dependencies/tests used only by that bridge
- [ ] T025 Keep the native Hermes dashboard and Open WebUI volume until a separately approved retention decision

## Phase 6: Separate Future Work

- [ ] T026 Evaluate Walter rollout only after the Mitchel canary is accepted
- [ ] T027 Specify Titus Open WebUI and Teams surfaces together in a separate feature

## Dependencies and Execution Order

- T004 precedes all code and deployment work.
- T005-T010 are a stop/go security gate for the remaining feature.
- T011-T016 precede the Vercel iframe cutover so the frontend never points at
  an unqualified service.
- T017-T020 may be developed against a local fixture after the auth contract is
  fixed.
- T024 follows the canary, rollback proof, and observation window.
- Feature 12 scheduler activation is an independent owner-gated operation and
  does not block this task list.
