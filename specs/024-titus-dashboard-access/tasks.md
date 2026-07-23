# Tasks: Titus Advanced Dashboard Access

**Input**: Design documents from `/specs/024-titus-dashboard-access/`

**Tests**: Required by the constitution and feature specification. Observe each
behavioral test failing in RED before writing the corresponding GREEN change.

## Phase 1: Setup and contract baseline

**Purpose**: Establish the reviewed scope, evidence contract, and isolated
workspace before behavioral changes.

- [x] T001 Create and validate the Feature 024 specification, requirement checklist, research, data model, three contracts, quickstart, and implementation plan in `specs/024-titus-dashboard-access/`
- [x] T002 Update the active feature pointer and current plan reference in `.specify/feature.json` and `AGENTS.md`
- [x] T003 Record the exact existing Titus runtime, loopback dashboard, retained volume, selected-agent capability, Walter proxy precedent, OIDC lifecycle, and canonical instance-link inventory in `specs/024-titus-dashboard-access/plan.md`

---

## Phase 2: Foundational canonical assignment and authority boundaries

**Purpose**: Provide agent-agnostic, fail-closed primitives before exposing or
advertising any dashboard.

**Critical**: This phase blocks every user story and all production work.

- [x] T004 Add RED pure tests for exact-host lookup, complete canonical linkage, active/unexpired runtime membership, legacy owner compatibility, partial-link denial, ambiguity denial, and value-free decisions in `src/lib/__tests__/dashboard-authorization.test.ts`
- [x] T005 Implement the shared canonical-versus-legacy authorization planner in `src/lib/dashboard-authorization.ts`
- [x] T006 Implement exact-host canonical context reads with no first-instance fallback in `src/db/dashboard-authorization-store.ts`
- [x] T007 Add RED planner tests for one fixed descriptor, unique identity/owner/bindings, conflict refusal, idempotent no-op, concurrent winner, explicit confirmation, and value-free output in `src/lib/__tests__/dashboard-instance-reconciliation.test.ts`
- [x] T008 Implement the generic guarded dashboard-instance reconciliation planner in `src/lib/dashboard-instance-reconciliation.ts`
- [x] T009 Implement additive plan/apply/verify storage and the fixed Titus command adapter in `src/db/dashboard-instance-reconciliation-store.ts` and `scripts/dashboard-instance-reconciliation.ts`
- [x] T010 Run focused RED/GREEN suites for T004-T009 and record the observed transitions in `specs/024-titus-dashboard-access/quickstart.md`

**Checkpoint**: Exact dashboard assignment and authority can be proven without
starting, routing, or advertising Titus.

---

## Phase 3: User Story 1 - Open Titus's real dashboard (Priority: P1) MVP

**Goal**: Make the existing native Titus dashboard a real, independently
launchable shared capability while Chat remains open and unchanged.

**Independent Test**: With a locally qualified canonical Titus projection,
render Overview, Chat, Settings, and Admin; verify both Chat and Advanced
Dashboard are available from the same selected identity, the launch is safe,
and no interface code branches on Titus or Walter.

### Tests for User Story 1

- [x] T011 [P] [US1] Add RED identity-template and reconciliation assertions for the exact Titus hostname/platform-instance descriptor with no new runtime, volume, provider, or secret boundary in `src/lib/__tests__/titus-identity-backfill.test.ts`
- [x] T012 [P] [US1] Add RED rendered regressions proving a runtime-linked Titus dashboard is available consistently on Overview, Chat, Settings, and Admin without persona-name branches in `src/app/(protected)/dashboard/__tests__/titus-dashboard-capability.test.tsx`
- [x] T013 [P] [US1] Add RED runtime source assertions for configured self-hosted OIDC before non-loopback bind, no `--insecure`, private-network-only reachability, zero published ports, exact public URL, and exact restart target in `tenants/hermes-titus/scripts/qualify.sh`
- [x] T014 [P] [US1] Add RED Nginx contract assertions for the exact Titus host/upstream, full-path auth coverage, bodyless canonical verifier subrequest with TLS SNI, forwarding headers, WebSockets, and no unprotected status path in `src/lib/__tests__/hermes-nginx-config.test.ts`

### Implementation for User Story 1

- [x] T015 [US1] Add declarative Titus dashboard hostname and platform-instance resource bindings without changing existing identity boundaries in `src/lib/use-case-identity-templates.ts`
- [x] T016 [US1] Stage self-hosted OIDC dashboard configuration atomically and bind the existing native dashboard on the private network without publishing a port in `tenants/hermes-titus/runtime/prepare-volume.sh`, `tenants/hermes-titus/runtime/start-all.sh`, and `tenants/hermes-titus/runtime/run-container.sh`
- [x] T017 [US1] Add disabled-by-default prepare, private-verify, restart-persistence, enable-route, status, and rollback actions targeting only Titus in `tenants/hermes-titus/scripts/deploy-aegis.sh`
- [x] T018 [US1] Add the protected Titus native-dashboard virtual host and certificate bootstrap source in `infra/nginx/titus-hermes.conf` and `infra/nginx/titus-hermes-http.conf`
- [x] T019 [US1] Extend the authenticated browser fixture and Chromium assertions for Titus Chat retention, safe dashboard launch, four selected-agent surfaces, keyboard focus, and 320/768/1024/1440px layout in `scripts/open-webui-auth-fixture-server.ts` and `tests/browser/open-webui-auth-spike.spec.ts`
- [x] T020 [US1] Run identity, rendered capability, runtime, Nginx, Chromium, and production-build gates and record the local MVP qualification in `specs/024-titus-dashboard-access/quickstart.md`

**Checkpoint**: The repository contains a real, recoverable Titus dashboard
candidate and the existing shared UI renders it solely from canonical data.

---

## Phase 4: User Story 2 - Fail closed as authority changes (Priority: P2)

**Goal**: Enforce current exact use-case/runtime membership at both the proxy
and native OIDC boundaries with no stale-session or first-instance bypass.

**Independent Test**: Exercise active member, non-member, suspended, revoked,
expired, logged-out, expired-session, wrong-host, partial-link, duplicate-link,
and restored states against both boundaries and observe only valid current
authority pass.

### Tests for User Story 2

- [x] T021 [P] [US2] Add RED route tests for exact normalized host, current canonical membership, non-member/suspended/revoked/expired denial, partial-link and store-failure denial, legacy exact-owner compatibility, and empty responses in `src/app/api/auth/verify-tenant/__tests__/route.test.ts`
- [x] T022 [P] [US2] Add RED OIDC authorization and token tests for canonically linked Titus/Walter membership, runtime-scoped membership, lifecycle denial/restoration, legacy fallback, exact audience/callback/PKCE, and value-free failure in `src/lib/__tests__/hermes-oidc-authorization.test.ts` and `src/lib/__tests__/hermes-oidc-token.test.ts`
- [x] T023 [P] [US2] Add RED browser lifecycle assertions for direct URL, logout, expiry, revocation, reauthentication, blocked pop-up fallback, and zero cross-agent disclosure in `tests/browser/open-webui-auth-spike.spec.ts`

### Implementation for User Story 2

- [x] T024 [US2] Refactor the Nginx verifier route to use exact-host shared authorization and fail closed on every missing or ambiguous state in `src/app/api/auth/verify-tenant/route.ts`
- [x] T025 [US2] Generalize Hermes OIDC authorization to canonical membership for every runtime-linked dashboard, preserve explicit unlinked legacy-owner compatibility, and reconcile one exact runtime-scoped OIDC resource binding in `src/lib/hermes-oidc.ts` and `src/db/dashboard-oidc-binding-store.ts`
- [x] T026 [US2] Add bounded reason-category audit coverage without cookies, emails, names, URLs, OAuth artifacts, or exception text in `src/lib/hermes-oidc-audit.ts` and `src/db/dashboard-authorization-store.ts`
- [x] T027 [US2] Run focused route/OIDC/browser RED/GREEN suites and the complete current-authority matrix against the local fixture, then record results in `specs/024-titus-dashboard-access/quickstart.md`

**Checkpoint**: UI visibility, direct proxy access, and native tokens all derive
from current exact authority, independently of persona presentation.

---

## Phase 5: User Story 3 - Activate and recover safely (Priority: P3)

**Goal**: Qualify, activate, observe, roll back, restore, and accept Titus
dashboard access without affecting Chat, retained data, Walter, or providers.

**Independent Test**: Install disabled, prove private auth and persistence,
activate only Titus DNS/TLS/OIDC/route, complete the denial/session matrix,
rehearse rollback, restore, and confirm owner acceptance across all selected
agent surfaces.

### Production qualification for User Story 3

- [x] T028 [US3] Perform a read-only Aegis preflight of Titus/Walter runtimes, both chat deployments, Nginx, volumes, restart counts, effective provider/model sentinels, current routes, and Ops health and append value-free evidence to `/home/frosted639/src/overnightdesk-suite/deploys.log`
- [x] T029a [US3] Publish, plan, apply, and verify the guarded additive reconciliation for the exact runtime-scoped Titus dashboard platform-instance and hostname bindings with private-runtime qualification, explicit confirmation, and one count-only audit in `scripts/dashboard-identity-binding-reconciliation.ts`
- [x] T029 [US3] Run the guarded production assignment `plan` with zero writes, inspect canonical owner/runtime/binding uniqueness, and record only status/count evidence in `specs/024-titus-dashboard-access/quickstart.md`
- [x] T030a [US3] Publish and deploy the explicit application-generated projection ID correction after a disposable Neon RED/GREEN plan/apply/verify regression proves the raw SQL path does not rely on a nonexistent database default
- [x] T030 [US3] Apply and separately verify the canonical Titus dashboard projection with the explicit confirmation sentinel through `scripts/dashboard-instance-reconciliation.ts`
- [x] T031a [US3] Publish and deploy the guarded fixed-target OIDC lifecycle command plus mode-600 local/mode-0400 Aegis client-ID staging path after disposable database and Titus runtime RED/GREEN qualification
- [x] T031 [US3] Install the Titus Nginx/runtime candidate disabled, create the public OIDC client and exact runtime-scoped binding disabled, stage configuration through non-logging input, and verify private native auth, no published port, exact restart, and retained `hermes-titus-data` using `tenants/hermes-titus/scripts/deploy-aegis.sh`
- [x] T032a [US3] Publish and deploy the durable root-owned loopback rollback marker after a RED regression proves systemd volume preparation overwrote the one-time launcher copy and GREEN verifies the live loopback process before success
- [x] T032 [US3] Rehearse disabled-candidate rollback to loopback-only Titus while preserving Chat, visible history, native data, channels, providers, and Walter, then append the result to `/home/frosted639/src/overnightdesk-suite/deploys.log`
- [x] T033 [US3] Establish only `titus-dashboard.overnightdesk.com` DNS/TLS, temporarily activate the exact OIDC client and protected Nginx route for owner-directed qualification, and prove anonymous/direct access fails closed without claiming production acceptance using `tenants/hermes-titus/scripts/deploy-aegis.sh`
- [ ] T034a [US3] Publish and deploy a fixed-target, guarded Titus membership qualification command with value-free plan/apply/verify/restore output, atomic compare-and-set transitions, metadata-only audit records, and disposable-database RED/GREEN coverage
- [ ] T034 [US3] Complete controlled non-member, suspended-member, and expired-member denial/restoration tests at both platform and direct dashboard boundaries and record value-free outcomes in `specs/024-titus-dashboard-access/quickstart.md`
- [ ] T035 [US3] Complete explicit platform logout, native-session expiry, OIDC revocation, reauthentication, and final restoration tests and record value-free outcomes in `specs/024-titus-dashboard-access/quickstart.md`
- [ ] T036 [US3] Prove Titus Chat response, visible history, exact-runtime restart persistence, native dashboard state, Walter isolation, provider/model invariants, public denial, private health, and zero unintended restarts using `tenants/hermes-titus/scripts/deploy-aegis.sh`
- [ ] T037 [US3] Rehearse active rollback in the specified order, prove Advanced Dashboard becomes unavailable while Chat/data remain healthy, restore the accepted candidate, and append both results to `/home/frosted639/src/overnightdesk-suite/deploys.log`
- [ ] T038 [US3] Obtain authenticated owner acceptance for Titus name/logo, Chat, dashboard launch, all expected Titus Kanban boards with correct Titus-only scope, retained conversation, and capability consistency across Overview, Chat, Settings, and Admin and record it in `specs/024-titus-dashboard-access/quickstart.md`
- [ ] T039 [US3] Complete the Titus observation window with Walter, Open WebUI, Nginx, Vercel runtime, Aegis container, auth-sentinel, restart, and Ops-health checks and append the acceptance decision to `/home/frosted639/src/overnightdesk-suite/deploys.log`

**Checkpoint**: Titus Advanced Dashboard is production-qualified, owner
accepted, observable, and recoverable without coupling either chat deployment.

---

## Phase 6: Review, documentation, publication, and closeout

- [ ] T040 Run Spec Kit cross-artifact analysis and remediate every critical or high-severity finding in `specs/024-titus-dashboard-access/`
- [ ] T041 Run the complete Jest suite, production build, Chromium release suite, `npm audit --audit-level=high`, shell syntax checks, secret/value sentinel scan, and `git diff --check`, recording results in `specs/024-titus-dashboard-access/quickstart.md`
- [ ] T042 Perform five-axis correctness/readability/architecture/security/performance review of the full diff and record findings in `specs/024-titus-dashboard-access/quickstart.md`
- [ ] T043 Update Feature 024 status, task evidence, `.specify/roadmap.md`, `README.md`, and relevant runbooks with only verified behavior in `specs/024-titus-dashboard-access/` and repository documentation
- [ ] T044 Update the capability, authorization, Titus runtime, rollback, and owner-acceptance contract in `/home/frosted639/src/overnightdesk-suite/overnightdesk-platform-standard/README.md`, `docs/decisions/006-capability-driven-composable-agent-workspace.md`, and `docs/runbooks/hermes-agent-update-protocol.md`, then synchronize the accepted production-mounted copy
- [ ] T045 Commit and push each owning repository, create reviewed pull requests, monitor checks and Vercel/Aegis health, merge only after acceptance, append publication evidence to `/home/frosted639/src/overnightdesk-suite/deploys.log`, and prune merged remote branches without discarding retained worktrees

---

## Dependencies and execution order

- Phase 2 blocks every user story because assignment and authority must be
  agent agnostic before Titus data is introduced.
- US1 is the MVP and may be completed locally without public routing.
- US2 depends on the shared authorization context from Phase 2 but can begin
  while US1 runtime-source tests are being implemented in different files.
- US3 requires US1 and US2 complete, reviewed, and locally qualified.
- T029a must merge, deploy, apply, and verify before T029; T029 must pass before
  T030a; T030a must merge and deploy before T030; T030 must verify before
  T031a; T031a must merge and deploy before T031 can create and bind the OIDC
  client; T031 must pass before T032a; T032a must merge and deploy before T032;
  T032 must pass before T033 can temporarily qualify the protected route.
- T034-T039 require owner-directed checkpoints and must remain sequential so
  each authority state is restored before the next transition.
- T034a must merge, deploy, and pass a fresh production read-only plan before
  T034 may begin any owner membership denial window.
- Publication requires all included tests, rollback proof, observation, owner
  acceptance, standard synchronization, and review gates.

## Parallel opportunities

- T004 and T007 are independent RED test files and may be authored together.
- T011-T014 cover separate identity, UI, runtime, and Nginx contracts after the
  foundation stabilizes.
- T021-T023 cover separate route, OIDC, and browser boundaries and may be
  written in parallel before their GREEN tasks.
- Documentation reconciliation may be prepared after evidence stabilizes, but
  each repository must commit and publish through its own branch and review.

## Parallel example: User Story 1

```text
T011: Identity template RED contract
T012: Four-surface capability RED contract
T013: Titus runtime RED contract
T014: Nginx RED contract
```

## Parallel example: User Story 2

```text
T021: Proxy verifier RED contract
T022: Native OIDC RED contract
T023: Browser lifecycle RED contract
```

## Implementation strategy

Deliver the pure assignment and current-authority boundaries first. Then build
and locally qualify the smallest real Titus dashboard candidate while leaving
production routing disabled. Add lifecycle proof before any public activation.
In production, use read-only preflight, plan, disabled install, private proof,
guarded apply, disabled install, rollback rehearsal, controlled protected
qualification, owner-driven denial and session checks, active
rollback/restoration, observation, and only then production acceptance,
documentation, and publication. At no point may a code deploy alone advertise
an unqualified dashboard.
