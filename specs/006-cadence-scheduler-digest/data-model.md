# Data Model: Cadence Scheduler and Digest

## CadenceDigestRequest

Represents a request to generate a daily prospecting digest.

Fields:

- `sales_day` optional date in `YYYY-MM-DD`; defaults to the current America/Chicago sales day.
- `limit` optional positive integer; bounds each digest section.
- `persist_call_tasks` optional boolean; defaults to false.
- `include_review_needed` optional boolean; defaults to true.
- `include_dormant` optional boolean; defaults to true.
- `scheduled` optional boolean; defaults to false and labels the run source.
- `inventory_context` optional bounded text; used only for queue explanation and not stored.

Validation rules:

- Invalid dates return `needs_input` or equivalent invalid response without writes.
- Limits are clamped to the digest maximum.
- Default execution must be read-only.

## CadenceDigest

Generated digest response.

Fields:

- `generated_at`
- `sales_day`
- `scheduled`
- `persisted_call_tasks`
- `counts`
  - `call_recommendations`
  - `review_needed`
  - `stale_items`
  - `follow_up_drafts`
  - `suppressed`
  - `created_tasks`
  - `reused_tasks`
- `call_queue`
- `review_needed`
- `stale_work`
- `follow_up_approvals`
- `warnings`
- `side_effects`

State rules:

- `scheduled=false` for normal user-initiated runs.
- `side_effects.outbound_sent` is always false.
- `side_effects.follow_up_drafts_created` is always 0.
- `side_effects.interactions_created` is always 0.

## StaleWorkItem

Bounded summary of a prospect that needs cadence review.

Fields:

- `prospect_id`
- `display_name`
- `status`
- `reason`
- `next_action_type`
- `next_action_at`
- `last_interaction_at`
- `days_stale`
- `review_only`
- `suggested_next_step`

Validation rules:

- Do-not-contact prospects must set `review_only=true` and must not receive an outreach next step.
- Full prospect notes are not included.
- Items are limited and sorted by overdue action, priority, and staleness.

## FollowUpApprovalItem

Bounded summary of a follow-up draft awaiting Mitchel approval.

Fields:

- `draft_id`
- `prospect_id`
- `display_name`
- `channel`
- `status`
- `subject`
- `created_at`
- `age_days`
- `review_only`

Validation rules:

- Include only status `draft` in the approval queue.
- Exclude `discarded`, `approved`, `sent`, and `manual_sent` from pending approvals.
- Full draft body is not included in the digest.

## SchedulerRunbook

Operator-facing instructions for scheduled digest execution.

Fields:

- `validation_command`
- `enable_steps`
- `disable_steps`
- `rollback_steps`
- `schedule`
- `owner`
- `log_location`
- `side_effect_checks`

Validation rules:

- Scheduler must be disabled by default.
- Runbook must include a no-delete rollback path.
- Runbook must state expected DB side-effect counts for default digest runs.
