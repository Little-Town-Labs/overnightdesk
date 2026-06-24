# Data Model: Follow-Up Drafting

## FollowUpDraftInput

Represents a request to generate or retrieve a follow-up draft.

Fields:

- `interaction_id` required positive integer.
- `channel` required. One of `email`, `telegram`, `sms`, `linkedin`, `instagram`.
- `tone` optional bounded text. Defaults to professional and concise.
- `regenerate` optional boolean. Defaults to false.

Validation rules:

- Unsupported channels create zero rows.
- Missing interaction or missing prospect returns `not_found`.
- Existing active draft for the same interaction/channel is returned unless `regenerate=true`.

## FollowUpDraft

Existing row in `trevor.followup_drafts`.

Fields:

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

State rules:

- New drafts start as `draft`.
- `approved` requires `approved_by` and `approved_at`.
- `discarded` is terminal for this feature.
- `sent` and `manual_sent` are reserved for future send/log workflows and are not set by Feature 5.

## FollowUpDraftResult

MCP response for draft generation or state changes.

Fields:

- `status`: `drafted`, `existing`, `approved`, `discarded`, `not_found`, or `invalid`.
- `draft_id`
- `prospect_id`
- `interaction_id`
- `channel`
- `draft_status`
- `subject`
- `body`
- `warnings`
- `outbound_sent`: always false

## DraftApprovalInput

Represents approval or discard of a stored draft.

Fields:

- `draft_id` required positive integer.
- `action` required. One of `approve`, `discard`.
- `approved_by` required for approve.

Validation rules:

- Missing draft returns `not_found`.
- Discarded drafts cannot be approved.
- Approval creates no external send.
