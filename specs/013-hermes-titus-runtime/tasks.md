# Tasks: Hermes Titus Runtime

**Input**: Design documents from `specs/013-hermes-titus-runtime/`

**Tests**: Required by the platform constitution. Test tasks precede implementation tasks.

## Phase 1: Setup

- [x] T001 Create the Titus tenant source directories described in `specs/013-hermes-titus-runtime/plan.md`
- [x] T002 Add the source qualification test in `tenants/hermes-titus/scripts/qualify.sh` and confirm it fails before runtime assets exist

## Phase 2: Foundational

- [x] T003 Implement the exact-path Phase loader in `tenants/hermes-titus/runtime/load-phase-env.sh`
- [x] T004 Implement the secret-sourcing container entrypoint in `tenants/hermes-titus/runtime/start-with-secrets.sh`
- [x] T005 Implement the persistent volume preparation and pinned dependency staging in `tenants/hermes-titus/runtime/prepare-volume.sh`
- [x] T006 Implement the hardened lifecycle unit in `tenants/hermes-titus/runtime/hermes-titus.service`
- [x] T007 Re-run `tenants/hermes-titus/scripts/qualify.sh` and make the foundational contract pass

## Phase 3: User Story 1 - Run Titus Safely

- [x] T008 [US1] Implement the Aegis install, stop, and verify commands in `tenants/hermes-titus/scripts/deploy-aegis.sh`
- [x] T009 [US1] Document tenant ownership and operator lifecycle in `tenants/hermes-titus/README.md`
- [x] T010 [US1] Stage and verify the fresh `hermes-titus-data` volume on ARM64 using `tenants/hermes-titus/scripts/deploy-aegis.sh`

## Phase 4: User Story 2 - Monitor Through Control Tower

- [x] T011 [US2] Install the reviewed read-only Control Tower agent skill under `tenants/hermes-titus/skills/control-tower-hermes/`
- [x] T012 [US2] Verify a live token-bound Control Tower session without printing the caller token

## Phase 5: User Story 3 - Retain Private Agent Memory

- [x] T013 [US3] Install TencentDB Agent Memory 0.3.6 and the `memory_tencentdb` Hermes provider into the Titus volume
- [x] T014 [US3] Verify ARM64 imports, gateway health, synthetic capture/search, restart persistence, and volume isolation

## Phase 6: User Story 4 - Prepare TTS Microsoft Teams

- [x] T015 [US4] Add Teams placeholder variables under `/agents/hermes-titus/teams` in Phase without printing values
- [x] T016 [US4] Install pinned Teams adapter dependencies and prove placeholder configuration leaves Teams disabled
- [x] T017 [US4] Document the later credential replacement, allow-list, TLS ingress, and app-install activation steps in `tenants/hermes-titus/README.md`

## Phase 7: User Story 5 - Use the Dedicated Titus Inbox

- [x] T018 [US5] Add the approval-gated AgentMail skill under `tenants/hermes-titus/skills/agentmail-email/`
- [x] T019 [US5] Configure the hosted AgentMail MCP with environment-interpolated authentication and verify tool discovery plus the dedicated inbox

## Phase 8: Polish and Cross-Cutting Concerns

- [x] T020 Run the complete local qualification and live production verification
- [x] T021 Run `code-review-and-quality` against the feature diff and remediate required findings
- [x] T022 Update the platform standard and append the production result to `/home/frosted639/src/overnightdesk-suite/deploys.log`
- [x] T023 Mark completed tasks and synchronize the Spec Kit artifacts with deployed reality

## Dependencies and Execution Order

- Setup blocks all implementation.
- Foundational scripts block the live deployment.
- The core runtime and Control Tower binding may be verified before Teams activation.
- Memory is part of the initial Titus install and must pass before production readiness.
- Teams credential placeholders are part of initial preparation; Teams public ingress and app installation remain a later separately authorized activation.

## Implementation Strategy

Deliver the core Titus runtime, Control Tower binding, and persistent memory as the MVP. Treat Microsoft Teams as an explicit dormant integration until TTS credentials and allowed-user IDs are supplied. Every deployment step must be reversible without deleting `hermes-titus-data`.
