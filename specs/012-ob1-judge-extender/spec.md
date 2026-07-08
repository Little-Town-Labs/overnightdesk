# Feature Specification: OB1 Judge Extender

**Feature Branch**: `012-ob1-judge-extender`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Build OB1 Judge Extender into ob1-mcp: governed judge recall, schema-validated action proposals and decisions, review queue, memory inspector, and golden runtime harnesses while keeping OB1 as continuity layer, not runtime or orchestrator."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recall Before Risky Actions (Priority: P1)

As an agent runtime preparing a side-effectual action, I need OB1 to return scoped, provenance-labeled, policy-aware recall so the judge can decide with trusted context instead of hidden or stale memory.

**Why this priority**: Recall is the smallest useful judge continuity feature and can be built on top of existing `search_thoughts` and `list_thoughts` behavior.

**Independent Test**: Seed representative memory entries, call judge recall for a proposed action, and verify the response includes only allowed memory with provenance, use policy, confidence, source, freshness, and warnings.

**Acceptance Scenarios**:

1. **Given** confirmed and observed memories exist for a workspace, **When** a runtime asks for recall before an external side effect, **Then** OB1 returns instruction-grade memories with source and use policy metadata.
2. **Given** generated or inferred memories exist, **When** recall is restricted to instruction-grade use, **Then** OB1 excludes them from automatic instruction injection and may surface warnings or evidence-only records only when requested.
3. **Given** disputed, inactive, superseded, or restricted memories exist, **When** recall defaults are used, **Then** OB1 does not inject those memories automatically.

---

### User Story 2 - Validate Proposals and Decisions (Priority: P1)

As an operator and runtime integrator, I need OB1 to validate action proposal and judge decision envelopes so stored judgment history is consistent, idempotent, and usable by future runtimes.

**Why this priority**: OB1 already stores proposals and decisions, but stronger validation is required before the records can be trusted as a cross-runtime contract.

**Independent Test**: Submit valid and invalid proposal and decision envelopes through the MCP tools and verify valid records are stored idempotently while malformed, unsafe, or unsupported envelopes are rejected.

**Acceptance Scenarios**:

1. **Given** a valid action proposal with action risk, tool target, authorization, evidence, consequence, rollback, and sensitivity fields, **When** it is submitted twice with the same idempotency key, **Then** OB1 stores one stable proposal record.
2. **Given** a judge decision with `allow`, `block`, `revise`, or `escalate`, checks, memory used, memory candidates, and review provenance, **When** it is submitted, **Then** OB1 stores a compact decision record linked to the proposal when possible.
3. **Given** a proposal or decision contains an unsupported enum value, missing required identity, raw transcript dump, or full secret-like tool arguments, **When** it is submitted, **Then** OB1 rejects it before storage.

---

### User Story 3 - Review Future-Facing Lessons (Priority: P2)

As a human operator, I need judge-generated lessons and constraints to enter a review queue before they can become instruction-grade memory.

**Why this priority**: Review prevents inferred or generated lessons from silently becoming hidden standing instructions.

**Independent Test**: Record a judge decision containing reusable lessons, list the review queue, and apply review actions that confirm, downgrade, restrict, reject, dispute, or supersede candidates.

**Acceptance Scenarios**:

1. **Given** a judge decision proposes future-facing lessons, **When** the decision is written back, **Then** OB1 exposes review candidates rather than auto-confirming them.
2. **Given** a reviewer confirms a candidate, **When** the action is applied, **Then** the resulting memory becomes instruction-grade and records confirmation metadata.
3. **Given** a reviewer marks a candidate evidence-only or restricted, **When** recall runs later, **Then** that memory is not injected as an instruction.

---

### User Story 4 - Inspect Memory and Decisions (Priority: P2)

As an operator debugging judge behavior, I need to inspect why a memory exists, what created it, how it was used, and what future actions it may influence.

**Why this priority**: Inspector behavior is required for trust and for diagnosing bad recall, stale policy, or disputed memories.

**Independent Test**: Create memory and decision records, call the inspector for a memory, and verify it shows source, provenance, use policy, confirmation/restriction status, related decisions, usage, conflicts, supersession, and stale status.

**Acceptance Scenarios**:

1. **Given** a memory created from a reviewed judge lesson, **When** an operator inspects it, **Then** OB1 shows the source decision, review action, provenance, and use policy.
2. **Given** a memory has been used in one or more judge decisions, **When** it is inspected, **Then** OB1 lists those decisions and whether the memory was used as instruction, evidence, or background.
3. **Given** a memory is inactive, superseded, disputed, stale, or restricted, **When** it is inspected, **Then** OB1 explains why it should not be injected automatically.

---

### User Story 5 - Prove Runtime Portability (Priority: P3)

As a platform maintainer, I need golden runtime harnesses that prove the judge extender contract works beyond one hard-coded runtime.

**Why this priority**: OB1 must remain a continuity layer. Harnesses keep the adapter boundary honest without making OB1 the orchestrator.

**Independent Test**: Run Code Review Memory and TaskFlow Work Log fixtures through recall, proposal, decision, write-back, and review flows without requiring live production services.

**Acceptance Scenarios**:

1. **Given** a Code Review Memory fixture, **When** the harness runs, **Then** OB1 recalls repo rules and prior corrections, validates a proposed code action, records a decision, and preserves reusable lessons for review.
2. **Given** a TaskFlow Work Log fixture, **When** the harness runs, **Then** OB1 recalls task context, blockers, constraints, and unresolved questions before recording a supported handoff/tool decision.

### Edge Cases

- Recall returns no matching memory; the response must be explicit and the judge must not infer hidden instructions.
- Requested recall includes stale, disputed, inactive, superseded, or restricted memory; defaults must exclude automatic injection and provide warnings only when useful.
- A caller retries proposal or decision write-back after a timeout; idempotency keys must prevent duplicate records.
- A generated lesson conflicts with confirmed memory; review must preserve the conflict and avoid instruction-grade promotion until resolved.
- Submitted payloads include raw transcript dumps, model reasoning traces, full tool arguments, or secret-like values; OB1 must reject or redact according to existing guard behavior and retention policy.
- OB1 storage or embedding is unavailable; runtime adapters should fail closed for high-risk execution or fail open only for explicitly read-only recall paths.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: OB1 MUST provide a judge recall operation that accepts workspace, project, task, flow, action, tool, target system, entity, scope, limit, and allowed use policy inputs.
- **FR-002**: Judge recall MUST return memories with source, provenance, use policy, confidence, freshness, scope, and warning metadata.
- **FR-003**: Judge recall MUST default to excluding memories that are unconfirmed future-facing, inactive, superseded, disputed, stale, low-confidence, or marked `do_not_inject_automatically`.
- **FR-004**: OB1 MUST validate action proposal envelopes before storage, including schema version, identity fields, risk class, tool kind, authorization references, evidence references, expected consequences, rollback, and sensitivity.
- **FR-005**: OB1 MUST validate judge decision envelopes before storage, including decision enum, confidence, judge kind, checks, required revision, escalation, memory used, memory candidates, and review provenance.
- **FR-006**: Proposal and decision writes MUST remain idempotent by idempotency key.
- **FR-007**: OB1 MUST reject unsupported enum values and missing required identity fields in recall, proposal, decision, review, and inspector inputs.
- **FR-008**: OB1 MUST reject raw transcript dumps, model reasoning traces, and full tool argument payloads unless an approved retention reference is provided.
- **FR-009**: OB1 MUST expose a review queue for generated or inferred future-facing memory candidates from judge decisions.
- **FR-010**: Review actions MUST include confirm, edit, mark evidence-only, restrict scope, mark stale, reject, dispute, and supersede.
- **FR-011**: Confirmed review candidates MUST become instruction-grade memory only through a deliberate review action.
- **FR-012**: Evidence-only, restricted, disputed, stale, or rejected candidates MUST NOT be injected automatically as instructions.
- **FR-013**: OB1 MUST expose a memory inspector that explains source, provenance, use policy, freshness, confirmation, review status, related decisions, usage, conflicts, supersession, and automatic-injection eligibility.
- **FR-014**: OB1 MUST include local golden harnesses for Code Review Memory and TaskFlow Work Log flows.
- **FR-015**: OB1 MUST keep runtime-specific mapping in thin adapters or fixtures and keep core contracts runtime-independent.
- **FR-016**: OB1 MUST preserve existing memory provenance values, with `confirmed` serving the same role as the guide's `user_confirmed`.
- **FR-017**: OB1 MUST include automated tests for validation failures, recall filtering, idempotent write-back, review gating, and inspector output.

### Key Entities *(include if feature involves data)*

- **Judge Recall Request**: A runtime request for scoped memories and policy hits before a judge decision.
- **Judge Recall Response**: Provenance-labeled memories, policy hits, and warnings returned to a judge.
- **Action Proposal**: The structured request describing the action an actor agent wants to take.
- **Judge Decision**: The compact allow/block/revise/escalate outcome and associated checks.
- **Review Candidate**: A generated or inferred future-facing lesson, constraint, failure, or open question awaiting human review.
- **Review Action**: A human or platform-trusted action that confirms, edits, restricts, downgrades, rejects, disputes, marks stale, or supersedes a candidate.
- **Memory Inspector View**: An explainability view over one memory and its related source, review, and usage records.
- **Runtime Harness Fixture**: Local sample flow proving the contracts for one runtime scenario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A local test can run a complete recall -> proposal -> decision -> write-back path for all four decisions: allow, block, revise, and escalate.
- **SC-002**: Invalid proposal and decision payload tests cover missing required fields, unsupported enums, unsafe raw payloads, and idempotency retries.
- **SC-003**: Recall tests prove instruction-grade defaults exclude generated, inferred, disputed, inactive, superseded, and restricted memory from automatic injection.
- **SC-004**: Review queue tests prove generated or inferred future-facing candidates cannot become instruction-grade without an explicit review action.
- **SC-005**: Inspector tests prove an operator can identify why a memory exists, which decision or source created it, how it was used, and whether it can influence future actions.
- **SC-006**: Code Review Memory and TaskFlow Work Log harnesses run locally without live production dependencies.
- **SC-007**: Existing `ob1-mcp` memory tools and tests continue to pass after the judge extender additions.

## Assumptions

- The first integration surface is MCP tools in `ob1-mcp`; REST endpoints are out of scope for the first implementation unless added as a later wrapper.
- Existing Postgres schema `ace_memory`, current migrations, and existing MCP auth remain in place.
- Existing provenance value `confirmed` remains canonical for user-confirmed memory.
- Review queue storage may start as DB-backed records derived from `judge_decisions.memory_to_write`; a full operator UI is out of scope for this feature.
- The first harnesses are local fixtures, not production OpenClaw, Hermes, or Codex adapter deployments.
- Existing securityteam pre-flight and write guard behavior remains the base secret/PII protection layer.
