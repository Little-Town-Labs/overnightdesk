# Data Model: Post-Call Capture

## PostCallCaptureInput

Represents Mitchel's submitted call outcome.

Fields:

- `task_id` optional positive integer. Preferred queue-driven anchor.
- `prospect_id` optional positive integer. Direct prospect anchor when no task is used.
- `outcome` required for writes. One of `no_answer`, `left_voicemail`, `interested`, `quoted`, `follow_up_later`, `not_interested`, `sold`, `wrong_number`, `do_not_contact`.
- `summary` optional bounded text. Required for outcomes that need sales context such as `interested`, `quoted`, `sold`, and `do_not_contact`.
- `next_action_type` optional bounded label such as `call`, `follow_up`, `quote`, `none`.
- `next_action_at` optional ISO date or timestamp.
- `agiled_note` optional boolean. Defaults to true when linked, but never blocks local capture.

Validation rules:

- Exactly one of `task_id` or `prospect_id` should identify the call target unless a future disambiguation flow is added.
- Missing required fields return a missing-field response and perform no writes.
- `next_action_at` is required when `next_action_type` represents future action.
- Summary text must be bounded before storage and response display.

## PostCallCaptureResult

The MCP response for a capture request.

Fields:

- `status`: `captured`, `needs_input`, `duplicate`, or `not_found`.
- `missing_fields`: list of required fields still needed before capture can proceed.
- `interaction_id`: local interaction ID when captured.
- `prospect_id`: affected prospect.
- `task_id`: affected task when provided.
- `prospect_updates`: list of prospect fields changed.
- `task_status`: resulting task status when task anchored.
- `agiled_note`: `created`, `skipped`, `failed`, or `not_requested`.
- `warnings`: bounded operator-visible warnings.
- `outbound_sent`: always false.

## Prospect

Existing buyer profile in Trevor Postgres.

Fields affected by capture:

- `last_contacted_at`
- `last_outcome`
- `next_action_type`
- `next_action_at`
- `status`
- `do_not_contact`

State rules:

- `do_not_contact` outcome suppresses future call readiness.
- `wrong_number` should move the prospect out of call-ready status until contact data is corrected.
- `sold`, `not_interested`, and `do_not_contact` may clear next action unless the operator explicitly sets one.

## Call Task

Existing queue item linked to a prospect.

Fields affected by capture:

- `status`
- `completed_at`

State rules:

- Successful capture for an open task marks it completed.
- Capture for an already completed task returns duplicate status and performs no second write.
- Snoozed or discarded tasks require explicit operator intent before capture can proceed.

## Interaction

Durable chronological touchpoint record.

Fields written by capture:

- `prospect_id`
- `channel`: `phone`
- `direction`: `outbound`
- `summary`
- `occurred_at`
- Optional CRM note/deal references when available

State rules:

- Valid capture writes exactly one interaction.
- Missing-field responses write zero interactions.

## Agiled Note Result

Represents CRM mirroring status for linked prospects.

States:

- `created`: CRM note was created and a reference is available.
- `skipped`: no Agiled link exists or operator disabled note creation.
- `failed`: local capture succeeded but CRM note creation failed.
- `not_requested`: note creation was not requested.
