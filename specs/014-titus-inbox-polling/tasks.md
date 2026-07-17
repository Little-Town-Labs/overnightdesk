# Tasks: Titus Email Inbox Polling

**Input**: Design documents from `/specs/014-titus-inbox-polling/`

**Tests**: Required by the specification and repository TDD policy. Story tests
must be observed failing before the corresponding implementation is added.

## Phase 1: Setup

- [ ] T001 Create the Titus poller test package and temporary-state fixtures in
  `tenants/hermes-titus/tests/`
- [ ] T002 Add poller source and health-script paths to the tenant qualification
  contract in `tenants/hermes-titus/scripts/qualify.sh`

---

## Phase 2: Foundational Policy and State

- [ ] T003 [P] Write failing sender normalization, classification, approval
  command, token, and output-validation tests in
  `tenants/hermes-titus/tests/test_agentmail_policy.py`
- [ ] T004 [P] Write failing SQLite initialization, uniqueness, state-transition,
  and no-sensitive-body tests in
  `tenants/hermes-titus/tests/test_agentmail_poller.py`
- [ ] T005 Implement pure authorization, approval, digest, output, and configuration
  policy in `tenants/hermes-titus/runtime/agentmail_policy.py`
- [ ] T006 Implement SQLite schema, transactional state transitions, metadata,
  and safe initialization primitives in
  `tenants/hermes-titus/runtime/agentmail_poller.py`

**Checkpoint**: Exact address authorization and durable one-time processing are
proven without network access.

---

## Phase 3: User Story 1 - Automatic Trusted Replies (Priority: P1)

**Goal**: Gary and Austin receive one safe automatic reply per new message.

**Independent Test**: A fake trusted message produces exactly one in-thread
reply after repeated cycles and a simulated restart.

- [ ] T007 [US1] Write failing fake-transport tests for trusted generation,
  fallback, duplicate-cycle, ambiguous-timeout, and approval-command precedence
  in `tenants/hermes-titus/tests/test_agentmail_poller.py`
- [ ] T008 [US1] Implement bounded AgentMail and tool-free OpenRouter clients in
  `tenants/hermes-titus/runtime/agentmail_transport.py`
- [ ] T009 [US1] Implement trusted-message orchestration, deterministic client
  IDs, retries, and structured metadata-only events in
  `tenants/hermes-titus/runtime/agentmail_poller.py`

**Checkpoint**: User Story 1 passes independently with fake transports.

---

## Phase 4: User Story 2 - Approval Queue for Other Senders (Priority: P1)

**Goal**: Every other sender is held behind an immutable one-time approval.

**Independent Test**: A fake external message creates one draft and one notice;
only an exact valid Gary/Austin command sends the unchanged draft once.

- [ ] T010 [US2] Write failing tests for draft creation, dual-recipient notice,
  exact approve/reject commands, unauthorized commands, changed drafts, and
  first-decision-wins in `tenants/hermes-titus/tests/test_agentmail_poller.py`
- [ ] T011 [US2] Implement external-message draft and approval notification flow
  in `tenants/hermes-titus/runtime/agentmail_poller.py`
- [ ] T012 [US2] Implement transactional approval/rejection claims, live draft
  verification, send reconciliation, and terminal states in
  `tenants/hermes-titus/runtime/agentmail_poller.py`

**Checkpoint**: User Story 2 passes independently and no unapproved external
recipient can receive mail.

---

## Phase 5: User Story 3 - Safe, Recoverable Polling (Priority: P2)

**Goal**: Polling is safely initialized, supervised, observable, and reversible.

**Independent Test**: Disabled, initialize, enabled, stale, retry, and restart
tests prove no historical or duplicate outbound activity.

- [ ] T013 [US3] Write failing tests for disabled no-network behavior, mailbox
  initialization, pagination/cycle caps, heartbeat freshness, and recovery in
  `tenants/hermes-titus/tests/test_agentmail_poller.py`
- [ ] T014 [US3] Implement `initialize`, `run`, `run-once`, and `health` commands
  plus bounded polling in `tenants/hermes-titus/runtime/agentmail_poller.py`
- [ ] T015 [US3] Add a no-network container health wrapper in
  `tenants/hermes-titus/runtime/agentmail-poller-health.sh`
- [ ] T016 [US3] Add the strict Phase email path and configuration validation in
  `tenants/hermes-titus/runtime/load-phase-env.sh`
- [ ] T017 [US3] Install and supervise the poller through
  `tenants/hermes-titus/runtime/prepare-volume.sh`,
  `tenants/hermes-titus/runtime/start-all.sh`, and
  `tenants/hermes-titus/runtime/run-container.sh`
- [ ] T018 [US3] Add disabled deployment, initialization, status, and verification
  actions in `tenants/hermes-titus/scripts/deploy-aegis.sh`

**Checkpoint**: All three stories pass locally and the rollout can start without
mailbox side effects.

---

## Phase 6: Documentation, Review, and Production Activation

- [ ] T019 Update standing email authority and queue instructions in
  `tenants/hermes-titus/skills/agentmail-email/SKILL.md`
- [ ] T020 Update operator configuration, rollout, rollback, and troubleshooting
  in `tenants/hermes-titus/README.md`
- [ ] T021 Run unit tests, tenant qualification, shell syntax, secret scanning,
  `git diff --check`, and the code-review-and-quality gate
- [ ] T022 Create Phase email configuration with polling disabled; deploy and
  verify disabled health on `aegis-prod`
- [ ] T023 Initialize the live mailbox and prove zero outbound actions
- [ ] T024 Remove the AgentMail receive allowlist, enable polling in Phase, restart
  only Titus, and verify enabled worker freshness and trusted-sender behavior
- [ ] T025 Update the owning runtime contract in
  `overnightdesk-platform-standard`, sync its host copy, restart
  `overnightdesk-ops` if required, and append production evidence to the suite
  `deploys.log`
- [ ] T026 Commit, push, open/merge the feature PR as authorized, and verify the
  deployed commit matches merged `main`

## Dependencies and Execution Order

- Setup precedes foundational policy and state.
- T003/T004 tests must fail before T005/T006 implementation.
- US1 and US2 both depend on the foundation; US2 shares the transport client
  introduced by US1.
- US3 depends on the completed message workflows it supervises.
- Production activation is strictly ordered T022 -> T023 -> T024.
- Platform-standard and deployment records follow verified runtime change.

## Implementation Strategy

Deliver one process-safe increment at a time: pure policy, durable state,
trusted reply, approval queue, supervision/configuration, then production
activation. No AgentMail list mutation or enabled polling occurs during local
implementation and testing.
