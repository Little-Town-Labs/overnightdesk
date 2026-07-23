# Tasks: Titus Guarded Outbound Email

**Input**: Design documents from `/specs/025-titus-guarded-email/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by the constitution. Every behavior task follows observed
RED, minimal GREEN, and full regression qualification.

**Organization**: User Story 1 is the independently deployable read-only
containment. User Stories 2 and 3 deliver the guarded sender. User Story 4
qualifies production, rollback, and closeout.

## Phase 1: Setup and Spec Kit artifacts

- [x] T001 Create Feature 025 specification in `specs/025-titus-guarded-email/spec.md`
- [x] T002 [P] Validate requirements in `specs/025-titus-guarded-email/checklists/requirements.md`
- [x] T003 [P] Record source decisions in `specs/025-titus-guarded-email/research.md`
- [x] T004 Define state and verification entities in `specs/025-titus-guarded-email/data-model.md`
- [x] T005 Define the MCP and external request contract in `specs/025-titus-guarded-email/contracts/guarded-email.md`
- [x] T006 Define production qualification and rollback in `specs/025-titus-guarded-email/quickstart.md`

---

## Phase 2: User Story 1 - Immediate read-only containment (Priority: P1)

**Goal**: Preserve Titus email triage while removing every direct hosted
AgentMail mutation.

**Independent Test**: Enumerate Titus's effective AgentMail tools and prove
exactly eight currently available approved reads are present and all mutations
are absent.

### Tests for User Story 1

- [x] T007 [US1] Add an observed-RED exact AgentMail allowlist contract to `tenants/hermes-titus/scripts/qualify.sh`

### Implementation for User Story 1

- [x] T008 [US1] Add the exact hosted read-only tool include list to `tenants/hermes-titus/config/config.yaml`
- [x] T009 [P] [US1] Change containment and failure instructions in `tenants/hermes-titus/skills/agentmail-email/SKILL.md`
- [x] T010 [P] [US1] Document contained authority in `tenants/hermes-titus/README.md`
- [x] T011 [US1] Run focused Titus qualification, YAML parse, shell syntax, secret scan, and diff checks
- [x] T012 [US1] Run security and five-axis code review for the containment diff
- [x] T013 [US1] Commit, push, open, monitor, and merge the containment PRs
- [x] T014 [US1] Run a read-only Aegis preflight of Titus, SecurityTeam, AgentMail metadata, scoped volumes, and unrelated containers
- [x] T015 [US1] Deploy exact merged containment source and restart only `hermes-titus.service`
- [x] T016 [US1] Prove the live effective hosted tool set is exactly read-only and append value-free evidence to `deploys.log`

**Checkpoint**: Titus production email is read-only even if later guarded-send
work is delayed or rolled back.

---

## Phase 3: Foundational guarded-send core

**Purpose**: Build the pure validation, approval, state, screening, provider,
and verification boundary before registering MCP tools.

- [x] T017 Add observed-RED canonical draft and address validation tests in `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_guarded_email.py`
- [x] T018 Add observed-RED signed approval token, expiry, and draft-mismatch tests in `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_guarded_email.py`
- [x] T019 Add observed-RED content-free SQLite state and duplicate/ambiguity tests in `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_guarded_email.py`
- [x] T020 Add observed-RED SecurityTeam denial, timeout, malformed, and transformed-content tests in `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_guarded_email.py`
- [x] T021 Add observed-RED AgentMail send, idempotency, missing-ID, readback-mismatch, and exact-success tests in `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_guarded_email.py`
- [x] T022 Implement canonical draft validation and normalization in `tenants/hermes-titus/mcp-servers/guarded-agentmail/guarded_email.py`
- [x] T023 Implement purpose-derived signed approval tokens in `tenants/hermes-titus/mcp-servers/guarded-agentmail/guarded_email.py`
- [x] T024 Implement the content-free SQLite attempt state machine in `tenants/hermes-titus/mcp-servers/guarded-agentmail/guarded_email.py`
- [x] T025 Implement bounded SecurityTeam and AgentMail clients with safe errors in `tenants/hermes-titus/mcp-servers/guarded-agentmail/guarded_email.py`
- [x] T026 Implement guarded send orchestration, provider readback equality, and idempotent reconciliation in `tenants/hermes-titus/mcp-servers/guarded-agentmail/guarded_email.py`
- [x] T027 Run the focused guarded core suite GREEN and inspect the SQLite schema for zero content fields

**Checkpoint**: The pure service proves every pre-send and post-send failure
contract without an MCP runtime or live provider mutation.

---

## Phase 4: User Story 2 - Approval-bound guarded send (Priority: P2)

**Goal**: Expose a safe preparation tool and exactly one external email
mutation whose content is bound to the owner's reviewed draft.

**Independent Test**: List the local tool schemas, prepare a fixture draft, and
prove changed/expired/invalid approval input never reaches either external
service.

### Tests for User Story 2

- [x] T028 [US2] Add observed-RED MCP schema and annotation tests in `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_server_contract.py`

### Implementation for User Story 2

- [x] T029 [US2] Register `titus_prepare_email_approval` and `titus_send_approved_email` in `tenants/hermes-titus/mcp-servers/guarded-agentmail/server.py`
- [x] T030 [US2] Add structured content-free stderr events in `tenants/hermes-titus/mcp-servers/guarded-agentmail/server.py`
- [x] T031 [US2] Install the guarded MCP source and protected state directory from `tenants/hermes-titus/runtime/prepare-volume.sh`
- [x] T032 [US2] Add the local guarded server while retaining hosted read-only tools in `tenants/hermes-titus/config/config.yaml`
- [x] T033 [US2] Admit and require the exact SecurityTeam binding in `tenants/hermes-titus/runtime/load-phase-env.sh` and `tenants/hermes-titus/runtime/start-with-secrets.sh`
- [x] T034 [US2] Update exact approval, preparation, send, and success-reporting instructions in `tenants/hermes-titus/skills/agentmail-email/SKILL.md`
- [x] T035 [US2] Extend source/runtime/file/secret/tool checks in `tenants/hermes-titus/scripts/qualify.sh`
- [x] T036 [US2] Document guarded architecture, state, and rollback in `tenants/hermes-titus/README.md`
- [x] T037 [US2] Run MCP contract, Python syntax, focused tests, Titus qualification, shell syntax, secret scan, and diff checks

**Checkpoint**: The local candidate has one and only one send mutation, bound
to an exact prepared draft and protected screening credential.

---

## Phase 5: User Story 3 - Provider-verified success (Priority: P3)

**Goal**: Make exact AgentMail readback the only successful delivery result.

**Independent Test**: Use fake and live private responses to prove every
missing/mismatched field remains unverified while exact readback succeeds and
retries do not duplicate.

- [x] T038 [US3] Run the complete fake SecurityTeam/AgentMail failure and retry matrix from `specs/025-titus-guarded-email/quickstart.md`
- [x] T039 [US3] Run dependency audit, full Titus regression qualification, and content-free logging review
- [x] T040 [US3] Run five-axis code, interface, security, observability, and deployment review
- [ ] T041 [US3] Commit, push, open, monitor, and merge the guarded-sender PR

**Checkpoint**: Reviewed merged source is ready for protected secret binding
and production qualification; no live email has been sent.

---

## Phase 6: User Story 4 - Production qualification and rollback (Priority: P4)

**Goal**: Activate the guarded sender for Titus only, prove one harmless exact
message, observe it, and rehearse read-only rollback without unrelated impact.

**Independent Test**: Complete private failure gates, owner-approved live send,
exact readback, duplicate retry proof, restart persistence, and rollback while
all scoped unrelated identities and volumes remain.

- [ ] T042 [US4] Run and record the final read-only Aegis/container/route/volume/Feature-024 baseline
- [ ] T043 [US4] Bind the existing SecurityTeam caller value into the exact Titus Phase runtime path without exposing it
- [ ] T044 [US4] Stage exact merged source, restart only Titus, and verify hosted reads plus local guarded tools
- [ ] T045 [US4] Run content-free private validation, SecurityTeam failure, and zero-provider-send gates
- [ ] T046 [US4] Restart only Titus and prove tool, secret, state, dashboard, chat, memory, and intake persistence
- [ ] T047 [US4] Obtain owner approval for one exact harmless test draft and send it once through the guarded tool
- [ ] T048 [US4] Independently verify exact provider readback and same-logical-send no-duplicate retry
- [ ] T049 [US4] Observe one health interval with zero relevant Titus, SecurityTeam, Nginx, or Ops errors
- [ ] T050 [US4] Rehearse rollback to hosted read-only email and prove all data, volumes, routes, and unrelated containers preserved
- [ ] T051 [US4] Restore and requalify the guarded candidate or retain read-only state by explicit owner direction
- [ ] T052 [US4] Append every production result to `/home/frosted639/src/overnightdesk-suite/deploys.log`

---

## Phase 7: Standards and closeout

- [ ] T053 Update `overnightdesk-platform-standard` WHY/HOW/WHAT contracts for the accepted email authority boundary
- [ ] T054 Refresh the exact merged standard on Aegis using `/app/standard/{WHY,HOW,WHAT}` and `KNOWLEDGE_DIR=/app/standard/WHAT`
- [ ] T055 Restart only `overnightdesk-ops` if mounted knowledge changed and prove its health and hashes
- [ ] T056 Publish Feature 025 evidence, task status, and roadmap closeout in `specs/025-titus-guarded-email/` and `.specify/roadmap.md`
- [ ] T057 Commit, push, open, monitor, merge, and deploy the evidence/standard PRs
- [ ] T058 Confirm production is either guarded-send active or explicitly read-only, then decide whether Feature 024 T037 resumes

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup artifacts T001-T006 are complete.
- Containment T007-T016 is independently deployable and blocks all later live
  work, but not local guarded-core development after T008 is qualified.
- Guarded core T017-T027 blocks MCP/runtime integration T028-T037.
- T038-T041 blocks all protected secret and production mutations.
- Production T042-T052 is sequential at every external mutation/verification
  boundary.
- Standards/closeout T053-T058 depends on the accepted final runtime state.

### Parallel Opportunities

- T009 and T010 touch separate documentation files after T008.
- RED tests T017-T021 may be authored independently but must all fail before
  their implementation tasks.
- T053 standard edits may be prepared only after the final runtime state is
  known; they are not speculative.

## Implementation Strategy

1. Ship User Story 1 immediately as the safety MVP.
2. Build the guarded core entirely against fakes with TDD.
3. Integrate the two-tool local MCP boundary without restoring hosted writes.
4. Merge reviewed source before any new secret binding or live email.
5. Qualify every failure path before asking the owner to approve the one live
   message.
6. Keep the read-only state as the durable rollback throughout.

## Notes

- Feature 024 T037 remains paused until T058.
- No task authorizes a recipient, subject, body, or test send on the owner's
  behalf; T047 requires the owner's exact draft approval.
- No direct AgentMail mutation tool is restored, including during rollback.
