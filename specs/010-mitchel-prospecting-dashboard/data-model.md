# Data Model: Mitchel Prospecting Dashboard

Feature 10 does not introduce new platform persistence in its first slice. These
entities describe the dashboard view model and the upstream Trevor records that
feed it.

## Mitchel Workspace Summary

Aggregated dashboard payload for one authenticated `hermes-mitchel` user.

- `generatedAt`: Timestamp when the summary was produced.
- `tenantId`: Must be `hermes-mitchel`.
- `sections`: Per-section status for prospects, staged candidates, call tasks,
  review items, and follow-up drafts.
- `warnings`: Bounded operator-readable warnings.
- `outboundSent`: Always `false` for this feature slice.

Validation rules:

- Must never include secrets or database connection strings.
- Each section must be independently able to report `ok`, `empty`, or
  `unavailable`.
- Lists must be bounded for dashboard display.

## Prospect Summary

Bounded display representation of a Trevor prospect.

- `prospectId`
- `displayName`
- `company`
- `phone`
- `email`
- `area`
- `status`
- `priority`
- `agiledContactId`
- `lastInteractionAt`
- `nextActionAt`
- `reviewFlags`

Validation rules:

- Contact fields may be absent.
- Do-not-contact state must be represented explicitly when present.
- Raw notes and transcript text are not part of the v1 summary.

## Staged Candidate Summary

Display representation of a candidate from sourcing review.

- `candidateId`
- `businessName`
- `area`
- `phone`
- `website`
- `reviewStatus`
- `dedupeStatus`
- `dedupeReason`
- `leadSource`
- `enrichmentSource`
- `qualityScore`
- `sourceUrl`
- `warnings`

State values:

- `recommended`
- `needs_review`
- `duplicate`
- `rejected`
- `approved`

Validation rules:

- Scraped source text is untrusted and must be displayed as text only.
- Candidate lists are bounded by review usefulness, not exhaustive export.

## Call Task Summary

Display representation of a human call task.

- `callTaskId`
- `prospectId`
- `displayName`
- `company`
- `phone`
- `dueAt`
- `priority`
- `readiness`
- `reason`
- `status`

Validation rules:

- Tasks without callable contact information must be labeled review-only.
- Do-not-contact prospects must not appear as callable.

## Review Item

Normalized item that needs a human decision.

- `itemType`: Candidate, prospect, call task, or draft.
- `itemId`
- `title`
- `reason`
- `source`
- `recommendedNextStep`
- `blockingFlags`

Validation rules:

- The recommended next step must be advisory and must not mutate records by
  itself.
- Items must include enough source context to support review without exposing
  full raw scrape output.

## Follow-Up Draft Summary

Display representation of a draft awaiting review.

- `draftId`
- `prospectId`
- `displayName`
- `channel`
- `status`
- `createdAt`
- `summary`
- `requiresApproval`

Validation rules:

- Draft body may be omitted or truncated in summary views.
- Viewing a draft must not mark it approved or sent.

## Section Status

Per-section availability state used for partial failure UI.

- `status`: `ok`, `empty`, or `unavailable`
- `count`
- `message`
- `lastUpdatedAt`

Validation rules:

- A failed section must not hide successful sections.
- Error messages must be operator-useful without exposing internal details.
