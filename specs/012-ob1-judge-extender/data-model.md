# Data Model: OB1 Judge Extender

## Existing Entities

### Memory Entry

Existing table: `ace_memory.entries`

Purpose: Durable memory with provenance and explicit use policy.

Relevant fields:

- `id`
- `category`
- `content`
- `tags`
- `is_active`
- `provenance`
- `use_policy`
- `source`
- `runtime`
- `reasoning_model`
- `channel`
- `task_id`
- `confidence`
- `user_confirmed_at`
- `supersedes_id`
- `created_at`
- `updated_at`

Rules:

- Workers cannot self-write `provenance='confirmed'`.
- `confirmed` and `observed` map to instruction-grade by default.
- `generated` and `inferred` default to review or evidence-only behavior.
- Inactive and superseded entries are excluded from automatic injection.

### Action Proposal

Existing table: `ace_memory.action_proposals`

Purpose: Idempotent storage of structured action proposals.

Relevant fields:

- `proposal_id`
- `schema_version`
- `workspace_id`
- `project_id`
- `task_id`
- `flow_id`
- `action_id`
- `idempotency_key`
- `risk_class`
- `tool_name`
- `target_system`
- `proposal`
- `created_at`

Rules:

- `idempotency_key` is unique.
- Proposal JSON must match the V1 contract before storage.
- `arguments_digest` is allowed; full arguments require a controlled reference.

### Judge Decision

Existing table: `ace_memory.judge_decisions`

Purpose: Idempotent compact write-back of judge outcomes.

Relevant fields:

- `decision_id`
- `schema_version`
- `workspace_id`
- `project_id`
- `task_id`
- `flow_id`
- `action_id`
- `proposal_id`
- `idempotency_key`
- `decision`
- `confidence`
- `judge_kind`
- `decision_doc`
- `memory_used`
- `memory_to_write`
- `requires_review`
- `created_at`

Rules:

- `decision` is one of `allow`, `block`, `revise`, `escalate`.
- `idempotency_key` is unique.
- Decision JSON must match the V1 contract before storage.
- Generated or inferred future-facing candidates require review.

## New Entities

### Judge Recall Request

Storage: not persisted by default in V1.

Purpose: Runtime request for scoped judge memory before a decision.

Fields:

- `schema_version`
- `request_id`
- `workspace_id`
- `project_id`
- `task_id`
- `flow_id`
- `action_id`
- `query.summary`
- `query.action_type`
- `query.tool_name`
- `query.target_system`
- `entities.people`
- `entities.orgs`
- `entities.repos`
- `entities.files`
- `entities.customers`
- `entities.systems`
- `entities.topics`
- `scope.visibility`
- `scope.include_unconfirmed`
- `scope.include_disputed`
- `scope.include_stale`
- `limits.max_items`
- `limits.max_tokens`
- `limits.recency_days`
- `policy.allowed_use_policies`
- `policy.require_source_refs`

Validation:

- `request_id`, `workspace_id`, `action_id`, and `query.summary` are required.
- `query.action_type` must match one risk class.
- `allowed_use_policies` must use existing OB1 values.

### Judge Recall Response

Storage: not persisted by default in V1.

Purpose: Contract returned to a judge.

Fields:

- `schema_version`
- `request_id`
- `memories[]`
- `policy_hits[]`
- `warnings[]`

Rules:

- Each memory must include source, provenance, use policy, freshness, confidence, and scope.
- Warnings should explain excluded or risky recall behavior without leaking restricted content.

### Review Candidate

Storage: new `ace_memory.review_candidates` table.

Purpose: Durable queue item for future-facing lessons from judge decisions.

Fields:

- `candidate_id`
- `source_decision_id`
- `workspace_id`
- `project_id`
- `task_id`
- `flow_id`
- `candidate_kind`
- `proposed_content`
- `proposed_category`
- `proposed_tags`
- `provenance_status`
- `confidence`
- `suggested_use_policy`
- `visibility_scope`
- `review_status`
- `review_priority`
- `reason`
- `created_at`
- `reviewed_at`
- `reviewed_by`
- `result_memory_id`

State transitions:

- `pending` -> `confirmed`
- `pending` -> `evidence_only`
- `pending` -> `restricted`
- `pending` -> `rejected`
- `pending` -> `disputed`
- `pending` -> `stale`
- `pending` -> `superseded`

Rules:

- Pending candidates must not be injected automatically.
- Confirmed candidates create or update a memory entry with instruction-grade use policy.
- Evidence-only or restricted candidates must not become instruction-grade.

### Review Action

Storage: new `ace_memory.review_actions` table.

Purpose: Audit trail of review decisions.

Fields:

- `action_id`
- `candidate_id`
- `action`
- `reviewer`
- `note`
- `edited_content`
- `new_use_policy`
- `new_scope`
- `created_at`

Rules:

- Every status-changing review operation writes a review action.
- Review actions must preserve enough context to explain future inspector output.

### Memory Inspector View

Storage: read model assembled from existing and new tables.

Purpose: Explain one memory's origin, trust, usage, and future influence.

Fields:

- `memory`
- `source`
- `provenance`
- `use_policy`
- `freshness`
- `review`
- `created_by_decision`
- `used_by_decisions`
- `supersedes`
- `superseded_by`
- `warnings`
- `automatic_injection_eligible`

Rules:

- Inspector must not expose raw secret-like content or model reasoning traces.
- Inspector must explicitly say when memory is not eligible for automatic instruction use.
