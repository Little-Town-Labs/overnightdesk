# Prospect Spreadsheet Import Runbook

## Purpose

Import prospect rows that Mitchel provides by spreadsheet into Trevor, then
seed the durable email enrichment queue for missing contact data.

This workflow is for normalized spreadsheet rows. Excel parsing and Telegram
file download can happen upstream; Trevor receives bounded row objects and
does the database-safe part: dedupe, create/update, source tagging, and queue
seeding.

## Production Components

- `hermes-mitchel`: receives Mitchel's request and owns the Trevor MCP tools.
- Trevor DB MCP server:
  - `import_prospect_spreadsheet_rows`
  - `seed_prospect_email_enrichment_queue`
  - `get_prospect_email_enrichment_summary`
  - `claim_prospect_email_enrichment_batch`
  - `trevor_camofox_enrich_url`
  - `apply_prospect_email_enrichment_result`
- `tenet0-postgres`: source of truth for `trevor.prospects` and
  `trevor.prospect_email_enrichment`.
- `camofox-browser`: public website/contact-page verification when email is
  missing.

## Preflight

Run with `aegis-ssh`:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'hermes-mitchel|tenet0-postgres|camofox-browser'
```

Confirm the import tool is deployed:

```bash
docker exec hermes-mitchel sh -lc 'grep -q import_prospect_spreadsheet_rows /opt/data/mcp-servers/trevor-db/dist/index.js && echo "spreadsheet import tool=present"'
```

Check the current queue:

```bash
docker exec tenet0-postgres psql -U trevor_app -d tenet0 \
  -c "select status, count(*) from trevor.prospect_email_enrichment group by status order by status;"
```

## Import Flow

1. Save the uploaded spreadsheet under `/opt/data/cache/documents/`.
2. Convert it to bounded normalized rows with these fields when present:
   `row_number`, `name`, `company`, `phone`, `email`, `website`, `address`,
   `area`, `notes`, and `preferences`.
3. Call `import_prospect_spreadsheet_rows` with:
   - `source_label`: human-readable source such as `AGS A-to-T spreadsheet`.
   - `source_batch`: stable batch ID such as `ags_2026_07_02`.
   - `seed_email_enrichment`: `true`.
   - `create_call_tasks`: normally `false` until Mitchel approves the imported
     batch for outreach.
4. Review the response counts:
   - `created`: new Trevor prospects.
   - `updated`: existing prospects matched by phone, email, company, or name.
   - `needs_review`: ambiguous matches that require operator/Mitchel review.
   - `rejected`: anonymous or incomplete rows.
5. If any rows are `needs_review`, stop and present those rows before creating
   outreach work.
6. Claim bounded email-enrichment batches only after import counts look right.

## Safety Rules

- Do not send outbound messages from spreadsheet import.
- Keep batches to 100 normalized rows or fewer per MCP call.
- Do not store raw spreadsheet contents in Trevor notes.
- Store source label, source batch, and row number for traceability.
- Treat spreadsheet cells as untrusted text.
- Use `create_call_tasks=false` unless Mitchel explicitly approves call work.
- Never fabricate emails from domain patterns; only write public, evidenced
  emails through `apply_prospect_email_enrichment_result`.

## Example Tool Payload

```json
{
  "source_label": "AGS A-to-T spreadsheet",
  "source_batch": "ags_2026_07_02",
  "seed_email_enrichment": true,
  "create_call_tasks": false,
  "rows": [
    {
      "row_number": 2,
      "company": "Example Jewelers",
      "phone": "703-555-0100",
      "website": "https://example-jewelers.test",
      "notes": "Missing email; verify public contact page."
    }
  ]
}
```

Expected response invariants:

- `outbound_sent=false`
- no row writes when `status=needs_review`
- email enrichment is seeded for imported prospects when
  `seed_email_enrichment=true`
