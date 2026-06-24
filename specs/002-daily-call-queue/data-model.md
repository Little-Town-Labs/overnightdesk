# Data Model: Daily Call Queue

## Existing Entities Used

### Prospect (`trevor.prospects`)

Represents a buyer or buyer organization in Mitchel's sales pipeline.

Relevant fields for this feature:

- `id`: stable prospect identifier.
- `name`, `company`, `email`, `phone`: contact identity and readiness signals.
- `status`: current relationship state.
- `notes`: business context; must not be logged wholesale.
- `agiled_contact_id`: optional CRM linkage.
- `preferred_channel`: contact preference.
- `do_not_contact`: hard suppression flag.
- `do_not_contact_reason`: required when `do_not_contact = true`.
- `last_outcome`: most recent known sales outcome.
- `next_action_type`: queued action category such as call or follow-up.
- `next_action_at`: due time for the next action.
- `priority`: operator or Trevor-assigned priority weight.
- `updated_at`: deterministic tie breaker when otherwise equal.

Validation rules:

- `do_not_contact = true` excludes the prospect from callable recommendations.
- Missing phone/preferred call channel marks the prospect as not call-ready unless the output is explicitly a review item.
- Existing incomplete contact records remain valid and must not be rejected.

### Interaction (`trevor.interactions`)

Represents completed touchpoint history. This feature reads interaction recency when available but does not create completed interactions.

Relevant fields:

- `prospect_id`
- `channel`
- `direction`
- `summary`
- `occurred_at`
- Agiled references when present.

Validation rules:

- Interaction summaries may inform staleness but must not be logged in full.
- If no interaction exists, the queue may treat the relationship as having no known recent touch.

### Call Task (`trevor.call_tasks`)

Represents a pending or completed sales action.

Fields used by this feature:

- `id`
- `prospect_id`
- `task_type`: `call` for queue items in this slice.
- `priority`
- `reason`
- `call_objective`
- `status`: `open`, `completed`, `snoozed`, or `discarded`.
- `due_at`
- `completed_at`
- `created_at`
- `updated_at`

Validation rules:

- Queue generation creates or reuses `open` call tasks.
- Repeated generation for the same prospect and same sales-day purpose must not create duplicate open tasks.
- If a prospect becomes do-not-contact, any existing open task for that prospect must not be returned as callable.
- Completing a task requires `completed_at`.

## New Logical Entities

### Call Recommendation

A computed item returned to Trevor/Mitchel before or while it is persisted.

Fields:

- `rank`: one-based display order.
- `prospect_id`: source prospect.
- `task_id`: existing or newly created call task when persistence is requested.
- `display_name`: safe identity summary, such as name plus company.
- `score`: deterministic internal ranking score for debugging and tests.
- `reason`: short explanation for why the prospect is in the queue.
- `call_objective`: the recommended ask or purpose.
- `suggested_opener`: short opener grounded in known facts.
- `buyer_context`: concise known preferences/status summary.
- `missing_context`: list of missing optional context such as Agiled link, phone, or inventory.
- `readiness`: `call_ready`, `review_needed`, or `suppressed`.
- `ranking_drivers`: bounded list such as `overdue_next_action`, `high_priority`, `stale_relationship`, `status_hot`, `inventory_context_available`.

Validation rules:

- Suppressed recommendations must not be returned in the callable queue.
- `suggested_opener` must not claim an inventory match unless inventory context was provided.
- `reason`, `call_objective`, and `buyer_context` should be concise enough for immediate pre-call use.

### Queue Generation Run

A transient result returned by the MCP tool. It is not a new table in this slice.

Fields:

- `generated_at`
- `sales_day`
- `limit`
- `persist`
- `recommendation_count`
- `suppressed_count`
- `not_call_ready_count`
- `reused_task_count`
- `created_task_count`
- `warnings`

Validation rules:

- Counts must be derived from the same candidate set as the recommendations.
- Warnings should name missing integrations or degraded context without exposing secrets.
- The run result should provide enough evidence for operator validation without dumping full private notes.

## State Transitions

### Call Task

```text
open -> completed
open -> snoozed
open -> discarded
snoozed -> open
snoozed -> discarded
```

Rules:

- `completed` requires `completed_at`.
- `discarded` is used for stale or invalid recommendations, including tasks invalidated by a do-not-contact change.
- This feature does not create interactions when a task is completed; that belongs to Post-Call Capture.

## Ranking Inputs

Required:

- Due next action (`next_action_at <= sales_day end`)
- Priority
- Do-not-contact flag
- Contact readiness
- Prospect status
- Recent interaction recency when available

Optional:

- Agiled link or deal context
- Inventory context supplied at request time

## Query Semantics

Candidate prospects:

- Include active/non-DNC prospects.
- Include prospects with due `next_action_at`, high priority, hot status, stale relationship, or review-needed missing context.
- Exclude hard-suppressed DNC rows from callable recommendations.

Task persistence:

- Find existing open `call` task for the prospect with `due_at` on the requested sales day.
- Reuse/update that task when present.
- Insert one task when absent and persistence is requested.

Output stability:

- Sort by score descending.
- Break ties by `priority DESC`, `next_action_at ASC NULLS LAST`, `updated_at DESC`, and `id ASC`.
