# Tasks: Titus Telegram DM Channel

**Input**: Design documents from `/specs/037-titus-telegram-channel/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, and `quickstart.md`

**Execution boundary**: This task list authorizes source, tests, documentation,
and controlled qualification. It does not authorize copying secrets into Git,
printing Phase values, changing Matrix, or deleting runtime state.

**Tests**: Required by the feature specification and repository TDD guidance.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the source and documentation surfaces for the Telegram
DM boundary.

- [x] T001 [P] Create the Titus Telegram runtime contract in `specs/037-titus-telegram-channel/contracts/telegram-runtime.md`.
- [x] T002 [P] Record native Hermes Telegram, Phase, polling, and private-DM authorization decisions in `specs/037-titus-telegram-channel/research.md`.
- [x] T003 [P] Define the Telegram profile, message event, and redacted channel state in `specs/037-titus-telegram-channel/data-model.md`.
- [x] T004 [P] Write the disabled-first qualification and rollback procedure in `specs/037-titus-telegram-channel/quickstart.md`.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make the external boundary strict and fail closed before enabling
any Telegram interaction.

- [x] T005 [P] Add failing tests for exact Telegram Phase keys, one numeric Gary ID, token-shape validation, disabled readiness, and secret-free evidence in `tenants/hermes-titus/tests/test_telegram_runtime_contract.py`.
- [x] T006 [P] Add redacted Telegram fixtures for valid, invalid, wildcard, multi-user, group, private, unauthorized, and provider-failure cases in `tenants/hermes-titus/tests/fixtures/telegram_channel.py`.
- [x] T007 Extend `tenants/hermes-titus/runtime/load-phase-env.sh` to fetch `/agents/hermes-titus/telegram`, reject unknown or invalid values into a disabled/invalid channel state without stopping Titus, project the profile only when ready, and emit `TITUS_TELEGRAM_STATE` without printing secrets.
- [x] T008 Add disabled-by-default native Telegram configuration and explicit no-group/no-webhook policy in `tenants/hermes-titus/config/config.yaml`.
- [x] T009 Gate Telegram enablement in `tenants/hermes-titus/runtime/start-with-secrets.sh` on the strict readiness state while preserving Matrix, Teams, email, memory, and approval configuration.

**Checkpoint**: The source accepts only one Gary ID and one token from the
exact Phase path, rejects all group scope, creates no webhook/public port, and
keeps Telegram disabled when the profile is absent or invalid.

## Phase 3: User Story 1 - Chat with Titus from Telegram (Priority: P1) 🎯 MVP

**Goal**: Gary can send a private Telegram DM to Titus and use the existing
Hermes interaction, session, tools, memory, and approval path.

**Independent Test**: Run the Telegram runtime tests, verify the pinned plugin
is available, then send one harmless Gary DM during the controlled canary and
verify one response in that private chat.

### Tests for User Story 1

- [x] T010 [P] [US1] Add failing tests for accepted private Gary messages, one response path, and preserved manual approval configuration in `tenants/hermes-titus/tests/test_telegram_runtime_contract.py`.

### Implementation for User Story 1

- [x] T011 [US1] Configure the ready-state native Telegram platform, Gary `allow_from`, empty `group_allow_from`, no guest/observed group behavior, and polling-only transport in `tenants/hermes-titus/runtime/start-with-secrets.sh`.
- [x] T012 [US1] Register the native Telegram platform/toolset in `tenants/hermes-titus/config/config.yaml` without adding a custom bridge or new public service.
- [x] T013 [US1] Document the Gary-only Telegram surface and unchanged Titus approval/session boundaries in `tenants/hermes-titus/README.md` and `tenants/hermes-titus/runbooks/telegram-dm-channel.md`.

**Checkpoint**: The source is ready for a one-message Gary canary with no
production secret changes and no sibling-channel mutation.

## Phase 4: User Story 2 - Preserve the Titus access boundary (Priority: P1)

**Goal**: Unauthorized users and every non-private Telegram chat type remain
outside Titus processing.

**Independent Test**: Exercise the routing matrix and inspect only safe outcome
metadata; every case except Gary's private DM must be rejected before a Titus
turn.

### Tests for User Story 2

- [x] T014 [P] [US2] Add failing policy tests for unauthorized senders, groups, supergroups, forums, channels, senderless updates, wildcard policy, and invalid Phase state in `tenants/hermes-titus/tests/test_telegram_runtime_contract.py`.
- [x] T015 [P] [US2] Add content-free telemetry and no-leak assertions for Telegram source, startup output, runbook examples, and runtime policy in `tenants/hermes-titus/tests/test_telegram_runtime_contract.py`.

### Implementation for User Story 2

- [x] T016 [US2] Enforce the adapter-level private-DM policy through the exact `allow_from` and empty `group_allow_from` configuration, with no `group_allowed_chats`, `allowed_chats`, wildcard, or mention-bypass settings in `tenants/hermes-titus/runtime/start-with-secrets.sh`.
- [x] T017 [US2] Add fail-closed unauthorized/group/provider-failure evidence and revocation instructions in `tenants/hermes-titus/runbooks/telegram-dm-channel.md`.

**Checkpoint**: No sender or chat outside the exact private Gary boundary can
reach Titus reasoning, tools, memory, actions, or visible output.

## Phase 5: User Story 3 - Operate and recover the channel safely (Priority: P2)

**Goal**: Operators can qualify, activate, observe, and roll back Telegram
without exposing secrets or changing existing Titus surfaces.

**Independent Test**: Run the quickstart checks, perform disabled-first and
redacted ready-state checks, run one Gary canary, then roll back and verify
Titus/Matrix/AgentMail/memory health.

### Tests for User Story 3

- [x] T018 [P] [US3] Add failing tests for no webhook/public port, native plugin presence, disabled/invalid state, redacted provider identity and connected adapter/polling health, rollback state, replay/restart duplicate suppression, and unchanged Matrix/Teams/email settings in `tenants/hermes-titus/tests/test_telegram_runtime_contract.py`.

### Implementation for User Story 3

- [x] T019 [US3] Add the source-owned Telegram runbook with activation, redacted health evidence, stop conditions, and reversible rollback in `tenants/hermes-titus/runbooks/telegram-dm-channel.md`.
- [x] T020 [US3] Update `tenants/hermes-titus/README.md` with the exact Phase path, one-user boundary, polling/no-ingress decision, and deferred group/webhook scope.
- [x] T021 [US3] Run shell syntax, Python tests, YAML validation, secret/leak scans, and `git diff --check`; record commands and expected safe evidence in `specs/037-titus-telegram-channel/quickstart.md`.
- [ ] T022 [US3] Perform the read-only production preflight and controlled Gary-only canary through the approved Aegis procedure; record redacted results without marking production activation complete until all stop conditions pass.

**Checkpoint**: Telegram can be enabled or rolled back independently while
preserving existing Titus state and communication surfaces.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete artifact synchronization and final quality evidence.

- [x] T023 [P] Refresh `specs/037-titus-telegram-channel/research.md` with final pinned-image and qualification evidence, excluding secrets and private message content.
- [ ] T024 [P] Run read-only Spec Kit/Ringer quality review for the feature-owned artifacts and resolve only approved findings in `specs/037-titus-telegram-channel/`.
- [x] T025 Run the final bounded code-review-and-quality gate across source, tests, runtime security, performance, and verification evidence before merge.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Complete; establishes contracts and qualification docs.
- **Foundational (Phase 2)**: Blocks all implementation and activation work.
- **User Story 1 (Phase 3)**: Depends on the strict readiness boundary from Phase 2.
- **User Story 2 (Phase 4)**: Depends on the native Telegram dispatch configuration from User Story 1.
- **User Story 3 (Phase 5)**: Depends on the accepted interaction and boundary tests.
- **Polish (Phase 6)**: Depends on all required source and qualification checks.

### Parallel Opportunities

- T005 and T006 can run in parallel because they own separate test files.
- T014, T015, and T018 can run in parallel after the initial Telegram tests exist, provided edits to the shared test file are serialized.
- T023 and T024 can run in parallel after implementation and verification.

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational; delivers the MVP interaction path.
- **US2 (P1)**: Depends on US1's adapter configuration so it can prove the same dispatch boundary rejects all other scope.
- **US3 (P2)**: Depends on US1 and US2; contains operational activation and rollback evidence.

## Implementation Strategy

### MVP First

1. Complete the strict Phase contract and failing tests.
2. Implement native Telegram readiness and private-DM configuration.
3. Run local checks and stop for the controlled Gary canary.
4. Do not expand to groups, additional users, webhooks, or Matrix retirement.

### Incremental Delivery

1. Contract tests and loader readiness.
2. Native platform startup configuration.
3. Boundary and no-leak verification.
4. Disabled-first canary and rollback.
5. Final quality gate.
