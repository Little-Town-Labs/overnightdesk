# Tasks: Eve Practice Agent

**Input**: Design documents from `specs/046-eve-practice-agent/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/local-cli.md`, `quickstart.md`

**Tests**: Required. Command-boundary logic follows red-green-refactor, and the compiled agent is verified through an eve deterministic eval.

## Phase 1: Setup

**Purpose**: Establish the isolated Node.js 24 application boundary and reproducible dependency set.

- [x] T001 Create package, TypeScript, and ignore configuration in `experiments/eve-practice-agent/package.json`, `experiments/eve-practice-agent/tsconfig.json`, and `experiments/eve-practice-agent/.gitignore`
- [x] T002 Generate the pinned npm lockfile at `experiments/eve-practice-agent/package-lock.json` and verify installation under Node.js 24

---

## Phase 2: Foundational Safety Contracts

**Purpose**: Define failing tests for the configuration and authentication boundaries before runtime code.

**Checkpoint**: Unit tests exist and fail because the production modules have not yet been implemented.

- [x] T003 [P] Add failing model-mode tests for default, mock, and rejected values in `experiments/eve-practice-agent/agent/lib/model.test.ts`
- [x] T004 [P] Add failing command-wrapper tests for allowlisting, missing paths, relative paths, and repository-contained paths in `experiments/eve-practice-agent/scripts/practice-command.test.ts`

---

## Phase 3: User Story 1 - Run a Safe Practice Conversation (Priority: P1) — MVP

**Goal**: Compile and run one text-only eve root agent backed by the ChatGPT subscription adapter.

**Independent Test**: Run `npm run info:mock` and verify one root agent, mock model selection, and no authored tools, connections, channels, schedules, skills, sandboxes, or subagents; then use the documented manual live smoke command after dedicated login.

- [x] T005 [US1] Implement validated live and mock model selection in `experiments/eve-practice-agent/agent/lib/model.ts` until T003 passes
- [x] T006 [US1] Define the bounded root agent and instructions in `experiments/eve-practice-agent/agent/agent.ts` and `experiments/eve-practice-agent/agent/instructions.md`
- [x] T007 [US1] Add mock discovery, capability assertion, and build scripts in `experiments/eve-practice-agent/package.json` and `experiments/eve-practice-agent/scripts/verify-surface.mjs`; verify `npm run info:mock` plus `npm run build:mock`

**Checkpoint**: The agent compiles and its discovered capability surface is text-only.

---

## Phase 4: User Story 2 - Detect Missing Authentication Safely (Priority: P2)

**Goal**: Enforce a dedicated Codex home and expose only allowlisted local auth/runtime commands.

**Independent Test**: Run the command unit tests with no credentials, then invoke a live command without `EVE_PRACTICE_CODEX_HOME` and verify it exits before starting a child process without printing environment values.

- [x] T008 [US2] Implement the allowlisted credential-home command boundary in `experiments/eve-practice-agent/scripts/practice-command.mjs` until T004 passes
- [x] T009 [US2] Wire `auth:login`, `auth:status`, `auth:logout`, and `dev` through the command boundary in `experiments/eve-practice-agent/package.json`
- [x] T010 [US2] Document dedicated login, status, logout, sanitized failures, and live smoke steps in `experiments/eve-practice-agent/README.md`

**Checkpoint**: Live commands cannot run without an explicit safe credential directory, and no credential material is read or logged by application code.

---

## Phase 5: User Story 3 - Verify the Scaffold Without Model Usage (Priority: P3)

**Goal**: Exercise the compiled eve runtime deterministically without a provider request.

**Independent Test**: Run `npm run eval:mock` and verify a successful deterministic reply with `usedNoTools()`; run `npm run check` with no model or authentication environment configured.

- [x] T011 [P] [US3] Add an empty deterministic eval configuration in `experiments/eve-practice-agent/evals/evals.config.ts`
- [x] T012 [US3] Add provider-free reply, no-tools, and empty-input evals in `experiments/eve-practice-agent/evals/smoke.eval.ts` and `experiments/eve-practice-agent/evals/empty-input.eval.ts`
- [x] T013 [US3] Compose the complete provider-free check command in `experiments/eve-practice-agent/package.json` and verify it makes no model request

**Checkpoint**: Type checking, unit tests, eve discovery, eve build, and the deterministic eval all pass under Node.js 24 without credentials.

---

## Phase 6: Documentation and Quality Gate

**Purpose**: Make the experiment's status and architecture durable, then verify supply-chain and repository boundaries.

- [x] T014 [P] Record the local-only eve and dedicated Codex-home decision in `docs/decisions/006-isolate-eve-practice-agent.md`
- [x] T015 [P] Add the experimental directory to the root project map and link its guide in `README.md`
- [x] T016 Synchronize completed evidence in `specs/046-eve-practice-agent/quickstart.md` and `specs/046-eve-practice-agent/tasks.md`
- [x] T017 Run `npm audit --audit-level=high`, scan the feature diff for secret-like values and forbidden production surfaces, and record any evidence-backed disposition in `specs/046-eve-practice-agent/quickstart.md`
- [x] T018 Run the full `npm run check` quality gate and inspect the final diff against `specs/046-eve-practice-agent/spec.md`

---

## Dependencies and Execution Order

- Setup: T001 -> T002
- Foundational tests: T002 -> T003 and T004 (parallel)
- User Story 1: T003 -> T005 -> T006 -> T007
- User Story 2: T004 -> T008 -> T009 -> T010
- User Story 3: T006 -> T011 -> T012 -> T013
- Closeout: T007, T010, and T013 -> T014 and T015 (parallel) -> T016 -> T017 -> T018

## Parallel Opportunities

- T003 and T004 touch separate modules and can be written independently.
- T011 can be authored independently after the root agent exists; T014 and T015 are independent documentation surfaces.
- Implementation remains in the accountable lead session because current session policy does not authorize delegated sub-agents.

## Implementation Strategy

1. Complete setup and prove both behavioral test files fail for the expected missing-module reasons.
2. Deliver User Story 1 as the MVP: a compiled, capability-empty, subscription-backed local agent definition.
3. Add the dedicated authentication wrapper and its operator guidance.
4. Add the deterministic runtime eval and aggregate provider-free quality gate.
5. Finish with ADR, root documentation, dependency audit, secret/surface scans, and a bounded code review.

No task deploys to Aegis or Vercel, changes a named runtime, creates an external integration beyond the selected model call, or handles a real credential value.
