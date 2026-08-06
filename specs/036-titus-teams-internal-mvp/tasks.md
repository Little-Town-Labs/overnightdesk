# Tasks: Titus TTS-Internal Channel MVP

**Input**: Design documents from `/specs/036-titus-teams-internal-mvp/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Execution boundary**: This task list authorizes the source and qualification work
being performed on the feature branch. It does not authorize production activation,
secret enrollment, Teams installation, commit, push, or deployment.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the source-controlled contracts and documentation surfaces for the one-channel, mention-driven MVP.

- [x] T001 [P] Create the secret-free Teams app manifest template with normal conversational bot scopes and no all-message RSC permission in `tenants/hermes-titus/teams/manifest.template.json`.
- [x] T002 [P] Create the Titus Teams behavior skill covering explicit `@Titus` interaction, explicit memory promotion, untrusted content, and existing approvals in `tenants/hermes-titus/skills/titus-teams-channel/SKILL.md`.
- [x] T003 [P] Create the operator qualification and rollback runbook for one-channel `@Titus` interaction in `tenants/hermes-titus/runbooks/teams-internal-channel.md`.
- [x] T004 Update the Titus tenant README with the single-channel, mention-only boundary, separate meeting identity, disabled-first activation, and deferred passive-reading capabilities in `tenants/hermes-titus/README.md`.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish fail-closed identity, channel, mention, runtime, and evidence boundaries before interaction is enabled.

- [x] T005 Add the exact single-Team/single-channel MVP policy and disabled default to `tenants/hermes-titus/config/config.yaml` without enabling Teams in the source baseline.
- [x] T006 Update the allowlisted Teams Phase key contract and fail-closed readiness checks in `tenants/hermes-titus/runtime/load-phase-env.sh`, preserving `TEAMS_ALLOW_ALL_USERS=false` and separating `TEAMS_*` from `MSGRAPH_*`.
- [x] T007 [P] Add runtime projection, secret-leak, disabled-state, no-RSC, and wildcard-allowlist tests in `tenants/hermes-titus/tests/test_teams_runtime_contract.py`.
- [x] T008 [P] Add reusable authorized-user, exact-channel, non-mention, mention, replay, and safe-evidence fixtures in `tenants/hermes-titus/tests/fixtures/teams_channel.py`.
- [x] T009 Define the mention-only inbound routing and safe-output contract in `specs/036-titus-teams-internal-mvp/contracts/teams-channel-routing.md` as the test oracle for message handling.
- [x] T010 Verify the canonical codebase-memory index status and record targeted source paths for the Teams runtime, Titus prompt, Phase loader, and meeting-processor boundary in `specs/036-titus-teams-internal-mvp/research.md`.

**Checkpoint**: The source contract is disabled by default, exact users and channel identities are required, ordinary non-mentioned messages are ignored, and no meeting credentials or protected content cross the conversational boundary.

## Phase 3: User Story 1 - Interact with Titus in TTS-Internal (Priority: P1) 🎯 MVP

**Goal**: Gary and Austin can explicitly address Titus in `TTS-Internal` and receive a response or safe refusal through the existing Titus interaction and approval path.

**Independent Test**: Run the authorized Gary and Austin `@Titus` cases and verify same-conversation response, safe refusal, and preserved action approval.

### Tests for User Story 1

- [x] T011 [P] [US1] Add failing routing tests for authorized Gary and Austin `@Titus` messages, same-channel response, unauthorized sender denial, and malformed mention handling in `tenants/hermes-titus/tests/test_teams_channel_policy.py`.
- [x] T012 [P] [US1] Add failing approval-boundary tests proving an explicit Teams request cannot bypass existing Titus approval or create new autonomous authority in `tenants/hermes-titus/tests/test_teams_channel_policy.py`.

### Implementation for User Story 1

- [x] T013 [US1] Configure the pinned Hermes Teams adapter and repo-owned platform override to use the approved Teams identity, public message endpoint, port, exact user allowlist, exact channel policy, and mention-only behavior in `tenants/hermes-titus/config/config.yaml`, `tenants/hermes-titus/runtime/load-phase-env.sh`, and `tenants/hermes-titus/plugins/platforms/titus_teams/`.
- [x] T014 [US1] Apply the Titus Teams behavior instructions to the normal Hermes interaction path in `tenants/hermes-titus/skills/titus-teams-channel/SKILL.md` and `tenants/hermes-titus/config/SOUL.md`.
- [x] T015 [US1] Document the verified Hermes adapter authorization and mention-routing seam, including any required narrow change or a fail-closed scope stop, in `specs/036-titus-teams-internal-mvp/research.md` and `tenants/hermes-titus/runbooks/teams-internal-channel.md`.

**Checkpoint**: Both authorized operators can independently exercise `@Titus`; unauthorized, malformed, non-mentioned, and unsupported requests do not reach Titus reasoning or actions.

## Phase 4: User Story 2 - Preserve channel and user boundaries (Priority: P1)

**Goal**: Separate project channels, unauthorized users, and ordinary non-mentioned messages remain outside Titus processing, memory, tools, and visible responses.

**Independent Test**: Exercise authorized, unauthorized, exact-channel, excluded-channel, and non-mention cases and verify a fail-closed routing matrix.

### Tests for User Story 2

- [x] T016 [P] [US2] Add failing tests proving project-channel messages are rejected before Titus processing, including when the project channel shares the containing Team, in `tenants/hermes-titus/tests/test_teams_channel_policy.py`.
- [x] T017 [P] [US2] Add failing tests proving ordinary non-mentioned messages produce no inference, context entry, memory write, tool call, action, or reply in `tenants/hermes-titus/tests/test_teams_channel_policy.py`.
- [x] T018 [P] [US2] Add failing tests for missing, ambiguous, invalid, or wildcard channel/user policy in `tenants/hermes-titus/tests/test_teams_runtime_contract.py`.

### Implementation for User Story 2

- [x] T019 [US2] Enforce exact Team/channel, principal, and explicit-mention checks before Titus dispatch in the supported Hermes Teams routing surface, using `tenants/hermes-titus/tests/fixtures/teams_channel.py` as the policy oracle.
- [x] T020 [US2] Add fail-closed channel, principal, and mention-policy documentation, revocation steps, and project-channel verification to `tenants/hermes-titus/runbooks/teams-internal-channel.md`.
- [x] T021 [US2] Add safe routing outcome events and redaction assertions without message bodies, tokens, or protected identifiers in `tenants/hermes-titus/tests/test_teams_runtime_contract.py` and the existing Titus observability surface.

**Checkpoint**: A message that is not from an authorized user in the exact approved channel and explicitly addressed to Titus cannot enter Titus processing.

## Phase 5: User Story 3 - Explicitly promote information to durable memory (Priority: P2)

**Goal**: Authorized operators can explicitly request durable memory during an `@Titus` interaction while ordinary channel traffic remains non-durable and unprocessed.

**Independent Test**: Compare non-mentioned, explicit-memory, unsafe-memory, and replayed requests and verify source-tagged, at-most-once promotion.

### Tests for User Story 3

- [ ] T022 [P] [US3] Add failing tests proving non-mentioned messages do not create durable memory and explicit Gary/Austin requests create at most one source-tagged promotion in `tenants/hermes-titus/tests/test_teams_channel_policy.py`.
- [ ] T023 [P] [US3] Add failing tests for memory requests containing prompt injection, authority expansion, credentials, or excluded-channel references in `tenants/hermes-titus/tests/test_teams_channel_policy.py`.
- [ ] T024 [US3] Add replay/restart tests proving an explicit memory request cannot create duplicate durable entries in `tenants/hermes-titus/tests/test_teams_channel_policy.py`.

### Implementation for User Story 3

- [x] T025 [US3] Configure the existing Titus memory behavior to require explicit promotion and retain `TTS-Internal` as source context in `tenants/hermes-titus/skills/titus-teams-channel/SKILL.md` and `tenants/hermes-titus/config/SOUL.md`.
- [x] T026 [US3] Reuse the native Hermes memory capability for source-tagged promotion without adding a new memory database or cross-channel import.
- [x] T027 [US3] Document memory source, rejection, retention, and rollback behavior in `tenants/hermes-titus/runbooks/teams-internal-channel.md`.

**Checkpoint**: Only an authorized explicit `@Titus` request can promote selected information to Titus memory.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete quality, operational, and handoff evidence without activating production.

- [ ] T028 [P] Add the full message matrix, stop conditions, and safe evidence commands to `tenants/hermes-titus/runbooks/teams-internal-channel.md` and `specs/036-titus-teams-internal-mvp/quickstart.md`.
- [ ] T029 [P] Update `tenants/hermes-titus/README.md` and `specs/036-titus-teams-internal-mvp/research.md` with the qualified adapter, mention-only manifest, Team/channel, user-policy, and meeting-identity decisions without literal secrets or protected identifiers.
- [ ] T030 [P] Run shell syntax, Python contract/security, manifest validation, leak scans, and `git diff --check` for the feature-owned paths; record commands and expected evidence in `specs/036-titus-teams-internal-mvp/quickstart.md`.
- [ ] T031 Verify the existing meeting processor, Matrix, email intake, and Titus health surfaces remain unchanged by the Teams MVP in `tenants/hermes-titus/runbooks/teams-internal-channel.md`.
- [ ] T032 Prepare disabled-first activation, independent Teams disable/rollback, and no-production-mutation handoff evidence in `tenants/hermes-titus/runbooks/teams-internal-channel.md`.
- [ ] T033 Refresh canonical codebase-memory impact and verify graph conclusions with targeted reads for the final feature-owned paths in `specs/036-titus-teams-internal-mvp/research.md`.
- [ ] T034 Run the read-only Spec Kit/Ringer quality handoff and resolve only approved artifact findings before any later implementation phase in `specs/036-titus-teams-internal-mvp/`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No implementation dependency; establishes source contracts and documentation surfaces.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; establishes explicit interaction first.
- **User Story 2 (Phase 4)**: Depends on Foundational and the US1 dispatch seam; its boundary enforcement gates interaction.
- **User Story 3 (Phase 5)**: Depends on the accepted explicit interaction and authorization boundaries from User Stories 1–2.
- **Polish (Phase 6)**: Depends on the desired MVP stories and remains read-only with respect to production.

### Parallel Opportunities

- T001–T003 can run in parallel because they own separate new files.
- T007–T009 can run in parallel after the configuration boundary is agreed.
- T011–T012, T016–T018, and T022–T024 can run in parallel when edits are serialized or split across disjoint test surfaces.
- T028–T030 can run in parallel after story acceptance because they own separate documentation or verification surfaces.

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational policy work.
2. Complete US1 and prove explicit Gary/Austin `@Titus` interaction.
3. Complete US2 boundary enforcement, including the non-mention gate.
4. Complete US3 explicit memory promotion.
5. Run the one-channel canary without passive reading or all-message RSC delivery.
6. Stop before production activation unless a separate owner authorization is provided.

### Deferred Follow-up

Passive ordinary-message reading, all-message RSC delivery, automatic context
ingestion, passive memory behavior, additional channels, additional users,
attachments, and meeting artifacts require a separate reviewed scope expansion.

### Current implementation checkpoint

T001-T021 and T025-T027 are implemented on the feature branch. T022-T024
remain open for runtime qualification of explicit native-memory writes and
replay behavior. T028-T034 remain
the final handoff and quality evidence work. Production activation, secret
enrollment, Teams installation, commit, push, and deployment remain out of
scope for this branch activity.
