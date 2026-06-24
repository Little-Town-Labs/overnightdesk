# Data Model: Pre-Call Brief

## Existing Entities Used

### Prospect (`trevor.prospects`)

Represents a buyer or buyer organization.

Relevant fields:

- `id`
- `name`
- `company`
- `email`
- `phone`
- `status`
- `notes`
- `agiled_contact_id`
- `preferred_channel`
- `do_not_contact`
- `do_not_contact_reason`
- `last_outcome`
- `next_action_type`
- `next_action_at`
- `priority`

Validation rules:

- `do_not_contact = true` must produce a warning and must not be described as call-ready.
- Missing `phone`, `preferred_channel`, or `agiled_contact_id` must appear in missing context.
- Notes may inform the brief but must be summarized.

### Call Task (`trevor.call_tasks`)

Represents a durable call queue item.

Relevant fields:

- `id`
- `prospect_id`
- `task_type`
- `priority`
- `reason`
- `call_objective`
- `status`
- `due_at`

Validation rules:

- Only `task_type = 'call'` can anchor a pre-call brief.
- Missing tasks should return not found, not create a new task.

### Interaction (`trevor.interactions`)

Represents prior touchpoint history.

Relevant fields:

- `prospect_id`
- `channel`
- `direction`
- `summary`
- `occurred_at`

Validation rules:

- Use the latest interaction when available.
- Summaries should be shortened for the brief.
- Brief generation must not create interactions.

## New Logical Entity

### Pre-Call Brief

A transient MCP response. It is not stored in this slice.

Fields:

- `generated_at`
- `lookup`
- `prospect`
- `task`
- `last_touch`
- `brief`
- `missing_context`
- `warnings`
- `disambiguation`

Validation rules:

- Response must be snake_case at the MCP boundary.
- `disambiguation` is populated only when query lookup is ambiguous.
- `brief` must include recommended ask, suggested opener, and follow-up fallback when a prospect is selected.
- Warnings must include DNC and unavailable inventory/Agiled context where relevant.
