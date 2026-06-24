# Data Model: Follow-Up Sent Logging

## Existing Tables

### `trevor.followup_drafts`

Represents reviewable follow-up copy from Feature 5.

Fields used by this feature:

- `id`: draft identifier supplied to confirmation workflows.
- `prospect_id`: prospect receiving the follow-up.
- `interaction_id`: source call interaction, when the draft came from a captured call.
- `channel`: follow-up channel.
- `subject`: email subject when applicable.
- `body`: full draft text, used only for explicit confirmation or detail flows.
- `status`: must transition from `approved` to `manual_sent`; invalid from `draft`, `discarded`, `manual_sent`, or `sent`.
- `approved_by`, `approved_at`: approval metadata from Feature 5.
- `sent_at`: timestamp of the human-confirmed send.
- `sent_via`: channel/provider label for the human-confirmed send.
- `external_message_id`: optional external reference supplied by the operator.
- `updated_at`: transition timestamp.

Validation rules:

- Confirmation requires `status = 'approved'`.
- Confirmation must be idempotent by draft ID; a completed draft cannot create a second interaction.
- Queue output includes approved drafts only and must bound body/detail exposure.

### `trevor.interactions`

Represents durable prospect history.

Fields used by this feature:

- `prospect_id`: required.
- `channel`: the sent follow-up channel.
- `direction`: `outbound`.
- `summary`: bounded summary that a manual follow-up was sent.
- `occurred_at`: sent timestamp.
- Optional metadata fields if available in the existing schema should capture source draft ID, confirming operator, external reference, and audit-only reason.

Validation rules:

- A successful confirmation creates exactly one interaction.
- Failed confirmations create zero interactions.
- Do-not-contact audit-only confirmations must be labeled so they cannot be mistaken for normal outreach.

### `trevor.prospects`

Represents buyer profile and safety state.

Fields used by this feature:

- `id`, `name`, `company`: display context.
- `do_not_contact`: blocks normal send confirmation.
- `preferred_channel`: optional display context.

Validation rules:

- Do-not-contact prospects are excluded from "safe to send" queue language.
- Do-not-contact confirmation requires explicit audit-only override with reason.

## New Domain Objects

### Send Confirmation Request

- `draftId`: required for draft-backed confirmation.
- `sentAt`: timestamp the human sent the follow-up.
- `sentVia`: channel/provider label, defaults to the draft channel when omitted.
- `confirmedBy`: operator name or identifier.
- `externalMessageId`: optional bounded reference.
- `auditOnlyReason`: required only for do-not-contact override.

### Send Confirmation Result

- `status`: `logged`, `blocked`, or `needs_input`.
- `draftId`: draft identifier.
- `prospectId`: prospect identifier.
- `interactionId`: created interaction identifier when logged.
- `draftStatus`: final draft status.
- `channel`: sent/logged channel.
- `sentAt`: sent timestamp.
- `outboundSent`: always false for this feature.
- `warnings`: bounded warning list.
