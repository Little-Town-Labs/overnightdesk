# Prospect Deep Research

This runbook covers the review-first deep research workflow for Trevor
prospects. It stores public evidence linked to `trevor.prospects` and does not
send outbound messages or directly update `trevor.prospects.email`.

## Source Rules

- Use official websites/contact pages as the strongest email evidence.
- Use city, town, chamber, and business directories as strong public context
  when they identify the same business.
- Use news stories for business context such as expansion, closure, ownership,
  awards, relocation, or diamond-buying relevance.
- Use RDAP/WHOIS only to verify domain plausibility, registration status, or
  domain age. Do not use registrar abuse, privacy proxy, or personal registrant
  contacts as outreach emails.

## MVP Tools

- `claim_prospect_research_batch`: returns a bounded, read-only prospect list
  for research with missing-email prospects first.
- `store_prospect_research_evidence`: stores one bounded evidence row for one
  prospect.
- `list_prospect_research_evidence`: lists bounded evidence rows by prospect or
  review status.

Both tools return `outbound_sent=false`.

## Operating Flow

1. Prioritize prospects missing email, especially where a website/contact clue
   already exists.
2. Use `claim_prospect_research_batch` to get the next bounded research set.
3. Store public evidence with source URL, source type, confidence, and a concise
   search-location note.
4. Leave evidence in `pending_review` until Mitchel or the operator approves or
   rejects it.
5. Promote approved high-confidence email evidence only through a controlled
   email enrichment apply path.
6. Promote business context as concise prospect notes only after review.

## Safety Checks

- Never store raw page dumps or private contact data.
- Never fabricate emails from patterns.
- Never treat RDAP/WHOIS as sufficient email evidence.
- Keep notes bounded and source-attributed.
- Preserve all production deploys in
  `/home/frosted639/src/overnightdesk-suite/deploys.log`.

## Weekly Scheduler

The repo-owned scheduler template is
`tenants/hermes-mitchel/schedules/prospect-weekly-research-jobs.json`.

It defines two disabled jobs:

- `trevor-missing-email-enrichment-weekly`
- `trevor-prospect-deep-research-weekly`

Both jobs are intended to run Saturday at 23:00 America/Chicago local
wall-clock time. Use timezone-aware scheduler support when available. If a
UTC-only cron path is used, document the active CST/CDT conversion at install
time and revisit it before daylight-saving changes.

### Validation

Before enabling either job:

1. Confirm migration 055 is applied.
2. Confirm the deployed Trevor MCP server exposes all required tools from the
   scheduler template.
3. Run one on-demand missing-email enrichment smoke against a bounded batch.
4. Run one on-demand deep research smoke that stores reviewable evidence only.
5. Verify `trevor.prospects.email` changes only through the reviewed email
   enrichment apply path.
6. Verify neither job sends outbound messages or creates outreach tasks.
7. Get explicit operator approval to enable the jobs.

### Enable

Install the two jobs from the template only after validation passes. Keep the
job names and `origin` values unchanged so later audits can connect production
state back to this repository.

### Disable

Pause or disable both weekly jobs if MCP startup fails, evidence storage errors
increase, enrichment writes unexpected prospect emails, or the scheduler cannot
prove it is using Saturday 23:00 America/Chicago local time.

### Rollback

Disable the jobs first. If a deployment also introduced MCP or schema changes,
roll back the MCP server to the previous known-good version and preserve the
research evidence tables unless the operator explicitly requests a database
rollback.

### Owner

OvernightDesk operator with Mitchel/Trevor production approval.

### Log location

- Hermes scheduler state: `/opt/data/cron/jobs.json` on `aegis-prod`.
- Container logs: `docker logs hermes-mitchel`.
- Deployment records:
  `/home/frosted639/src/overnightdesk-suite/deploys.log`.

### Side-effect checks

- Missing-email enrichment may update `trevor.prospects.email` only through the
  existing reviewed enrichment apply path.
- Deep research may insert or update `trevor.prospect_research_evidence` only.
- Neither weekly job may send outbound messages.
- Do-not-contact prospects may receive internal context evidence but no
  outreach task.
