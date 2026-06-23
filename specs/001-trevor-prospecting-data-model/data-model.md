# Data Model: Trevor Prospecting Data Model

## Existing Entities

### Prospect

Represents a buyer or buyer organization in Mitchel's diamond sales pipeline.

Existing attributes:

- `id`
- `name`
- `email`
- `phone`
- `company`
- `buyer_type`
- `preferred_cuts`
- `budget_min`
- `budget_max`
- `cert_preference`
- `agiled_contact_id`
- `status`
- `notes`
- `last_contacted_at`
- `created_at`
- `updated_at`

New cadence attributes:

- `lead_source`: origin of the prospect, such as referral, manual import, Agiled, or future website intake.
- `preferred_channel`: preferred follow-up channel, such as phone, email, Telegram, SMS, LinkedIn, Instagram, or other.
- `do_not_contact`: hard suppression flag for queue and follow-up workflows.
- `do_not_contact_reason`: human-readable reason for suppression.
- `last_outcome`: most recent high-level sales outcome.
- `next_action_type`: next recommended action.
- `next_action_at`: due time for the next action.
- `priority`: numeric prioritization hint for call queue generation.

Validation rules:

- Existing incomplete contact records remain valid.
- `do_not_contact_reason` is required by workflow convention when `do_not_contact` is true.
- `priority` defaults to zero and may be positive or negative as later workflows learn ranking rules.

### Interaction

Represents a completed touchpoint with a prospect.

Existing attributes:

- `id`
- `prospect_id`
- `channel`
- `direction`
- `summary`
- `agiled_deal_id`
- `agiled_note_id`
- `occurred_at`
- `created_at`

Relationship:

- Many interactions belong to one prospect.

### Memory

Represents persistent assistant context for Trevor.

Existing attributes:

- `id`
- `key`
- `value`
- `category`
- `metadata`
- `created_at`
- `updated_at`

## New Entities

### Call Task

Represents pending or completed sales work for a prospect.

Attributes:

- `id`
- `prospect_id`
- `task_type`
- `priority`
- `reason`
- `call_objective`
- `status`
- `due_at`
- `completed_at`
- `created_at`
- `updated_at`

Allowed status values:

- `open`
- `completed`
- `snoozed`
- `discarded`

Allowed task types:

- `call`
- `email`
- `social`
- `telegram`
- `sms`
- `research`
- `other`

Relationships:

- Many call tasks may belong to one prospect.
- Deleting a prospect removes its call tasks.

### Follow-Up Draft

Represents a human-reviewable outbound follow-up draft.

Attributes:

- `id`
- `prospect_id`
- `interaction_id`
- `channel`
- `subject`
- `body`
- `status`
- `approved_by`
- `approved_at`
- `sent_at`
- `external_message_id`
- `created_at`
- `updated_at`

Allowed status values:

- `draft`
- `approved`
- `sent`
- `manual_sent`
- `discarded`

Allowed channels:

- `email`
- `telegram`
- `sms`
- `linkedin`
- `instagram`
- `phone`
- `other`

Relationships:

- Many follow-up drafts may belong to one prospect.
- A follow-up draft may optionally reference the interaction that prompted it.
- Deleting a prospect removes its drafts.
- Deleting an interaction clears the draft's interaction reference rather than deleting the draft.

## Query Support

Future workflows need efficient lookups by:

- prospect status
- prospect do-not-contact flag
- prospect next action due time
- prospect priority
- call task status and due time
- call task prospect
- follow-up draft status
- follow-up draft prospect
- follow-up draft channel
- follow-up draft approval or sent time

## State Transitions

### Call Task

```text
open -> completed
open -> snoozed
open -> discarded
snoozed -> open
```

### Follow-Up Draft

```text
draft -> approved
draft -> discarded
approved -> sent
approved -> manual_sent
approved -> discarded
```

Drafts are never equivalent to completed interactions until a human-approved
send or manual-send confirmation is recorded by a later workflow.
