# Data Model: Internal Buyer Intake

## Buyer Intake Request

Represents one internal request from Mitchel or Trevor to capture a buyer,
conversation, and optional next action.

Fields:

- `requested_by`: operator or Mitchel identifier.
- `source`: source attribution such as `manual_entry`, `phone_call`,
  `referral`, `trade_show`, `browseract_google_maps`, `camofox_website_recon`,
  or future `mitchelbrown.com`.
- `intake_mode`: `create_or_update`, `update_existing`, or `validate_only`.
- `prospect_id`: optional known Trevor prospect ID.
- `agiled_contact_id`: optional known Agiled contact ID.
- `name`, `company`, `phone`, `email`, `website`, `address`, `area`.
- `buyer_type`: retail jeweler, wholesale dealer, broker, private collector, or
  unknown.
- `preferences`: bounded text describing requested diamonds, jewelry, budget,
  timing, and buying preferences.
- `conversation_channel`: phone, in-person, email, text, website, social,
  referral, or other.
- `conversation_summary`: bounded summary or raw notes to summarize.
- `outcome`: optional normalized conversation outcome.
- `next_action_type`: call, follow_up, draft_follow_up, review, none, or other.
- `next_action_at`: optional date/time for next action.
- `create_call_task`: optional boolean.
- `create_follow_up_draft`: optional boolean.
- `agiled_sync`: not_attempted, skip, link_only, create_or_update.

Validation:

- At least one usable identity or contact path is required: known prospect ID,
  phone, email, company, or name plus company/source context.
- Free-form notes are bounded and redacted before storage.
- `create_call_task` and `create_follow_up_draft` are blocked for
  do-not-contact buyers unless contact status is explicitly changed.
- `validate_only` returns the dedupe/intake assessment without durable writes.

## Intake Result

Represents the outcome returned to Trevor after intake.

Fields:

- `status`: captured, updated, created, needs_review, duplicate, rejected,
  validation_only, or error.
- `prospect_id`: linked or created Trevor prospect ID when available.
- `interaction_id`: created Trevor interaction ID when a conversation was
  captured.
- `call_task_id`: created or reused call task ID when requested and allowed.
- `follow_up_draft_id`: created draft ID when requested and allowed.
- `dedupe_status`: unique, matched_existing, possible_duplicate, duplicate, or
  needs_review.
- `dedupe_matches`: bounded list of possible matches.
- `agiled`: sync result object.
- `warnings`: bounded non-secret warnings.
- `outbound_sent`: always false for this feature.

Validation:

- Ambiguous matches return `needs_review` and must not update an uncertain
  prospect.
- Result warnings must not include secrets, raw transcripts, cookies, database
  URLs, or full private notes.

## Trevor Prospect

Existing durable buyer/prospect record in `trevor.prospects`.

Feature-specific behavior:

- May be created from a unique internal intake.
- May be updated from a clear existing match.
- Preserves or updates source attribution when provided.
- Stores bounded notes and buyer preferences.
- Updates last outcome and next action fields when safe.
- Keeps richer existing human-entered contact data when new intake omits fields.

Validation:

- Do not create duplicates for clear phone/email matches.
- Do not overwrite non-empty contact fields with empty intake fields.
- Do-not-contact status suppresses call tasks and persuasive drafts.

## Trevor Interaction

Existing conversation record in `trevor.interactions`.

Feature-specific behavior:

- One successful conversation intake writes one bounded interaction.
- The interaction references the resolved prospect.
- Summary is concise and business-relevant.
- Channel, direction, outcome, and occurred timing are recorded when provided.
- Agiled note reference may be recorded when available.

Validation:

- Full raw transcripts are not stored.
- An interaction is not written when intake is validation-only or ambiguous.

## Dedupe Match

Represents a possible existing buyer/prospect or Agiled contact match.

Fields:

- `source`: trevor or agiled.
- `id`: source-specific identifier.
- `display_name`, `company`, `phone`, `email`.
- `match_reason`: phone, email, company, name, Agiled link, or manual ID.
- `confidence`: exact, likely, possible.

Validation:

- At most 5 matches are returned for review.
- Match output is bounded and excludes full private notes.

## Agiled Sync Result

Represents external CRM handling.

Fields:

- `status`: not_attempted, skipped, linked, created, updated, failed.
- `reference`: contact or note reference when available.
- `message`: bounded non-secret status explanation.

Validation:

- Agiled failure does not roll back local Trevor writes.
- Agiled credentials and raw API errors are never exposed.

## Next Action

Represents optional internal work created from intake.

Fields:

- `type`: call_task or follow_up_draft.
- `id`: created or reused internal ID.
- `status`: created, reused, skipped, blocked, failed.
- `reason`: bounded explanation.

Validation:

- Next actions never send outbound messages.
- Duplicate open call tasks for the same prospect and same purpose are reused
  or skipped rather than duplicated.
