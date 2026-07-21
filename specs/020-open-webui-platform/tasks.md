# Tasks: Embedded Open WebUI Workspace

**Input**: Design documents from `/specs/020-open-webui-platform/`

**Status**: The Titus/Gary T020e canary is active in production. Open WebUI
`v0.10.2` is pinned by Linux arm64 digest; canonical Tenet 2 identity and Gary
membership, the isolated container/volume, TLS route, OIDC client, SSO, clean
browser load, real streaming chat, logout, and SSO re-entry are verified.
The retained database chat did not appear in the UI after re-entry, and one
earlier auxiliary OAuth refresh failed. Container-recreation persistence,
controlled denial/restoration, rollback-time proof, and standard publication
remain open. Broad rollout, Walter, Mitchel/Trevor, Teams, Austin, dashboard
redesign, and custom-chat removal remain separate.

## Phase 1: Decision and Source Baseline

- [x] T001 Create Feature 020 spec, plan, research, integration contract, and requirements checklist
- [x] T002 Update the active feature pointer and platform roadmap with the current priority decision
- [x] T003 Record planned state and the obsolete `/sessions` inventory correction in `overnightdesk-platform-standard`
- [x] T004 Pin an Open WebUI release and review its image provenance, license, release notes, default headers, database behavior, and security advisories

T004 may begin after the Feature 021 terminology and identity contract is
accepted. It does not require schema deployment or a production number.

## Phase 2: Authentication and Embedding Spike

- [x] T005 Add failing tests for canonical runtime-to-workspace assignment plus active-member, non-member, and suspended-member behavior
- [x] T006 Define a separate Open WebUI OIDC client kind without weakening the native Hermes dashboard client contract
- [x] T007 Prove top-level OIDC login, embedded session reuse, logout, and re-login with the pinned Open WebUI release
- [x] T008 Prove restrictive `frame-ancestors`, cookie, WebSocket/SSE, and text-only permissions behavior
- [x] T009 Run spoofed assignment/header, non-member, wrong-use-case, unapproved-frame, oversized-request, unavailable-backend, and tool-authority abuse tests
- [x] T010 Record the trusted-header alternative as rejected or separately approve and threat-model it if OIDC cannot satisfy the embedded flow

## Phase 3: Gary User / Titus Agent Stateful Canary

This phase is blocked until Feature 021 applies and verifies the guarded Tenet
2 foundation, Gary's active membership, and the current `hermes-titus`
runtime/resource bindings. It does not wait for Mitchel, Austin, or Teams.

- [x] T011 Add version-pinned, rootless/read-only-where-compatible Open WebUI deployment source with health checks and a dedicated volume
- [x] T012 Add Phase secret names under the `timeless-tech-solutions` use-case boundary and value-suppressed qualification for Titus's Open WebUI path
- [x] T013 Add a private `hermes-titus:8642/v1` Chat Completions connection with Ollama and unrelated connections disabled
- [x] T014 Add a canary-only Nginx vhost and Better Auth active-membership gate derived from the canonical runtime assignment
- [x] T015 Add metadata-only security audit events plus explicit request, concurrency, model, and cost bounds
- [ ] T016 Verify container recreation preserves chats and no browser/log surface exposes protected values
  - [x] T016a Verify the dedicated volume retains one active, non-orphaned chat for the same Open WebUI user without inspecting conversation content
  - [ ] T016b Make retained prior chats visible in the Open WebUI history after SSO re-entry; the 2026-07-21 owner check failed because the browser never requested the chat-list endpoint
  - [ ] T016c Recreate the container, then repeat metadata-only retention and user-visible history checks

The T011-T015 source checkpoint uses public S256 PKCE client
`overnightdesk-open-webui-titus-v1`, hostname
`titus-chat.overnightdesk.com`, dedicated volume
`open-webui-hermes-titus-data`, and Phase path
`/agents/open-webui/hermes-titus`. Provisioning creates the canonical records
with the client disabled. Activation and rollback require separate exact
confirmations and never delete the volume.

## Phase 4: Vercel Dashboard Redesign

- [ ] T017 Add failing route, assignment, unavailable-state, and responsive layout tests
- [ ] T018 Replace the fixed-width Chat card with a dedicated full-height `/dashboard/chat` workspace route
- [ ] T019 Preserve concise Overview/Titus status surfaces and an honest fallback to the existing Matrix/email paths
- [ ] T020 Add desktop and mobile browser coverage for navigation, chat, reload, auth expiry, and unavailable behavior

## Phase 5: Canary Review and Cleanup

- [ ] T021 Run the five-axis code, security, data, operations, and UX review
- [ ] T022 Perform approved Aegis/Vercel canary deployment with rollback evidence and deploy-log/standards updates
  - [x] T022a Deploy the isolated stateful workload, certificate, denied route, exact canonical assignment, and public OIDC client; record each production stage in `deploys.log`
  - [ ] T022b Publish the reconciled platform standard and complete the live rollback-time proof while retaining the named volume
- [ ] T023 Complete member, non-member, suspended-member, and logout browser checks and an observation window
  - [x] T023a Verify Gary membership, SSO, clean browser load, streaming chat, logout, and SSO re-entry
  - [ ] T023b Complete controlled non-member and suspended/expired denial/restoration checks
  - [ ] T023c Resolve the OAuth refresh/session-lifetime contract and observe the accepted canary without refresh failures
- [ ] T024 After Titus and Walter are accepted and remaining consumers are accounted for, prove zero use and remove the custom chat component, `/api/engine/chat`, `/api/engine/sessions`, provisioner `getSessions`, and dependencies/tests used only by that bridge
- [ ] T025 Keep the native Hermes dashboard and Open WebUI volume until a separately approved retention decision

## Phase 6: Separate Future Work

- [ ] T026 Provision Walter only after the Titus canary is accepted, using a separate Open WebUI container, volume, hostname, OIDC client, `overnightdesk` Phase path, and private `hermes-walter` connection
- [ ] T027 Provision Mitchel/Trevor only after Mitchel has an active verified membership, using its own isolated Open WebUI deployment
- [ ] T028 Specify Titus Teams/Entra identity and Austin membership in a separate feature; neither is part of Titus Open WebUI

## Dependencies and Execution Order

- Acceptance of the Feature 021 terminology/identity contract precedes T004-T010.
- Feature 021 guarded Tenet 2 foundation and Gary membership precede T016 and
  every production activation; T011-T015 source may be prepared while the
  production identity gate remains closed.
- T004 precedes Feature 020 code and deployment work.
- T005-T010 are a stop/go security gate for the remaining feature.
- T011-T016 precede the Vercel iframe cutover so the frontend never points at
  an unqualified service.
- T017-T020 may be developed against a local fixture after the auth contract is
  fixed.
- T024 follows accepted Titus and Walter canaries, rollback proof, observation,
  and verified zero use by every remaining custom-chat consumer.
- T026 follows the accepted Titus canary. T027 waits for Mitchel membership;
  T028 is an independent later channel feature.
- Feature 12 scheduler activation is an independent owner-gated operation and
  does not block this task list.
