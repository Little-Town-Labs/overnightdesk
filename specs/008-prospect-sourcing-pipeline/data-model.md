# Data Model: Prospect Sourcing Pipeline

## Sourcing Run

Represents one bounded request to find prospects.

Fields:

- `id`: unique run identifier.
- `source`: primary discovery source such as `browseract_google_maps`,
  `browseract_contact_finder`, `browseract_industry_radar`, `manual_import`,
  or a future source.
- `enrichment_source`: optional enrichment source such as
  `camofox_website_recon`, `camofox_contact_enrichment`, or
  `browseract_website_data_scrape`.
- `area`: human-readable market or geography.
- `keyword`: search query or target segment.
- `status`: `staged`, `reviewed`, `promoted`, `failed`, or `canceled`.
- `requested_by`: operator or Mitchel identifier.
- `candidate_count`: total candidates found.
- `recommended_count`: candidates recommended for review.
- `warnings`: bounded list of non-secret warnings.
- `created_at`, `updated_at`.

Validation:

- Source and area are required.
- Warnings must not include secrets, database URLs, or full page text.
- A run may have many candidates.

## Prospect Candidate

Represents a business found by scraping or public research before promotion.

Fields:

- `id`: unique candidate identifier.
- `sourcing_run_id`: parent run.
- `business_name`: required.
- `company`: optional normalized company name.
- `area`: market or location.
- `phone`: optional.
- `email`: optional.
- `website`: optional public URL.
- `source_url`: optional public listing or page URL from BrowserAct.
- `enrichment_url`: optional public page URL inspected by CamoFox.
- `rating`: optional numeric public rating.
- `review_count`: optional public review count.
- `buyer_type`: expected Trevor buyer type, usually `retail_jeweler`.
- `lead_source`: required primary source attribution string.
- `enrichment_source`: optional secondary source attribution string.
- `quality_score`: bounded integer score.
- `review_status`: `recommended`, `needs_review`, `duplicate`, `rejected`,
  or `approved`.
- `dedupe_status`: `unique`, `possible_duplicate`, `duplicate`.
- `dedupe_reason`: bounded text.
- `review_notes`: bounded text.
- `approved_by`, `approved_at`.
- `promoted_prospect_id`: linked Trevor prospect after promotion.
- `created_at`, `updated_at`.

Validation:

- Business name and lead source are required.
- `review_status=approved` requires explicit reviewer identity.
- Duplicate or rejected candidates must not be promoted.
- Notes are bounded summaries, not raw scraped pages.

## Candidate Review

Represents a review decision for a candidate.

Fields:

- `candidate_id`: reviewed candidate.
- `decision`: `approve`, `reject`, or `needs_review`.
- `reviewed_by`: required operator or Mitchel identifier.
- `reason`: optional bounded text.
- `created_at`.

Validation:

- Approval is required before promotion.
- Rejections should include a reason when the candidate looked superficially
  valid.

## Trevor Prospect

Existing durable prospect record in `trevor.prospects`.

Feature-specific fields:

- `lead_source`: required for promoted sourced candidates.
- `buyer_type`: set from candidate classification.
- `status`: active for approved sourced candidates unless reviewer chooses a
  non-active state.
- `notes`: receives a bounded sourcing summary.
- `phone`, `email`, `company`: populated when available.

Validation:

- Promotion must dedupe against existing prospects before insert.
- Promotion must not overwrite richer existing human-entered data with empty
  scraped fields.

## Call Task

Existing queue item in `trevor.call_tasks`.

Feature-specific behavior:

- Approved call-ready prospects may receive one open initial outreach task.
- Duplicate open initial outreach tasks are suppressed.
- DNC prospects are never queued for outreach.
