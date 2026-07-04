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
- `review_prospect_research_evidence`: approves, rejects, or supersedes one
  evidence row and reports controlled promotion eligibility.

All tools return `outbound_sent=false`.

## Operating Flow

1. Prioritize prospects missing email, especially where a website/contact clue
   already exists.
2. Use `claim_prospect_research_batch` to get the next bounded research set.
3. Store public evidence with source URL, source type, confidence, and a concise
   search-location note.
4. Leave evidence in `pending_review` until Mitchel or the operator approves or
   rejects it.
5. Review evidence with `review_prospect_research_evidence`.
6. Treat `email_promotable=true` as eligible for a later controlled email
   enrichment apply path.
7. Treat `note_promotable=true` as eligible for a later concise prospect note
   promotion path.

The review tool reports eligibility only. It does not update
`trevor.prospects.email`, append prospect notes, create outreach tasks, or send
outbound messages.

## Hermes Subagent Workflow

The weekly deep research job uses Hermes native `delegate_task` support. The
parent job claims prospects, delegates bounded public research, applies the
quality gate, and is the only agent allowed to call
`store_prospect_research_evidence`.

Use leaf child agents with `toolsets=["web"]` and these roles:

- `source-finder`: find official sites/contact pages, city/town/chamber
  directories, credible business listings, and credible news or business
  context.
- `rdap-domain-verifier`: verify domain plausibility, registration status, or
  domain age for candidate domains. RDAP/WHOIS remains domain-verification only.
- `evidence-quality-reviewer`: check name/address/phone match strength,
  ambiguity, source type, confidence, and concise search-location notes.

Child agents must not call Trevor write tools, update prospect records, create
outreach tasks, or send outbound messages. Ambiguous findings should be
returned to the parent as rejected or needs-deeper-review, not stored as trusted
evidence.

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
The Hermes-compatible disabled install plan is
`tenants/hermes-mitchel/schedules/prospect-weekly-hermes-install-plan.json`.
The Central-time wake gate script is
`tenants/hermes-mitchel/scripts/prospect-weekly-central-gate.sh`.

It defines two disabled jobs:

- `trevor-missing-email-enrichment-weekly`
- `trevor-prospect-deep-research-weekly`

Both jobs are intended to run Saturday at 23:00 America/Chicago local
wall-clock time. Live Hermes cron is UTC-based, so the install plan uses cron
expression `0 4,5 * * 0` plus `prospect-weekly-central-gate.sh`. The cron
expression fires at both UTC hours that can correspond to Saturday 23:00
America/Chicago across CDT/CST; the wake gate returns `{"wakeAgent": false}`
unless the current Central local time is Saturday 23:00.

Initial missing-email enrichment rerun policy is conservative: process newly
queued, retryable error, or stale claimed enrichment work. Do not reset
completed `no_email_found` or `needs_review` rows every week until a separate
reviewed stale-retry policy/tool exists.

### Validation

Before enabling either job:

1. Confirm migration 055 is applied.
2. Confirm the deployed Trevor MCP server exposes all required tools from the
   scheduler template.
3. Copy `prospect-weekly-central-gate.sh` to `/opt/data/scripts/` and make it
   executable.
4. Verify the wake gate returns `wakeAgent=false` outside Saturday 23:00
   America/Chicago.
5. Run one on-demand missing-email enrichment smoke against a bounded batch.
6. Run one on-demand deep research smoke that stores reviewable evidence only.
7. Verify `trevor.prospects.email` changes only through the reviewed email
   enrichment apply path.
8. Verify neither job sends outbound messages or creates outreach tasks.
9. Get explicit operator approval to enable the jobs.

### Enable

Install the two jobs from the Hermes-compatible install plan only after
validation passes. Keep the job names and `origin` values unchanged so later
audits can connect production state back to this repository. Jobs must remain
`enabled=false` until explicit final enable approval.

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
- Deep research subagents may perform public research only; the parent job is
  responsible for all evidence writes.
- Neither weekly job may send outbound messages.
- Do-not-contact prospects may receive internal context evidence but no
  outreach task.
