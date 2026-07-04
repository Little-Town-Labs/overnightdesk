# Data Model: Prospect Deep Research

## Prospect Research Run

Represents one bounded deep research pass or batch.

Fields:

- `id`: unique run identifier.
- `source_batch`: stable batch identifier.
- `status`: `running`, `completed`, `failed`, or `canceled`.
- `requested_by`: operator or agent identifier.
- `prospect_count`: number of prospects considered.
- `evidence_count`: number of evidence rows produced.
- `warnings`: bounded non-secret warnings.
- `metadata`: structured non-secret run context.
- `created_at`, `updated_at`, `completed_at`.

Validation:

- `source_batch` and `status` are required.
- Warnings must not include secrets, raw page dumps, or private contact data.

## Prospect Research Evidence

Represents one public evidence finding for one Trevor prospect.

Fields:

- `id`: unique evidence identifier.
- `prospect_id`: foreign key to `trevor.prospects(id)`.
- `research_run_id`: optional link to the run that produced the finding.
- `source_type`: `official_site`, `contact_page`, `city_directory`, `chamber_directory`, `news_story`, `business_listing`, `rdap_whois`, or `other_public_source`.
- `source_url`: public URL when available.
- `source_title`: bounded title or page label.
- `found_email`: optional candidate public business email.
- `found_phone`: optional candidate public business phone.
- `business_context_note`: bounded business context summary.
- `search_location_note`: bounded note explaining where the information was located.
- `evidence_note`: bounded note explaining why the evidence matters.
- `confidence`: `official`, `likely`, `possible`, or `unknown`.
- `review_status`: `pending_review`, `approved`, `rejected`, or `superseded`.
- `reviewed_by`, `reviewed_at`, `review_note`.
- `promoted_at`, `promoted_to`.
- `metadata`: structured non-secret evidence context.
- `created_at`, `updated_at`.

Validation:

- `prospect_id`, `source_type`, `confidence`, and `review_status` are required.
- At least one of `source_url`, `search_location_note`, `found_email`, `found_phone`, or `business_context_note` must be present.
- `source_type=rdap_whois` cannot be considered email-promotable by itself.
- `review_status=approved` requires `reviewed_by` and `reviewed_at`.
- Notes are summaries, not raw scraped pages.

## Trevor Prospect

Existing durable prospect record in `trevor.prospects`.

Feature-specific behavior:

- Evidence rows reference prospects with `ON DELETE CASCADE`.
- Missing-email prospects are prioritized for research.
- Approved evidence may later be summarized into prospect notes or routed through email enrichment.

## Weekly Prospect Scheduler

Represents the repo-owned template for weekly prospect automation.

Fields:

- `schema_version`: version for the template format.
- `timezone`: `America/Chicago`.
- `schedule_local`: `Saturday 23:00 America/Chicago`.
- `install_status`: `template_only` until explicitly approved and installed.
- `approval_required`: `true`.
- `jobs`: two disabled job definitions, one for missing-email enrichment and one for deep research.

Validation:

- Jobs must be disabled by default.
- Jobs must use Saturday 23:00 America/Chicago local wall-clock time.
- Missing-email enrichment must prioritize prospects with missing email.
- Deep research must store evidence only and must not directly update `trevor.prospects.email`.
- Production installation must verify timezone support or document the UTC offset used for the current CST/CDT period.

## State Transitions

Evidence review:

```text
pending_review -> approved
pending_review -> rejected
approved -> superseded
rejected -> superseded
```

Promotion:

```text
approved -> promoted_at/promoted_to set
```
