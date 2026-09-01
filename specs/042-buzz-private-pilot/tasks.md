# Tasks: Buzz Private Pilot on Aegis

**Input**: Design documents from `specs/042-buzz-private-pilot/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Delivery Status**: Closed without deployment on 2026-09-01. T001 through
T009 are completed research/evidence. T010 through T054 are intentionally
unexecuted and not scheduled; their unchecked boxes do not represent active
work.

**Tests**: Test-first and deterministic qualification are required by FR-023.
Production mutation tasks are marked **[OWNER APPROVAL]** and are never
delegated.

## Phase 1: Scope, Tracking, and Candidate Freeze

**Purpose**: Establish approved scope and reproducible inputs without changing Aegis.

- [X] T001 **[GITHUB APPROVED 2026-09-01]** Create/adopt the primary Issue, route it to Engineering Delivery project 4, and record Intake fields and acceptance/non-goals from specs/042-buzz-private-pilot/spec.md; tracked by [#249](https://github.com/Little-Town-Labs/overnightdesk/issues/249) (FR-001, FR-024)
- [X] T002 Record the hosting, identity, recovery, and agent-authority decision in docs/decisions/007-buzz-private-pilot.md (FR-001, FR-005, FR-021)
- [X] T003 [P] Add the operator-facing planned lifecycle and approval gates to docs/runbooks/buzz-private-pilot.md (FR-014, FR-019, FR-022, FR-024)
- [X] T004 [P] Re-verify the pinned Buzz commit/image ARM64 manifest, provenance, SBOM, same-SHA CI, vulnerability posture, and rollback candidate; record safe evidence in specs/042-buzz-private-pilot/evidence/candidate.md (FR-001, FR-008)
- [X] T005 Capture a current read-only Aegis service, route, container, resource, disk, backup, and health baseline in specs/042-buzz-private-pilot/evidence/baseline.md (FR-019, FR-024)
- [X] T006 Freeze exact hostname, dedicated Tailscale TLS/WSS topology, services, volumes, networks, resource limits, Phase path names, recovery objectives, and authority matrix in docs/runbooks/buzz-private-pilot.md (FR-001, FR-003, FR-005, FR-007, FR-008, FR-025)
- [X] T007 [P] Verify official Tailscale Docker, Serve, HTTPS, OAuth/tag, state, and userspace interfaces and encode the selected topology in specs/042-buzz-private-pilot/research.md and specs/042-buzz-private-pilot/contracts/ingress-and-runtime.md (FR-003, FR-009, FR-014)
- [X] T008 [P] Run throwaway ARM64 relay-wrapper and non-root Tailscale-sidecar experiments with pinned Syft/Grype tooling and record dispositions in specs/042-buzz-private-pilot/evidence/gate-0-remediation.md (FR-001, FR-008, FR-025)
- [X] T009 Write a failing candidate-image contract in infra/buzz/tests/test_candidate_images.py, promote the version-frozen Wolfi relay wrapper to infra/buzz/relay/Dockerfile, reproduce its ARM64 digest/SBOM/scan, and prove exact-artifact runtime compatibility (FR-001, FR-008, FR-023, FR-025)
- [ ] T010 Qualify a fixed immutable official Tailscale ARM64 release under the same non-root runtime and vulnerability contract and update specs/042-buzz-private-pilot/evidence/gate-0-remediation.md; do not create a custom Tailscale fork (FR-003, FR-008, FR-025)

**Checkpoint**: Candidate and scope are reproducible; production is unchanged.

---

## Phase 2: Foundational Local Contracts

**Purpose**: Write failing contracts before deployment source.

- [ ] T011 Create minimal upstream-derived services, the dedicated Tailscale namespace owner, and qualified digest placeholders in infra/buzz/compose.yml and infra/buzz/compose.aegis.yml so contract tests have a concrete target (FR-001, FR-003, FR-007, FR-025)
- [ ] T012 [P] Write failing runtime isolation, hardening, image pin, explicit non-root, shared namespace, optional-surface, limit, and no-host-port tests in infra/buzz/tests/test_compose_contract.py (FR-003, FR-008, FR-025)
- [ ] T013 [P] Write failing exact-hostname/tag, userspace, loopback-only Serve, Funnel absence, WebSocket, internal-probe, existing-listener invariance, and fail-closed route tests in infra/buzz/tests/test_ingress_contract.py (FR-003, FR-014, FR-019)
- [ ] T014 [P] Write failing Phase projection, container-metadata, and log-sentinel tests in infra/buzz/tests/test_secret_and_log_contract.py (FR-005, FR-009, FR-011)
- [ ] T015 [P] Write failing coherent-set, completeness-marker, isolated-name/network, restore-order, and logical-assertion tests in infra/buzz/tests/test_backup_restore_contract.py (FR-007, FR-012, FR-013)
- [ ] T016 [P] Write failing owner-only, one-channel, no-tool, deduplication, resource, refusal, and revocation tests in infra/buzz/tests/test_agent_authority_contract.py (FR-015 through FR-018)
- [ ] T017 [P] Write failing prepare/install-disabled/verify/enable/rollback ordering and approval-gate tests in infra/buzz/tests/test_deployment_lifecycle.py (FR-014, FR-019, FR-022, FR-023)
- [ ] T018 Add deterministic local test and Compose-render commands to infra/buzz/tests/README.md and verify all new contract tests fail for the intended missing behavior (FR-023)

**Checkpoint**: Every security, recovery, and lifecycle boundary has a failing executable contract.

---

## Phase 3: User Story 2 - Operator Qualifies and Recovers the Service (Priority: P1)

**Goal**: Produce a disabled-first, privately qualified, recoverable workload.

**Independent Test**: Run the local qualification, then—with approvals—install
without a route, complete backup/restore, and rollback without affecting the
existing Aegis baseline.

### Local implementation

- [ ] T019 [US2] Implement isolated service networks, Tailscale-owned shared namespace, volumes, immutable images, health checks, migrations, hardening, and resource limits in infra/buzz/compose.yml and infra/buzz/compose.aegis.yml until T012 passes (FR-003, FR-007, FR-008, FR-025)
- [ ] T020 [P] [US2] Implement least-privilege secret projection and non-secret configuration example in infra/buzz/load-phase-env.sh and infra/buzz/env.example until T014 passes (FR-005, FR-009)
- [ ] T021 [P] [US2] Implement the loopback-only HTTPS/WSS Serve definition with Funnel disabled in infra/buzz/tailscale/serve.json until T013 passes (FR-003, FR-014)
- [ ] T022 [US2] Implement root-owned systemd and stack lifecycle source in infra/buzz/buzz.service, infra/buzz/run-stack.sh, and infra/buzz/stop-stack.sh (FR-001, FR-008, FR-019)
- [ ] T023 [US2] Implement private container/dependency/resource/secret/baseline checks in infra/buzz/qualify-private.sh until the runtime contracts pass (FR-008, FR-010, FR-011, FR-023)
- [ ] T024 [P] [US2] Implement coherent encrypted-set production integration in infra/buzz/backup-buzz.sh until backup contracts pass (FR-012)
- [ ] T025 [P] [US2] Implement disposable unrouted restore and logical assertions in infra/buzz/restore-rehearsal.sh until restore contracts pass (FR-013)
- [ ] T026 [US2] Implement dedicated-device-first disable/revocation, host-Serve invariance, state preservation, and previous-release handling in infra/buzz/rollback.sh until lifecycle tests pass (FR-019)
- [ ] T027 [US2] Compose prepare, install-disabled, private verification, backup, restore, route, rollback, status, evidence, and explicit approval gates in infra/buzz/deploy-aegis.sh (FR-014, FR-019, FR-022, FR-023)
- [ ] T028 [US2] Run all local contracts, Compose rendering, isolated synthetic integration, safe-log sentinel, and local rollback; record results in specs/042-buzz-private-pilot/evidence/local-qualification.md (SC-001, SC-010)

### Production qualification

- [ ] T029 [US2] **[OWNER APPROVAL]** Create the exact tag-scoped ingress credential/policy, install root-owned source and services disabled on Aegis, with Serve inactive and no admitted identities (FR-001, FR-002, FR-009, FR-014)
- [ ] T030 [US2] **[OWNER APPROVAL]** Run private hardening, readiness, capacity, safe-log, restart, and existing-service checks; record safe evidence in specs/042-buzz-private-pilot/evidence/private-qualification.md (SC-001, SC-003, SC-009, SC-010)
- [ ] T031 [US2] **[OWNER APPROVAL]** Extend the encrypted backup producer, create a current coherent set, and verify off-box completion without exposing secrets (FR-012)
- [ ] T032 [US2] **[OWNER APPROVAL]** Restore the current set on a disposable unrouted network, validate all stores, measure RPO/RTO, and record specs/042-buzz-private-pilot/evidence/restore-rehearsal.md (SC-004)
- [ ] T033 [US2] **[OWNER APPROVAL]** Rehearse route-first rollback, verify Buzz becomes unreachable within five minutes with state preserved, and compare every existing Aegis health check to T005 (SC-005)

**Checkpoint**: The service is privately qualified and recoverable; no human route or membership is active.

---

## Phase 4: User Story 1 - Owner Uses a Private Collaboration Space (Priority: P1)

**Goal**: Admit only the owner and prove core collaboration plus denial.

**Independent Test**: Owner actions pass; every unadmitted identity and
unapproved network attempt fails; restart preserves synthetic state.

- [ ] T034 [P] [US1] Implement deterministic owner collaboration, negative admission/channel, reconnect, restart, load, and safe-evidence checks in infra/buzz/qualify-owner.sh (FR-004, FR-006, FR-023)
- [ ] T035 [US1] Add owner route/admission and qualification commands with backup/rollback preconditions to infra/buzz/deploy-aegis.sh (FR-002, FR-014)
- [ ] T036 [US1] Run local/synthetic owner qualification and prove denied cases before production activation; record specs/042-buzz-private-pilot/evidence/owner-local.md (FR-004, FR-006)
- [ ] T037 [US1] **[OWNER APPROVAL]** Generate/recover the owner's distinct client identity, activate the exact dedicated-device Serve route with Funnel absent, and admit only that identity (FR-002 through FR-005)
- [ ] T038 [US1] **[OWNER APPROVAL]** Execute send/edit/delete/reaction/thread/search/reconnect/restart/load and unadmitted connect/read/write denial; record specs/042-buzz-private-pilot/evidence/owner-qualification.md (SC-002, SC-003, SC-008, SC-010)

**Checkpoint**: Owner-only pilot works; the canary remains disabled.

---

## Phase 5: User Story 3 - Low-Authority Agent Participates Safely (Priority: P2)

**Goal**: Admit one new tool-free canary and prove bounded behavior and revocation.

**Independent Test**: Twenty valid owner interactions pass; all out-of-scope
sources/actions remain zero; revocation cancels future and queued activity.

- [ ] T039 [P] [US3] Build a reproducible pinned adapter image with no bundled tools in infra/buzz/canary/Dockerfile and document its digest inputs in infra/buzz/canary/README.md (FR-015, FR-016)
- [ ] T040 [P] [US3] Define deny-by-default owner/channel/concurrency/output/timeout/deduplication configuration in infra/buzz/canary/config.example.toml (FR-016, FR-017)
- [ ] T041 [US3] Implement the separately supervised adapter boundary in infra/buzz/buzz-canary.service and infra/buzz/compose.aegis.yml until T016 passes (FR-015 through FR-018)
- [ ] T042 [US3] Implement 20 valid, unapproved-source, adversarial, duplicate, restart, resource, queued-revocation, and log-sentinel checks in infra/buzz/qualify-canary.sh (FR-017, FR-018, FR-023)
- [ ] T043 [US3] Add explicit canary enable/disable/qualify commands and owner/private qualification preconditions to infra/buzz/deploy-aegis.sh (FR-015, FR-022)
- [ ] T044 [US3] Run the complete adapter test suite locally with synthetic keys and prove no tools, cross-channel response, or sensitive telemetry; record specs/042-buzz-private-pilot/evidence/canary-local.md (SC-006, SC-007, SC-010)
- [ ] T045 [US3] **[OWNER APPROVAL]** Create a new canary key/Phase scope, admit it to one channel, and start the bounded adapter (FR-015, FR-016)
- [ ] T046 [US3] **[OWNER APPROVAL]** Execute canary behavioral, adversarial, restart, capacity, and revocation qualification; record specs/042-buzz-private-pilot/evidence/canary-qualification.md (SC-006 through SC-010)

**Checkpoint**: The isolated canary passes or is revoked and disabled; no existing agent was changed.

---

## Phase 6: User Story 4 - Evidence-Based Decision (Priority: P3)

**Goal**: Observe the bounded pilot and make one explicit decision without expanding authority.

- [ ] T047 [P] [US4] Add daily safe health/capacity/backup/canary/denial evidence capture and blocker rules to docs/runbooks/buzz-private-pilot.md (FR-010, FR-020, FR-024)
- [ ] T048 [US4] **[OWNER APPROVAL]** Run the seven-day bounded observation without adding users, agents, tools, routes, channels beyond the ceiling, or business data (SC-011, SC-012)
- [ ] T049 [US4] Summarize exact release, approvals, checks, recovery, capacity, incidents, residual risks, rollback state, and gate disposition in specs/042-buzz-private-pilot/evidence/pilot-decision.md (FR-024)
- [ ] T050 [US4] Update README.md, docs/runbooks/buzz-private-pilot.md, ../overnightdesk-platform-standard/WHAT/services.yaml, ../overnightdesk-platform-standard/WHAT/network.yaml, ../overnightdesk-platform-standard/WHAT/databases.yaml, ../overnightdesk-platform-standard/WHAT/secrets.yaml, and ../overnightdesk-platform-standard/HOW/deployment.md, then append the verified production result to /opt/overnightdesk/deploys.log so canonical truth matches the live bounded/paused/rolled-back state (FR-001, FR-024)
- [ ] T051 [US4] Record exactly one owner decision—continue bounded, pause disabled, rollback, or propose a separately scoped expansion—without activating any authority delta (FR-020, FR-021)

---

## Phase 7: Final Quality Gate

- [ ] T052 Run all infra/buzz/tests, Compose rendering, Tailscale Serve validation, Funnel/host-listener invariance, security/log scans, backup/restore assertions, and documentation link checks on the latest reviewed head (FR-023)
- [ ] T053 Perform security-and-hardening review against every contract and dispose each evidence-backed finding without expanding scope (FR-023, FR-025)
- [ ] T054 Perform code-review-and-quality against the primary Issue/spec, verify required CI/review/follow-ups, and confirm production activation remains separately authorized (FR-022 through FR-024)

## Dependencies

- T002-T006 and T007-T010 freeze scope and qualify both runtime images before T011; completed GitHub tracking T001 does not gate image qualification.
- T011 enables T012-T017; all failing contracts precede T019-T027.
- T028 must pass before T029; T029 before T030-T033.
- T032 and T033 must pass before T037.
- T038 must pass before T045.
- T039-T044 must pass before T045; T045 before T046.
- T046 must pass before T048; T048 before T049-T051.
- T052-T054 follow the selected pilot outcome and latest reviewed head.

## Parallel Opportunities

- T003-T005 and T007-T008 are disjoint read-only documentation/evidence work.
- T009 can proceed locally while T010 waits for a fixed upstream Tailscale release; T011 waits for both.
- T012-T017 own separate contract files and can run in parallel.
- T020/T021 and T024/T025 own disjoint source surfaces after T019 establishes
  Compose names.
- T039/T040 can proceed in parallel after the authority contract is frozen.
- Production tasks are intentionally sequential, approval-bound, and
  non-delegable.

## MVP Stop Point

Gate 2 / T033 is the minimum infrastructure MVP: Buzz is proven private,
recoverable, bounded, and reversible with no admitted user. Gate 3 answers
whether the human product is useful. Gate 4 answers whether a low-authority
agent is safe. Each is independently stoppable.
