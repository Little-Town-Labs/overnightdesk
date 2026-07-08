# OB1 Judge Extender Process

This note adapts the OpenBrain Judge Extender guide to the current OB1
implementation in `ob1-mcp`.

OB1 should be the continuity layer for agent judgment, not the runtime, judge,
or orchestrator. Hermes, Codex, OpenClaw, GitHub workflows, or later runtimes
own execution. A judge owns the allow/block/revise/escalate decision. OB1 owns
the scoped recall before the decision, compact write-back after the decision,
and governance over which memories may shape future decisions.

## Current Baseline

`ob1-mcp` already has the first judge-storage primitives:

- provenance-bearing memory entries in the `ace_memory.entries` table
- explicit `use_policy` values on memory entries
- idempotent `action_proposals` storage
- idempotent `judge_decisions` storage
- MCP tools for `save_action_proposal`, `record_judge_decision`, and
  `get_judge_decision`
- guards preventing workers from self-writing instruction-grade confirmed
  memory

The Judge Extender guide uses `user_confirmed`. OB1 keeps the existing runtime
value `confirmed` for the same concept.

## Target Process

Every side-effectual agent action should move through a compact judge loop:

1. Classify the proposed action by risk.
2. Ask OB1 for scoped recall using memory use policy and provenance filters.
3. Submit a structured action proposal to the judge.
4. Let the judge return `allow`, `block`, `revise`, or `escalate`.
5. Write the compact decision event back to OB1.
6. Send reusable future-facing lessons to review before they become
   instruction-grade.
7. Let operators inspect why a memory exists, where it came from, how it was
   used, and what it may influence.

OB1 should store compact judgment events by default. It should not store raw
transcripts, model reasoning traces, or full tool arguments unless a runtime has
an approved retention policy. The normal record is an action description,
argument digest, source references, decision summary, memory used, memory
candidates, provenance, scope, confidence, and review status.

## Risk Classes

Use these risk classes when creating action proposals:

| Risk class | Examples | Default process |
| --- | --- | --- |
| `read_only` | retrieve, summarize, inspect, classify, compare, draft | Recall optional unless sensitive, high-stakes, or policy-matching. |
| `reversible_write` | draft, label, internal note, branch write, local file edit | Lightweight judge or post-action audit. |
| `external_side_effect` | send email, message a person, open PR, public comment, CRM/ticket update | Judge required before execution. |
| `high_risk` | spend money, delete data, permission change, merge, production command, legal/financial/customer-scale action | Judge plus human approval unless explicit workspace policy allows automation. |

## Memory Trust Rules

Keep the current OB1 use policies:

- `can_use_as_instruction`: confirmed or otherwise trusted instruction-grade
  memory. Human confirmation is required for generated future-facing rules.
- `can_use_as_evidence`: observed events, imported policies, and reviewed
  history that may support a decision but should not direct future action.
- `requires_confirmation`: default for inferred or generated memories that
  might affect future behavior.
- `do_not_inject_automatically`: sensitive, disputed, stale, low-confidence, or
  restricted memory.

Generated or inferred memories must not silently become instructions. A blocked
action is evidence. A human correction is a high-priority review item. A future
standing rule requires confirmation.

## Contract Shape

OB1 should keep the contract runtime-independent and adapter-friendly.

The current MCP tools can remain the first integration surface. A REST wrapper
can be added later for clients that expect endpoints such as:

- `POST /v1/judge/recall`
- `POST /v1/judge/decisions`
- `GET /v1/judge/decisions/{decision_id}`
- `GET /v1/memories/{memory_id}/inspector`
- `GET /v1/review-queue`
- `POST /v1/review-queue/{item_id}/actions`

The MCP surface should grow in the same order:

- `judge_recall`
- `save_action_proposal` schema validation upgrades
- `record_judge_decision` schema validation upgrades
- `get_judge_decision`
- `inspect_memory`
- `list_review_queue`
- `review_memory_candidate`

## V1 Additions

The next OB1 process slice should add the missing pieces around the existing
storage baseline.

1. Contract validation
   - Define local JSON schemas or Pydantic models for action proposals, recall
     requests, recall responses, and judge decisions.
   - Validate at the MCP boundary before writing to Postgres.
   - Keep old stored JSONB payloads readable.

2. First-class judge recall
   - Add `judge_recall` as a policy-aware wrapper around `search_thoughts` and
     `list_thoughts`.
   - Return memories with provenance, use policy, source, confidence, freshness,
     scope, and warnings.
   - Default to instruction-grade memory for action decisions and evidence-grade
     memory for exploratory review.

3. Review queue
   - Materialize reusable lessons from `judge_decisions.memory_to_write`.
   - Keep generated or inferred future-facing memory in review.
   - Support review actions: confirm, edit, evidence-only, restrict scope, mark
     stale, reject, dispute, and supersede.

4. Memory inspector
   - Show why a memory exists, which source or judge event created it, how it was
     used, who confirmed or restricted it, what it may influence, conflicts, and
     stale-after status.

5. Adapter harness
   - Add golden tests for Code Review Memory and TaskFlow Work Log.
   - Cover allow, block, revise, and escalate.
   - Prove decision write-back idempotency and that disputed/superseded memory is
     not injected automatically.

## Acceptance Criteria

This process is ready when:

- a runtime can call OB1 recall before a judge decision
- the judge receives scoped memories with provenance and use policy
- action proposals and judge decisions are schema-validated
- allow/block/revise/escalate decisions write back idempotently
- inferred and generated future-facing memories require review before
  instruction use
- the inspector can explain what was recalled, what was used, what was decided,
  and what was written
- secret-like data, raw transcripts, and full tool argument dumps are blocked by
  default
- re-running a similar workflow can retrieve a confirmed prior lesson

## Implementation Order

Recommended order:

1. Add schemas and boundary validation to existing proposal and decision tools.
2. Add `judge_recall` as a governed recall wrapper.
3. Add review queue storage and tests.
4. Add memory inspector read paths.
5. Add one concrete runtime example, starting with Code Review Memory.
6. Add TaskFlow Work Log.
7. Add a second-runtime example only after the first runtime is reliable.

