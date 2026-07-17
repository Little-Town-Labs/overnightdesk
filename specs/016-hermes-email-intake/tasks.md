# Tasks: Routed Hermes Email Intake

**Input**: Design documents from `specs/016-hermes-email-intake/`

**Tests**: Required by the constitution. Every behavior test must be observed
failing before its corresponding implementation task begins.

## Phase 1: Setup

- [x] T001 Pin the Go-1.24-compatible pgx v5.7.6 dependency in tenants/hermes-titus/email-poller/go.mod and tenants/hermes-titus/email-poller/go.sum
- [x] T002 [P] Add the accepted architecture decision in docs/decisions/002-route-agentmail-through-securityteam.md
- [x] T003 [P] Record source-backed Hermes, PostgreSQL, and runtime contracts in specs/016-hermes-email-intake/contracts/

---

## Phase 2: Foundational Configuration and Types

**Purpose**: Establish strict per-route configuration and narrow package
interfaces before implementing behavior.

- [x] T004 Write and confirm failing route/configuration tests in tenants/hermes-titus/email-poller/internal/config/config_test.go
- [x] T005 Implement strict database, Hermes, route, sender, limit, and disabled-default configuration in tenants/hermes-titus/email-poller/internal/config/config.go
- [x] T006 [P] Define dirty-message, clean-claim, and store interfaces in tenants/hermes-titus/email-poller/internal/store/store.go
- [x] T007 [P] Define Hermes run request/status interfaces in tenants/hermes-titus/email-poller/internal/transport/hermes.go
- [x] T008 Refactor worker construction around AgentMail, Store, and Hermes interfaces without changing enabled behavior in tenants/hermes-titus/email-poller/internal/worker/worker.go
- [x] T009 Run the foundational Go unit, race, vet, and static build checkpoint from tenants/hermes-titus/email-poller/scripts/qualify.sh

**Checkpoint**: The worker compiles with explicit route, database, and Hermes
contracts while the new intake path remains disabled.

---

## Phase 3: User Story 1 - Land New Email as Untrusted Content (Priority: P1)

**Goal**: One configured instance lands exact-inbox AgentMail messages in the
existing dirty table without invoking Hermes.

**Independent Test**: A provider message produces one staged record on repeated
polls, and an inbox mismatch fails closed before database or Hermes work.

- [x] T010 [US1] Write and confirm failing dirty-landing, deduplication, extracted-text, sender, automated-mail, backlog-pagination, Unicode-boundary, and inbox-mismatch tests in tenants/hermes-titus/email-poller/internal/worker/worker_test.go
- [x] T011 [US1] Write and confirm failing parameterized dirty-insert contract tests in tenants/hermes-titus/email-poller/internal/store/store_test.go
- [x] T012 [US1] Implement bounded parameterized `content_staging` insertion and deduplication in tenants/hermes-titus/email-poller/internal/store/store.go
- [x] T013 [US1] Implement the AgentMail-to-dirty producer flow with trusted route metadata and no direct model call in tenants/hermes-titus/email-poller/internal/worker/worker.go
- [x] T014 [US1] Add metadata-only landing and suppression events with correlation hashes in tenants/hermes-titus/email-poller/internal/worker/worker.go
- [x] T015 [US1] Run User Story 1 tests and verify zero Hermes calls for dirty-only fixtures in tenants/hermes-titus/email-poller/internal/worker/worker_test.go

**Checkpoint**: New email lands dirty exactly once and cannot reach Hermes.

---

## Phase 4: User Story 2 - Deliver Only Cleared Content to the Assigned Agent (Priority: P1)

**Goal**: Atomically claim only approved clean rows for the exact configured
inbox and target agent.

**Independent Test**: One consumer receives its clean row while clean, dirty,
pending, rejected, unrouted, and other-agent rows remain untouched.

- [x] T016 [US2] Write and confirm failing clean eligibility and cross-route isolation SQL contract tests in tenants/hermes-titus/email-poller/internal/store/store_test.go
- [x] T016A [US2] Write and confirm failing SecurityTeam exact-route instruction-preservation and mismatched-route wrapping tests in ../overnightdesk-securityteam/test/pipeline/
- [x] T017 [US2] Write and confirm failing worker tests proving only safe_content reaches the Hermes interface in tenants/hermes-titus/email-poller/internal/worker/worker_test.go
- [x] T018 [US2] Implement transactional `FOR UPDATE SKIP LOCKED` clean claiming joined through staging metadata in tenants/hermes-titus/email-poller/internal/store/store.go
- [x] T018A [US2] Implement the isolated SecurityTeam AgentMail route policy while retaining redaction and injection approval in ../overnightdesk-securityteam/src/pipeline/
- [x] T019 [US2] Implement route-conditional, restart-idempotent complete and metadata-only fail transitions in tenants/hermes-titus/email-poller/internal/store/store.go
- [x] T020 [US2] Integrate bounded clean-claim processing and fail-closed route validation in tenants/hermes-titus/email-poller/internal/worker/worker.go
- [x] T021 [US2] Run User Story 2 SQL contract tests; reserve concurrent/live-row behavior for the controlled production database canary

**Checkpoint**: Only approved clean content for one exact route can enter its
worker.

---

## Phase 5: User Story 3 - Complete Instructions and Reply in the Source Thread (Priority: P1)

**Goal**: Submit clean content to the mapped upstream Hermes run, reconcile its
lifecycle, and send one terminal threaded reply.

**Independent Test**: A fake Hermes Runs API completes tool-backed work and one
reply is sent; approval-waiting, failed, duplicate, and restarted runs remain
safe and recoverable.

- [x] T022 [US3] Write and confirm failing Hermes capability, submit, status, identity, validation, timeout, and approval-waiting contract tests in tenants/hermes-titus/email-poller/internal/transport/transport_test.go
- [x] T023 [US3] Implement the authenticated bounded Hermes Runs API client in tenants/hermes-titus/email-poller/internal/transport/hermes.go
- [x] T024 [US3] Write and confirm failing terminal reply, stable session, idempotency, restart, and no-auto-approval tests in tenants/hermes-titus/email-poller/internal/worker/worker_test.go
- [x] T025 [US3] Implement run submission, status reconciliation, approval waiting, terminal output validation, and threaded reply orchestration in tenants/hermes-titus/email-poller/internal/worker/worker.go
- [x] T026 [US3] Update atomic recovery state for run and reply reconciliation without message content in tenants/hermes-titus/email-poller/internal/state/store.go and tenants/hermes-titus/email-poller/internal/state/store_test.go
- [x] T027 [US3] Remove the direct OpenRouter transport and obsolete email approval path from tenants/hermes-titus/email-poller/internal/transport/openrouter.go and related worker/state code
- [x] T028 [US3] Run User Story 3 tests and verify the fake Hermes request contains safe_content but never the staged raw body in tenants/hermes-titus/email-poller/internal/worker/worker_test.go

**Checkpoint**: Allowed clean email executes through Hermes and receives one
terminal in-thread response; intake cannot approve actions.

---

## Phase 6: User Story 4 - Operate and Recover the Shared Go Intake (Priority: P2)

**Goal**: Run one image as three independently disabled/enabled, observable,
hardened instances with a safe rollout and rollback.

**Independent Test**: Three disabled fixture configurations start without
external work; exact route validation, private Hermes connectivity, health,
restart, and per-instance stop/rollback all pass.

- [x] T029 [US4] Write and confirm failing shell qualification checks for strict Phase keys, three route IDs, systemd templating, no ports, no secret env, and disabled defaults in tenants/hermes-titus/email-poller/scripts/qualify.sh
- [x] T030 [US4] Generalize Phase loading, container naming, volumes, and the systemd template in tenants/hermes-titus/email-poller/runtime/
- [x] T031 [US4] Generalize prepare, install, initialize, verify, canary, status, stop, and rollback actions for three instances in tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh
- [x] T032 [US4] Enable the authenticated private Hermes API server contract in the shared Hermes startup and Titus runtime sources; provision per-agent keys before activation
- [x] T033 [US4] Add per-stage metadata-only health and recovery evidence in tenants/hermes-titus/email-poller/internal/worker/health.go and tenants/hermes-titus/email-poller/internal/worker/worker.go
- [x] T034 [US4] Run local qualification and a container smoke test for all three disabled route fixtures from tenants/hermes-titus/email-poller/scripts/qualify.sh

**Checkpoint**: One source build operates as three isolated disabled-by-default
instances and is ready for controlled canary rollout.

---

## Phase 7: Documentation, Analysis, and Quality Gate

- [x] T035 [P] Update tenant operation and rollback guidance in tenants/hermes-titus/README.md and specs/016-hermes-email-intake/quickstart.md
- [x] T036 [P] Update the live service, secret, network, and Hermes contracts in ../overnightdesk-platform-standard/WHAT/ and ../overnightdesk-platform-standard/HOW/
- [x] T037 Verify all Spec Kit requirements map to completed tasks and mark completed items in specs/016-hermes-email-intake/tasks.md
- [x] T038 Run full Go tests, race tests, vet, static build, shell qualification, diff check, and credential scan from tenants/hermes-titus/email-poller/scripts/qualify.sh
- [x] T039 Apply the code-review-and-quality five-axis gate to tests first and then implementation; record and resolve every Critical and Required finding before handoff in specs/016-hermes-email-intake/review.md
- [x] T040 Run a read-only Aegis preflight and execute the disabled → Titus canary → Agent → Mitchel rollout from tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh
- [x] T041 Append verified production evidence to ../deploys.log and re-run platform-standard validation in ../overnightdesk-platform-standard/
- [x] T042 Reproduce and fix the live Hermes `status: started` submission-contract mismatch, deploy the regression-tested patch, and reconcile the single harmless Titus smoke row without duplicate side effects

---

## Dependencies and Execution Order

- Phase 1 precedes Phase 2.
- Phase 2 blocks every user story.
- US1 precedes US2 because clean rows originate from dirty landing.
- US2 precedes US3 because Hermes may receive only claimed clean content.
- US4 follows the complete functional path and precedes production rollout.
- TDD test tasks must fail before their paired implementation tasks.
- The five-axis quality gate blocks publication, merge, and deployment.

## Incremental Strategy

1. Land dirty-only behavior and verify no Hermes call.
2. Add exact-route clean claiming and verify isolation.
3. Add upstream Hermes execution and one reply.
4. Generalize runtime deployment for three instances.
5. Review, canary, activate, and record production evidence.
