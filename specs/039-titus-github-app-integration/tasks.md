# Tasks: Titus GitHub App Integration

**Input**: Design documents from `/specs/039-titus-github-app-integration/`

## Phase 1: Setup

- [x] T001 Record the Titus-only GitHub App scope in `specs/039-titus-github-app-integration/spec.md` and `plan.md`.
- [x] T002 Record the `/agents/github` contract and native Hermes provider findings in `specs/039-titus-github-app-integration/research.md`.

## Phase 2: User Story 1 — Load Titus's GitHub App identity (P1)

- [x] T003 [US1] Add synthetic ready/invalid Phase projection tests in `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_runtime_projection.py`.
- [x] T004 [US1] Project `/agents/github` metadata and write the protected key file in `tenants/hermes-titus/runtime/load-phase-env.sh`.
- [x] T005 [US1] Validate GitHub state and key-file availability in `tenants/hermes-titus/runtime/start-with-secrets.sh`.
- [x] T006 [US1] Add the read-only key-file mount in `tenants/hermes-titus/runtime/run-container.sh`.

## Phase 3: User Story 2 — Verify GitHub provider readiness (P1)

- [x] T007 [US2] Add provider authentication and installation allowlist checks in `tenants/hermes-titus/scripts/deploy-aegis.sh`.
- [x] T008 [US2] Add Titus GitHub runtime contract coverage in `tenants/hermes-titus/tests/test_github_runtime_contract.py`.

## Phase 4: User Story 3 — Preserve authority separation (P1)

- [x] T009 [US3] Preserve the existing Control Tower profile and add secret/capability boundaries to `tenants/hermes-titus/runbooks/github-app-integration.md` and `tenants/hermes-titus/README.md`.
- [x] T010 [US3] Include GitHub checks in the Titus source qualification entrypoint at `tenants/hermes-titus/scripts/qualify.sh`.

## Phase 5: Polish and verification

- [x] T011 Run focused Titus tests, shell syntax checks, and `git diff --check`.
- [ ] T012 After merge and explicit production approval, deploy only Titus and run the live verifier.

## Dependencies and execution order

- T001–T002 establish scope and research.
- T003 precedes T004–T006.
- T004–T006 precede T007.
- T007–T011 complete the reviewable source change.
- T012 is deliberately deferred until merge and separate production approval.
