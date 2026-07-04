# Hermes Mitchel Prospecting System Roadmap

**Source:** `docs/hermes-mitchel-prospecting-prd.md`
**Parent Platform Roadmap:** `.specify/roadmap-v2.md`
**Generated:** 2026-06-23
**Scope:** Tenant-specific sales support system for `hermes-mitchel`

---

## Executive Summary

The Mitchel prospecting system turns the existing `hermes-mitchel` tenant,
`trevor` Postgres schema, and Agiled CRM tools into a daily sales-support
operating loop. The first useful product is not a dashboard. It is a reliable
assistant workflow that tells Mitchel who to call, why to call them, what to say
before the call, and what follow-up to send afterward.

**Total Features:** 12
**Phases:** 9
**Critical Path:** Schema Hardening -> Call Queue -> Post-Call Capture -> Follow-Up Drafting -> Scheduler -> Follow-Up Sent Logging -> Prospect Sourcing -> Internal Intake -> Mitchel Prospecting Dashboard -> Prospect Deep Research -> Public Landing Page

---

## Current Status

**Last Updated:** 2026-07-04
**Active Branch:** `011-prospect-deep-research`
**Latest Merged OvernightDesk SHA:** `eccc642`
**Latest Deployed OvernightDesk Source SHA:** `eccc642`
**Latest Deployed Engine SHA:** `b87702b`
**Latest Deployed Platform Standard SHA:** `fca6af6`
**Feature 1 Status:** Deployed to `aegis-prod`; platform-standard inventory PR #1 merged and standards consumer refreshed
**Feature 2 Status:** Merged via PR #8 and deployed to `aegis-prod/hermes-mitchel`
**Feature 3 Status:** Merged via PR #9 and deployed to `aegis-prod/hermes-mitchel`
**Feature 4 Status:** Merged via PR #10 and deployed to `aegis-prod/hermes-mitchel`
**Feature 5 Status:** Merged via PR #11 and deployed to `aegis-prod/hermes-mitchel`
**Feature 6 Status:** Merged via PR #12 and deployed to `aegis-prod/hermes-mitchel`
**Feature 7 Status:** Merged via PR #14 and deployed to `aegis-prod/hermes-mitchel`
**Feature 8 Status:** Merged via PR #15 and deployed to `aegis-prod/hermes-mitchel`; first bounded BrowserAct-first/CamoFox-enriched sourcing pass completed and verified; Trevor-only CamoFox enrichment tool deployed via PR #16 + PR #17
**Feature 9 Status:** Merged via PR #18 and deployed to `aegis-prod/hermes-mitchel`
**Feature 10 Status:** Merged via PR #19 and deployed to Vercel/Aegis production support
**Feature 11 Status:** Planned: Mitchel Brown Landing Page and Buyer Inquiry Form
**Feature 12 Status:** In progress on branch `011-prospect-deep-research`; Spec Kit artifacts initialized in `specs/011-prospect-deep-research`; first slice is the durable `trevor.prospect_research_evidence` table and MCP storage/listing contract.
**Next Work:** Finish Feature 12 MVP: apply migration 055 locally/production-reviewed path, add Trevor MCP storage/listing tools, run no-email-write smoke, then continue to prioritized missing-email claim order.

### Production Deployment Record

Feature 1 was deployed to `aegis-prod/tenet0-postgres/trevor` on
2026-06-24. The deployment record is in:

```text
/home/frosted639/src/overnightdesk-suite/deploys.log
```

Deployment facts:

- Backup captured:
  `/opt/overnightdesk/backups/trevor/trevor-schema-20260624T105145Z.dump`
- Migration applied: `tenet-0/db/migrations/051_trevor_prospecting.sql`
- Migration ledger: `public.schema_migrations(filename, applied_at)`
- Existing row counts after deployment:
  `prospects=43`, `interactions=0`, `memory=1`
- New table counts after deployment:
  `call_tasks=0`, `followup_drafts=0`
- Verification contract passed:
  `specs/001-trevor-prospecting-data-model/contracts/schema-verification.sql`
- `hermes-mitchel`, `trevor-db`, `agiled`, and `tenet0-postgres` were healthy
  after deployment.

Feature 2 was deployed to `aegis-prod/hermes-mitchel/trevor-db` on
2026-06-24. The deployment record is in the same deploy log.

Deployment facts:

- `overnightdesk` PR #8 merged into `main` at merge commit `4afaef8`.
- Deployed source commit: `7c26530`.
- Synced repo-controlled Trevor DB MCP runtime to:
  `/opt/data/mcp-servers/trevor-db`
- Synced daily call queue skill to:
  `/opt/data/skills/daily-call-queue`
- Restarted only `hermes-mitchel`.
- No-write production smoke with `persist=false` returned documented
  snake_case MCP fields.
- Production side-effect check remained clean:
  `call_tasks=0`, `interactions=0`, `dnc=0`.

Feature 3 was deployed to `aegis-prod/hermes-mitchel/trevor-db` on
2026-06-24. The deployment record is in the same deploy log.

Deployment facts:

- `overnightdesk` PR #9 merged into `main` at merge commit `12be55a`.
- Deployed source commit: `12be55a`.
- Synced repo-controlled Trevor DB MCP runtime to:
  `/opt/data/mcp-servers/trevor-db`
- Synced pre-call brief skill to:
  `/opt/data/skills/pre-call-brief`
- Restarted only `hermes-mitchel`.
- Verified `trevor-db` v1.2.0, `generate_daily_call_queue`,
  `generate_pre_call_brief`, `brief.js`, and readable skill file.
- Direct MCP entrypoint check connected to `tenet0-postgres` and reported
  ready.
- Production side-effect check remained clean:
  `call_tasks=0`, `interactions=0`.

Feature 4 was deployed to `aegis-prod/hermes-mitchel/trevor-db` on
2026-06-24. The deployment record is in the same deploy log.

Deployment facts:

- `overnightdesk` PR #10 merged into `main` at merge commit `cb6c3e5`.
- Deployed source commit: `cb6c3e5`.
- Synced repo-controlled Trevor DB MCP runtime to:
  `/opt/data/mcp-servers/trevor-db`
- Synced post-call capture skill to:
  `/opt/data/skills/post-call-capture`
- Restarted only `hermes-mitchel`.
- Verified `trevor-db` v1.3.0, `generate_daily_call_queue`,
  `generate_pre_call_brief`, `capture_post_call`, `capture.js`, and readable
  skill file.
- Direct MCP entrypoint check connected to `tenet0-postgres` and reported
  ready.
- Production side-effect check remained clean:
  `call_tasks=0`, `interactions=0`, `followup_drafts=0`.

Feature 5 was deployed to `aegis-prod/hermes-mitchel/trevor-db` on
2026-06-24. The deployment record is in the same deploy log.

Deployment facts:

- `overnightdesk` PR #11 merged into `main` at merge commit `aafbd1c`.
- Deployed source commit: `a5c330e`.
- Synced repo-controlled Trevor DB MCP runtime to:
  `/opt/data/mcp-servers/trevor-db`
- Synced follow-up drafting skill to:
  `/opt/data/skills/follow-up-drafting`
- Restarted only `hermes-mitchel`.
- Verified `trevor-db` v1.4.0, `generate_daily_call_queue`,
  `generate_pre_call_brief`, `capture_post_call`, `generate_follow_up_draft`,
  `mark_follow_up_draft`, `followup.js`, and readable skill file.
- Direct MCP entrypoint check connected to `tenet0-postgres` and reported
  ready.
- Production side-effect check remained clean:
  `call_tasks=0`, `interactions=0`, `followup_drafts=0`.

Feature 6 was deployed to `aegis-prod/hermes-mitchel/trevor-db` on
2026-06-24. The deployment record is in the same deploy log.

Deployment facts:

- `overnightdesk` PR #12 merged into `main` at merge commit `c0b0cd6`.
- Deployed source commit: `fcad184`.
- Synced repo-controlled Trevor DB MCP runtime to:
  `/opt/data/mcp-servers/trevor-db`
- Synced cadence digest skill to:
  `/opt/data/skills/cadence-digest`
- Synced cadence scheduler runbook to:
  `/opt/data/runbooks/cadence-scheduler.md`
- Restarted only `hermes-mitchel`.
- Verified `trevor-db` v1.5.0 marker, `generate_cadence_digest`,
  `digest.js`, and readable skill/runbook files.
- No-write production digest smoke returned `status=generated`,
  `scheduled=false`, `persistedCallTasks=false`, `createdTasks=0`, and
  outbound/interactions/follow-up side effects all false or zero.
- Production side-effect check remained clean:
  `call_tasks=0`, `interactions=0`, `followup_drafts=0`.

Feature 7 was deployed to `aegis-prod/hermes-mitchel/trevor-db` on
2026-06-24. The deployment record is in the same deploy log.

Deployment facts:

- `overnightdesk` PR #14 merged into `main` at merge commit `f3089cd`.
- Deployed source commit: `f3089cd`.
- Backup captured:
  `/opt/overnightdesk/backups/trevor/trevor-schema-20260624T174713Z.dump`
- Runtime backup captured:
  `/opt/data/mcp-servers/trevor-db/dist.pre-feature7-20260624T174828Z`
- Migration applied and ledgered:
  `tenet-0/db/migrations/052_trevor_followup_sent_logging.sql`
- Synced repo-controlled Trevor DB MCP runtime to:
  `/opt/data/mcp-servers/trevor-db`
- Synced follow-up drafting skill to:
  `/opt/data/skills/follow-up-drafting`
- Restarted only `hermes-mitchel`.
- Verified `trevor-db` v1.6.0, `list_follow_ups_awaiting_send`,
  `log_manual_follow_up_sent`, and readable skill file.
- Direct MCP stdio smoke listed 12 tools and returned an empty bounded send
  queue with `awaiting_send=0` and `review_only=0`.
- Production side-effect check remained clean:
  `call_tasks=0`, `interactions=0`, `followup_drafts=0`.

Feature 8 was deployed to `aegis-prod/hermes-mitchel/trevor-db` on
2026-06-24. The deployment record is in the same deploy log.

Deployment facts:

- `overnightdesk` PR #15 merged into `main` at merge commit `b374f72`.
- Deployed source commit: `b374f72`.
- Backup captured:
  `/opt/overnightdesk/backups/trevor/trevor-schema-20260624T193103Z.dump`
- Runtime backup captured:
  `/opt/data/mcp-servers/trevor-db/dist.pre-feature8-20260624T193103Z`
- Migration applied and ledgered:
  `tenet-0/db/migrations/053_trevor_prospect_sourcing.sql`
- Synced repo-controlled Trevor DB MCP runtime to:
  `/opt/data/mcp-servers/trevor-db`
- Synced prospect sourcing, BrowserAct, and CamoFox skills plus the prospect
  sourcing runbook to the Hermes Mitchel data volume.
- Restarted only `hermes-mitchel`.
- Verified `trevor-db` v1.7.0, `stage_prospect_candidates`,
  `review_prospect_candidates`, `promote_prospect_candidate`,
  `db-sourcing.js`, `sourcing.js`, and readable skill/runbook files.
- Direct MCP stdio smoke listed 15 tools and returned an empty bounded
  candidate review queue with `outbound_sent=false`.
- Production side-effect check remained clean:
  `call_tasks=0`, `interactions=0`, `followup_drafts=0`,
  `sourcing_runs=0`, `prospect_candidates=0`.

The first bounded Feature 8 production sourcing pass completed on 2026-06-24:

- Trevor used BrowserAct first for Arlington/Northern Virginia discovery, then
  staged 10 candidates in sourcing run `1`.
- No prospects were promoted and no call tasks, interactions, follow-up drafts,
  or outbound messages were created.
- The initial CamoFox path exposed a production mismatch: the CLI assumed
  localhost and tab follow-up calls required `userId`.
- PR #16 added a Trevor-only `trevor_camofox_enrich_url` MCP tool that calls
  the remote `camofox-browser:9377` service.
- PR #17 fixed the CamoFox tab `userId` contract found during production smoke
  testing.
- PR #16 + PR #17 were deployed to `aegis-prod/hermes-mitchel/trevor-db` at
  merge commit `802e48d`; `trevor-db` now reports v1.8.0 and the CamoFox smoke
  returns `status=ok` with `outbound_sent=false`.
- The CamoFox retry verified 9 staged candidates with
  `enrichment_source=camofox_website_recon`; 1 candidate, Arons Elegant, remains
  `needs_review` without CamoFox attribution.
- Current verified counts after the retry:
  `sourcing_runs=1`, `prospect_candidates=10`, `prospects=43`,
  `call_tasks=0`, `interactions=0`, `followup_drafts=0`.

Feature 9 was deployed to `aegis-prod/hermes-mitchel/trevor-db` on
2026-06-25. The deployment record is in the same deploy log.

Deployment facts:

- `overnightdesk` PR #18 merged Feature 9 into `main`.
- Synced built Trevor DB MCP runtime, source/tests, the
  internal-buyer-intake skill, and the operator runbook to the
  `hermes-mitchel` data volume.
- Restarted only `hermes-mitchel`.
- Direct MCP validation confirmed `capture_buyer_intake` and a validate-only
  `mitchelbrown.com` intake path with `outbound_sent=false`.
- Production side-effect check remained clean:
  `prospects=43`, `interactions=0`, `call_tasks=0`,
  `followup_drafts=0`, `sourcing_runs=1`, `prospect_candidates=10`.

Feature 10 was deployed on 2026-06-25 after `overnightdesk` PR #19 and
`overnightdesk-engine` PR #1 merged. The deployment record is in the same
deploy log.

Deployment facts:

- `overnightdesk` PR #19 merged Feature 10 into `main` at `5cf5959`.
- `overnightdesk-engine` PR #1 merged the Mitchel summary provisioner support
  into `main` at `b87702b`.
- Synced `hermes-mitchel` tenant Trevor DB MCP, skills, and runbooks to the
  production data volume and restarted `hermes-mitchel`.
- Rebuilt/restarted `platform-orchestrator` with the production Phase-injected
  start path.
- Installed the ARM64 `hermes-provisioner` binary with the
  `/mitchel/prospecting/summary` route.
- Public provisioner `/healthz` returned `200`; authenticated Mitchel summary
  returned `200` with `prospects=25`, `stagedCandidates=10`,
  `reviewItems=1`, `callTasks=0`, `followUpDrafts=0`, and
  `outboundSent=false`.

### Open Follow-Ups

- `overnightdesk-platform-standard` PR #1 documented the new Trevor tables and
  prospect cadence fields. It was merged on 2026-06-24, then
  `~/overnightdesk-platform-standard` was pulled on aegis-prod and
  `overnightdesk-ops` was restarted.
- `overnightdesk` PR #7 fixed the migration runner issue found during
  deployment and has been merged into `main`.
- `overnightdesk` PR #8 delivered Feature 2, `daily-call-queue`, and has been
  merged into `main`.
- `overnightdesk` PR #9 delivered Feature 3, `pre-call-brief`, and has been
  merged into `main` and deployed to `aegis-prod/hermes-mitchel`.
- `overnightdesk` PR #10 delivered Feature 4, `post-call-capture`, and has
  been merged into `main` and deployed to `aegis-prod/hermes-mitchel`.
- `overnightdesk` PR #11 delivered Feature 5, `follow-up-drafting`, and has
  been merged into `main` and deployed to `aegis-prod/hermes-mitchel`.
- `overnightdesk` PR #12 delivered Feature 6, `cadence-scheduler-digest`, and
  has been merged into `main` and deployed to `aegis-prod/hermes-mitchel`.
- `overnightdesk` PR #13 delivered Feature 7 Spec Kit artifacts for the
  follow-up sent logging workflow and has been merged into `main`.
- `overnightdesk` PR #14 delivered Feature 7 implementation and has been
  merged into `main` and deployed to `aegis-prod/hermes-mitchel`.
- `overnightdesk` PR #15 delivered Feature 8, `prospect-sourcing-pipeline`,
  and has been merged into `main` and deployed to `aegis-prod/hermes-mitchel`.
- `overnightdesk` PR #16 delivered the Trevor-only CamoFox enrichment tool.
- `overnightdesk` PR #17 fixed the production CamoFox `userId` tab contract.
- `overnightdesk` PR #18 delivered Feature 9, `internal-buyer-intake`, and has
  been merged into `main` and deployed to `aegis-prod/hermes-mitchel`.
- `overnightdesk` PR #19 delivered Feature 10, `mitchel-prospecting-dashboard`,
  and has been merged into `main` and deployed with Aegis production support.
- `overnightdesk` commit `5cf5959` records the latest deployed
  Mitchel dashboard source state.

---

## What Already Exists

| Component | Location | Status |
|-----------|----------|--------|
| Mitchel Hermes tenant | `hermes-mitchel` on aegis-prod | Live |
| Tenant data volume | `hermes-mitchel-data:/opt/data` | Live |
| Trevor Postgres schema | `tenet0-postgres.trevor` | Live |
| Prospect table | `trevor.prospects` | Live, populated |
| Interaction table | `trevor.interactions` | Live, empty |
| Memory table | `trevor.memory` | Live, minimal |
| Call task table | `trevor.call_tasks` | Live, empty |
| Follow-up draft table | `trevor.followup_drafts` | Live, empty |
| Prospect sourcing run table | `trevor.prospect_sourcing_runs` | Live, 1 bounded Arlington/Northern Virginia run staged |
| Prospect candidate table | `trevor.prospect_candidates` | Live, 10 staged candidates; 9 recommended and CamoFox-verified, 1 needs review |
| Trevor DB MCP server | `/opt/data/mcp-servers/trevor-db` | Live with daily call queue, pre-call brief, post-call capture, follow-up drafting, cadence digest, follow-up sent logging, prospect sourcing, Trevor-only CamoFox enrichment, and internal buyer intake tools |
| Agiled MCP server | `/opt/data/mcp-servers/agiled` | Live |
| Diamond client skill | `/opt/data/skills/diamond-clients` | Live |
| Daily call queue skill | `/opt/data/skills/daily-call-queue` | Live |
| Pre-call brief skill | `/opt/data/skills/pre-call-brief` | Live |
| Post-call capture skill | `/opt/data/skills/post-call-capture` | Live |
| Follow-up drafting skill | `/opt/data/skills/follow-up-drafting` | Live |
| Cadence digest skill | `/opt/data/skills/cadence-digest` | Live |
| Cadence scheduler runbook | `/opt/data/runbooks/cadence-scheduler.md` | Live |
| Prospect sourcing skill | `/opt/data/skills/prospect-sourcing` | Live |
| Internal buyer intake skill | `/opt/data/skills/internal-buyer-intake` | Live |
| Internal buyer intake runbook | `/opt/data/runbooks/internal-buyer-intake.md` | Live |
| BrowserAct prospect sourcing skill | `/opt/data/skills/web/browseract` | Live |
| CamoFox enrichment skill | `/opt/data/skills/web/camofox-browser` | Live |
| Prospect sourcing runbook | `/opt/data/runbooks/prospect-sourcing.md` | Live |
| Agiled workflow skills | `/opt/data/skills/agiled/*` | Live |
| Prospecting PRD | `docs/hermes-mitchel-prospecting-prd.md` | Drafted |
| Feature 1 migration | `tenet-0/db/migrations/051_trevor_prospecting.sql` | Deployed |
| Feature 7 migration | `tenet-0/db/migrations/052_trevor_followup_sent_logging.sql` | Deployed |
| Feature 8 migration | `tenet-0/db/migrations/053_trevor_prospect_sourcing.sql` | Deployed |
| Platform standard update | `overnightdesk-platform-standard` PR #1 | Merged and deployed to standards consumer |

---

## Feature Inventory

### Feature 1: Trevor Prospecting Data Model

**Source:** PRD "Proposed Data Model Changes"
**Description:** Make the `trevor` schema reproducible and cadence-ready. Add
next-action fields to prospects, introduce a call-task table, introduce
follow-up draft storage, and document backup/rollback for production schema
deployment.

**Complexity:** Medium
**Priority:** P0
**Dependencies:** Existing `tenet0-postgres` access and current `trevor` schema
**Blocks:** Features 2, 3, 4, 5, 6

**Completion Gate:**

- [x] Schema migration exists in repo-controlled form.
- [x] Migration can be applied idempotently or with a documented safe check.
- [x] Backup command for `trevor` schema is documented.
- [x] Rollback strategy is documented.
- [x] Platform database docs updated after deployment.

---

### Feature 2: Daily Call Queue

**Source:** PRD "Daily Call Queue" and "Call Queue Generation"
**Description:** Generate a ranked list of prospects Mitchel should call today,
including reason, objective, buyer context, and suggested opener. Suppress
do-not-contact records and promote overdue next actions, stale deals, and
inventory matches when available.

**Complexity:** Medium
**Priority:** P0
**Dependencies:** Feature 1
**Blocks:** Feature 3 and Feature 5

**Completion Gate:**

- [x] Mitchel can ask "who should I call today?" and get a ranked list.
- [x] Each recommendation includes a clear reason and call objective.
- [x] Queue excludes do-not-contact prospects.
- [x] Queue can run on demand through `hermes-mitchel`.
- [x] Results are stable enough to be written into `trevor.call_tasks`.

---

### Feature 3: Pre-Call Brief

**Source:** PRD "Pre-Call Brief"
**Description:** Given a prospect or call-task, produce a concise call brief:
identity, company, last touch, current status, open Agiled context, buyer
preferences, likely objection, suggested ask, and follow-up fallback.

**Complexity:** Small
**Priority:** P0
**Dependencies:** Feature 1 and Feature 2
**Blocks:** Feature 4

**Completion Gate:**

- [x] Mitchel can request a brief by prospect name, company, or task.
- [x] Brief pulls from Trevor Postgres and clearly marks unavailable linked
  Agiled context.
- [x] Brief clearly states missing data instead of inventing it.
- [x] Brief is short enough for use immediately before a phone call.

---

### Feature 4: Post-Call Capture

**Source:** PRD "Call Capture" and "Post-Call Capture"
**Description:** After a call, Trevor captures structured outcome data, updates
the prospect, writes an interaction, reports Agiled note status when linked, and
sets the next action.

**Complexity:** Medium
**Priority:** P0
**Dependencies:** Feature 1 and Feature 3
**Blocks:** Feature 5 and Feature 6

**Completion Gate:**

- [x] Mitchel can report a call outcome through the purpose-built capture tool.
- [x] Trevor asks only for missing required fields.
- [x] `trevor.interactions` receives a durable record.
- [x] `trevor.prospects` receives last-contact, last-outcome, and next-action updates.
- [x] Agiled note status is reported as created, skipped, failed, or not requested.
- [x] The workflow never sends outbound follow-up automatically.

---

### Feature 5: Follow-Up Drafting

**Source:** PRD "Follow-Up Composer"
**Description:** Generate channel-specific follow-up drafts from call outcomes
and buyer profiles. Store drafts for approval before external sending. Initial
delivery can be copy-ready text; direct channel send is deferred until approval,
audit, and opt-out handling are proven.

**Complexity:** Medium
**Priority:** P1
**Dependencies:** Feature 1 and Feature 4
**Blocks:** Feature 6

**Completion Gate:**

- [x] Trevor can draft email, Telegram, SMS-copy, and social-copy follow-ups.
- [x] Drafts are stored in `trevor.followup_drafts`.
- [x] Draft status tracks draft, approved, or discarded. `sent` and
  `manual_sent` remain reserved for later send/log workflows.
- [x] Explicit Mitchel approval is required before any send-capable integration.
- [ ] Approved or manually sent follow-up can be logged back to
  `trevor.interactions` in a later explicit workflow.

---

### Feature 6: Cadence Scheduler and Digest

**Source:** PRD "Cadence Engine" and "Deployment Plan"
**Description:** Activate the operating loop with scheduled or on-demand
digests: morning prospecting queue, stale-deal scan, follow-up reminder, and
optional dormant-buyer reactivation.

**Complexity:** Medium
**Priority:** P1
**Dependencies:** Features 2, 4, and 5
**Blocks:** Future dashboard and analytics work

**Completion Gate:**

- [x] Morning digest can run on demand.
- [ ] Scheduled execution path is documented and enabled after manual validation.
- [x] Stale prospects and follow-up drafts appear in the digest.
- [x] Scheduler output avoids exposing secrets or unnecessary prospect details in logs.
- [x] Operator runbook covers validation and disabling jobs.

---

### Feature 7: Follow-Up Sent Logging

**Source:** Feature 5 deferred send/log workflow and PRD "Follow-Up Composer"
**Description:** Record approved or manually sent follow-up messages back to
`trevor.interactions` without sending outbound messages. List approved drafts
awaiting send confirmation, mark confirmed human sends as `manual_sent`, and
capture channel, timestamp, operator, and optional external reference.

**Complexity:** Small
**Priority:** P1
**Dependencies:** Feature 5 and Feature 6
**Blocks:** Direct channel sends and reliable follow-up completion analytics

**Completion Gate:**

- [x] Approved follow-up drafts awaiting send confirmation can be listed.
- [x] An approved draft can be explicitly logged as manually sent.
- [x] Successful manual sent logging creates exactly one interaction row.
- [x] Invalid or duplicate sent confirmations create no interaction rows.
- [x] Do-not-contact confirmations require an explicit audit-only reason.
- [x] The workflow never sends outbound messages.

---

### Feature 8: Prospect Sourcing Pipeline

**Source:** Live Aegis `hermes-mitchel` BrowserAct/CamoFox skills, production
Trevor memory, and PRD goal "Turn a static prospect list into a daily
prospecting operating system."

**Description:** Capture the existing BrowserAct and CamoFox web-scraping
prospect discovery workflow in repo-controlled artifacts. BrowserAct provides
the first-pass bulk discovery and template contact finding; CamoFox enriches or
verifies BrowserAct candidates when website/contact data is incomplete. Stage
scraped candidate businesses for review, dedupe against Trevor and Agiled,
preserve source attribution, and promote only approved candidates into the
daily call queue. This feature is about finding qualified prospects, not
inventory; Mitchel's wholesaler handles inventory and drop shipping.

**Complexity:** Medium
**Priority:** P1
**Dependencies:** Feature 2 call queue, Feature 3 brief, existing CamoFox
container, existing BrowserAct workflow knowledge, and existing Trevor prospect
schema
**Blocks:** Scaled prospecting cadence, source attribution analytics, and any
future website-intake attribution loop

**Completion Gate:**

- [x] BrowserAct and CamoFox prospect-sourcing skills are source-controlled
  without live credentials.
- [x] Sourced candidates can be staged before becoming active prospects.
- [x] Candidate review separates recommended, needs-review, duplicate, and
  rejected records.
- [x] Duplicate and chain-store candidates create no active prospects or call
  tasks.
- [x] Approved candidates preserve `lead_source` when promoted.
- [x] Approved candidates can create exactly one initial outreach call task.
- [x] The workflow never sends outbound messages.
- [x] First bounded production sourcing pass completed: 10 staged candidates, 9
  CamoFox-verified recommended candidates, 1 needs-review candidate, and no
  unintended prospect, call-task, interaction, follow-up, or outbound side
  effects.

---

### Feature 9: Internal Buyer Intake and Conversation Capture

**Source:** User direction after Feature 8 deployment: Mitchel needs a fast way
to enter buyer/prospect data when he talks to people, preferably inside the
OvernightDesk/Hermes page he already uses.

**Description:** Add an internal intake workflow to the existing
OvernightDesk/Hermes interaction surface so Mitchel can capture a new buyer,
update an existing prospect, and record conversation details without leaving
the assistant. The workflow should accept structured fields and free-form notes,
dedupe against Trevor and Agiled, update `trevor.prospects`, write a
`trevor.interactions` record, preserve source attribution, and optionally create
a next call task or follow-up draft. This is the reusable intake backend that a
future public website form should use.

**Complexity:** Medium
**Priority:** P1
**Dependencies:** Feature 1 schema, Feature 4 post-call capture, Feature 5
follow-up drafting, Feature 7 sent logging, and Feature 8 candidate sourcing
dedupe/source attribution patterns
**Blocks:** Public buyer inquiry form, cleaner Agiled/Trevor sync, and faster
manual data entry after live conversations

**Completion Gate:**

- [x] Mitchel can enter or paste conversation notes from the existing
  OvernightDesk/Hermes experience.
- [x] Intake can find or create a Trevor prospect without creating duplicates
  in local Trevor MCP tests.
- [x] Intake can capture name, company, phone, email, source, buyer
  preferences, budget/timing, and next action when provided.
- [x] Intake writes a bounded `trevor.interactions` record for the conversation
  in local Trevor MCP tests.
- [x] Intake can optionally create a call task or follow-up draft without
  sending outbound messages in local Trevor MCP tests.
- [x] Agiled create/update behavior is explicit and reports linked, created,
  updated, skipped, or failed status without blocking Trevor writes.
- [x] The same backend contract can support a later public website inquiry
  form, including `mitchelbrown.com` source attribution.
- [x] Quality gate and Aegis production validation are complete.
- [x] Feature 9 is merged and deployed to `aegis-prod/hermes-mitchel`.

---

### Feature 10: Mitchel Prospecting Dashboard in OvernightDesk

**Source:** User direction after Feature 9 planning: Mitchel logs into the
OvernightDesk platform and should see a customized tenant frontend for Trevor
prospecting, with access to his Hermes agent dashboard and a structured way to
review prospect data that may not exist in Agiled yet.

**Description:** Add a Mitchel-specific prospecting workspace inside the
existing authenticated OvernightDesk dashboard. When the logged-in user's
running instance is `hermes-mitchel`, the dashboard should show Trevor
prospecting data and actions alongside the existing embedded Hermes chat and
"Launch Dashboard" link. The first useful surface should show Trevor-only
prospects, staged candidates, today's call tasks, review-needed items, and
follow-up drafts without requiring Mitchel to ask Trevor in chat for every
status check. The workflow remains human-in-the-loop and does not send outbound
messages automatically.

Hermes Kanban can be used as a visual process surface where appropriate, but it
should not become the prospect system of record. Trevor Postgres remains the
durable prospecting source for prospects, call tasks, interactions, candidates,
and follow-up drafts. Any card movement or process action should call a narrow
Trevor workflow/API that updates those durable records.

**Hermes API Research Notes:** Hermes documents two relevant interfaces:

- The OpenAI-compatible API server exposes chat, responses, runs, jobs,
  sessions, skills, and toolset discovery behind bearer-token auth. It is a
  good fit for chat/run/session integration and capability discovery, not for
  direct Trevor prospect CRUD.
- The Hermes Kanban dashboard plugin exposes REST routes under
  `/api/plugins/kanban/` for board reads, task CRUD, comments, dispatch nudges,
  config, and live events. The docs warn that plugin routes are unauthenticated
  by design when the dashboard is bound locally, so OvernightDesk must not
  expose those routes directly over the public platform without its own auth
  proxy and tenant gate.

**Complexity:** Medium
**Priority:** P1
**Dependencies:** Feature 9 internal intake backend, existing OvernightDesk
login/dashboard, existing `hermes-mitchel` tenant, Trevor MCP tools, Hermes
dashboard/API research, and production validation of the live `hermes-mitchel`
dashboard/kanban configuration
**Blocks:** A practical Mitchel operator workspace, faster review of
Trevor-only prospects, safer candidate promotion, and a better authenticated
entry point before the public website form

**Completion Gate:**

- [x] OvernightDesk identifies the logged-in Mitchel tenant safely, using an
  explicit `hermes-mitchel` tenant gate rather than broad Hermes detection.
- [x] Mitchel can open the OvernightDesk dashboard and see a customized Trevor
  prospecting workspace.
- [x] The workspace keeps the existing embedded Hermes/Trevor chat available.
- [x] The workspace keeps the existing link to the Hermes agent dashboard.
- [x] The workspace lists Trevor-only prospects and staged candidates that may
  not exist in Agiled yet.
- [x] The workspace shows today's call tasks and review-needed items.
- [x] The first implementation is read-only or review-only unless a narrow
  write action has explicit tests and no-outbound guarantees.
- [x] Any Kanban integration is auth-proxied through OvernightDesk and mapped
  back to Trevor durable records, not exposed directly as an unauthenticated
  dashboard plugin route.
- [x] No platform route receives or stores `TREVOR_DB_URL`; Trevor database
  access stays in the tenant-local boundary unless a separate security review
  approves otherwise.
- [x] Quality gate and Aegis production validation are complete.
- [x] Feature 10 is merged and deployed.

---

### Feature 11: Mitchel Brown Landing Page and Buyer Inquiry Form

**Source:** PRD Phase 6 public website concept plus user direction that the
public form can be separate later if the internal intake workflow comes first,
and that current website/book content should move under
`mitchelbrown.com/books`.

**Description:** Build a focused `mitchelbrown.com` landing page for buyer
credibility and inbound inquiry capture. The page should route buyer inquiries
through the Feature 9 intake contract, preserve `mitchelbrown.com` source
attribution, dedupe against existing Trevor/Agiled records, and avoid creating
active sales work until the inquiry is reviewed or safely staged. Existing
website/book content should remain available under `/books` so the root domain
can become the buyer-focused landing page without losing the current content.
Initial positioning direction: "Mitchel Brown: Diamonds, Jewelry, and More" or
a similar brand-forward headline that can support diamonds, jewelry, books, and
future buyer relationships without feeling like only a form page.

**Complexity:** Medium
**Priority:** P2
**Dependencies:** Feature 9 internal intake backend, Feature 10 authenticated
operator review workflow, and source attribution contract
**Blocks:** Public inbound acquisition, website source attribution analytics,
and future public buyer self-service flows

**Completion Gate:**

- [ ] Audience, positioning, and primary call to action are defined, starting
  from the "Mitchel Brown: Diamonds, Jewelry, and More" direction.
- [ ] Landing page has a buyer inquiry path with spam/abuse controls.
- [ ] Inquiry submissions route through the Feature 9 intake contract.
- [ ] Submissions preserve source attribution as `mitchelbrown.com`.
- [ ] Duplicate prospects are staged or linked instead of blindly created.
- [ ] Existing website/book content is preserved or redirected under
  `mitchelbrown.com/books`.
- [ ] Hosting ownership is decided: OvernightDesk-managed infrastructure or a
  separate marketing deployment.
- [ ] No public form stores secrets, exposes internal IDs unnecessarily, or
  sends outbound messages automatically.

---

## Deferred Features

### Inventory Matching

**Reason Deferred:** Mitchel currently works with a wholesaler that handles
inventory and drop shipping, so buyer prospect discovery is more important than
inventory matching. Matching can return later as optional enrichment if a
durable inventory source becomes useful.

**Future Work:**

- Define inventory source: Google Sheet, Agiled, Postgres, or dedicated service.
- Add buyer-to-stone matching.
- Add stone-to-buyer recommendations.
- Add weekly availability workflow integration.

### Dashboard Analytics Enhancements

**Reason Deferred:** Feature 10 should first create the authenticated Mitchel
operator workspace and prove the core review/call workflow. Rich analytics can
follow after the UI has real usage.

**Future Work:**

- Calls queued/completed dashboard.
- Follow-up approval queue UI.
- Stale prospect report.
- Won/lost reason tracking.

### Direct Channel Sends

**Reason Deferred:** Automated outbound messaging has trust, compliance, and
channel-policy risk.

**Future Work:**

- Email draft/send integration.
- Telegram send with approval.
- Browser-assisted social messaging.
- Opt-out and audit enforcement.

## Dependency Graph

```text
Feature 1 (Trevor Prospecting Data Model)
    |
    +--> Feature 2 (Daily Call Queue)
    |         |
    |         +--> Feature 3 (Pre-Call Brief)
    |                   |
    |                   +--> Feature 4 (Post-Call Capture)
    |                             |
    |                             +--> Feature 5 (Follow-Up Drafting)
    |                                       |
    |                                       +--> Feature 6 (Cadence Scheduler and Digest)
    |                                                 |
    |                                                 +--> Feature 7 (Follow-Up Sent Logging)
    |                                                           |
    |                                                           +--> Feature 8 (Prospect Sourcing Pipeline)
    |                                                                     |
    |                                                                     +--> Feature 9 (Internal Buyer Intake and Conversation Capture)
    |                                                                               |
    |                                                                               +--> Feature 10 (Mitchel Prospecting Dashboard in OvernightDesk)
    |                                                                                         |
    |                                                                                         +--> Feature 11 (Mitchel Brown Landing Page and Buyer Inquiry Form)
    |
    +--> Future: Inventory Matching
    +--> Future: Dashboard Analytics Enhancements
```

**Critical Path:** 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11

---

## Implementation Phases

### Phase 1: Data Foundation

**Goal:** The production `trevor` schema can safely support prospecting cadence.

**Features:**

- Feature 1: Trevor Prospecting Data Model

**Completion Gate:**

- [x] Production backup captured before schema change.
- [x] Migration applied and verified.
- [x] `trevor_app` grants verified.
- [x] Platform standard docs updated with final schema.

---

### Phase 2: Human-in-the-Loop Call Workflow

**Goal:** Mitchel can use Trevor before and after real phone calls.

**Features:**

- Feature 2: Daily Call Queue
- Feature 3: Pre-Call Brief
- Feature 4: Post-Call Capture

**Completion Gate:**

- [x] On-demand call queue works.
- [x] Prospect brief works.
- [x] Post-call capture writes Postgres records and reports Agiled note status.
- [x] No outbound message is sent automatically.

---

### Phase 3: Follow-Up Control Loop

**Goal:** Every meaningful call can produce an approval-controlled follow-up.

**Features:**

- Feature 5: Follow-Up Drafting

**Completion Gate:**

- [x] Follow-up draft can be generated from a captured call outcome.
- [x] Draft is stored and linked to prospect/interaction.
- [x] Approval status is explicit.
- [x] Approved or manually sent follow-up can be logged by a later explicit
  workflow.

---

### Phase 4: Cadence Automation

**Goal:** The sales-support workflow becomes a daily operating loop.

**Features:**

- Feature 6: Cadence Scheduler and Digest

**Completion Gate:**

- [x] Morning digest is validated manually.
- [ ] Scheduler is enabled only after on-demand output is trusted.
- [x] Stale-deal and follow-up reminders appear.
- [x] Disable/rollback instructions are documented.

---

### Phase 5: Follow-Up Closure

**Goal:** Approved or manually sent follow-ups become durable prospect history.

**Features:**

- Feature 7: Follow-Up Sent Logging

**Completion Gate:**

- [x] Approved drafts awaiting send confirmation can be reviewed.
- [x] Manual sent confirmations write interactions and update draft status.
- [x] Safety guards block invalid, duplicate, and unsafe confirmations.
- [x] Direct outbound send remains deferred.

---

### Phase 6: Prospect Pipeline Growth

**Goal:** Mitchel can safely find new qualified buyer prospects and feed
approved records into the existing call loop.

**Features:**

- Feature 8: Prospect Sourcing Pipeline

**Completion Gate:**

- [x] Existing CamoFox and BrowserAct prospect discovery behavior is captured
  in repo-controlled skill docs without secrets.
- [x] Scraped candidates are staged and reviewed before active prospect writes.
- [x] Review status, dedupe status, and source attribution are durable.
- [x] Approved candidates can enter the daily call queue.
- [x] No sourcing or promotion path sends outbound messages.

---

### Phase 7: Internal Intake and Conversation Capture

**Goal:** Mitchel can quickly capture buyer/prospect details from live
conversations inside the existing OvernightDesk/Hermes experience.

**Features:**

- Feature 9: Internal Buyer Intake and Conversation Capture

**Completion Gate:**

- [ ] Intake form/workflow is available from the existing Hermes interaction
  surface.
- [ ] Trevor and Agiled dedupe behavior is explicit.
- [ ] Conversation notes become structured prospect updates and interaction
  history.
- [ ] Next action, call task, and follow-up draft creation remain
  approval-controlled and no-send by default.

---

### Phase 8: Authenticated Mitchel Operator Workspace

**Goal:** Mitchel can log into OvernightDesk and review Trevor prospecting work
from a customized tenant dashboard without leaving the platform.

**Features:**

- Feature 10: Mitchel Prospecting Dashboard in OvernightDesk

**Completion Gate:**

- [ ] Mitchel's OvernightDesk dashboard is tenant-gated to `hermes-mitchel`.
- [ ] Trevor prospects, staged candidates, call tasks, and review-needed items
  are visible from the dashboard.
- [ ] Hermes chat and the Hermes agent dashboard link remain available.
- [ ] Any write action is routed through a narrow, tested Trevor workflow/API.
- [ ] Hermes Kanban use is researched against live `hermes-mitchel` and not
  exposed directly without OvernightDesk auth proxying.

---

### Phase 9: Prospect Deep Research

**Goal:** Mitchel can build richer context and contact evidence for every
Trevor prospect, with missing-email prospects prioritized and all findings
stored for review before promotion.

**Features:**

- Feature 12: Prospect Deep Research

**Completion Gate:**

- [x] Spec Kit artifacts define all-prospect scope, missing-email priority,
  RDAP/WHOIS domain-verification-only rules, and review-first evidence storage.
- [x] Additive migration 055 defines `trevor.prospect_research_runs` and
  `trevor.prospect_research_evidence`.
- [x] MVP MCP storage/listing tools are implemented locally with tests.
- [x] Production migration and MCP deployment are completed with schema backup.
- [x] Prioritized missing-email claim order is implemented.
- [x] Review and controlled promotion eligibility workflow is implemented.
- [ ] Weekly missing-email enrichment and deep research scheduler is validated
  for Saturday 23:00 America/Chicago and enabled only after explicit approval.

---

### Phase 10: Public Buyer Acquisition

**Goal:** `mitchelbrown.com` can capture inbound buyer inquiries through the
same reviewed intake path used internally.

**Features:**

- Feature 11: Mitchel Brown Landing Page and Buyer Inquiry Form

**Completion Gate:**

- [ ] Public page positioning and audience are defined.
- [ ] Buyer inquiry form routes through the Feature 9 intake contract.
- [ ] Existing website/book content is preserved under `/books`.
- [ ] Spam/abuse, duplicate handling, and source attribution are in place.
- [ ] Hosting and operational ownership are documented.

---

## Execution Checklist

### Phase 1

- [x] **Feature 1: Trevor Prospecting Data Model**
  - [x] `$speckit-specify` for `trevor-prospecting-data-model`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [x] `$speckit-implement`
  - [x] Production backup and deployment record
  - [x] Merge platform-standard schema inventory PR

### Phase 2

- [x] **Feature 2: Daily Call Queue**
  - [x] `$speckit-specify` for `daily-call-queue`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [x] `$speckit-implement`
  - [x] Production sync and no-write validation

- [x] **Feature 3: Pre-Call Brief**
  - [x] `$speckit-specify` for `pre-call-brief`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [x] `$speckit-implement`
  - [x] Production sync and no-write validation

- [x] **Feature 4: Post-Call Capture**
  - [x] `$speckit-specify` for `post-call-capture`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [x] `$speckit-implement`
  - [x] Production sync and no-write validation

### Phase 3

- [x] **Feature 5: Follow-Up Drafting**
  - [x] `$speckit-specify` for `follow-up-drafting`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [x] `$speckit-implement`
  - [x] Quality gate, Aegis comparison, and PR
  - [x] Merge and deployment

### Phase 4

- [x] **Feature 6: Cadence Scheduler and Digest**
  - [x] `$speckit-specify` for `cadence-scheduler-digest`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [x] `$speckit-implement`
  - [x] Merge and deployment
  - [ ] Scheduler enablement after sustained manual validation

### Phase 5

- [x] **Feature 7: Follow-Up Sent Logging**
  - [x] `$speckit-specify` for `follow-up-sent-logging`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [x] `$speckit-implement`
  - [x] Quality/Aegis validation
  - [x] Merge and deployment

### Phase 6

- [x] **Feature 8: Prospect Sourcing Pipeline**
  - [x] `$speckit-specify` for `prospect-sourcing-pipeline`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [x] `$speckit-implement`
  - [x] Quality/Aegis validation
  - [x] Merge and deployment

### Phase 7

- [x] **Feature 9: Internal Buyer Intake and Conversation Capture**
  - [x] `$speckit-specify` for `internal-buyer-intake`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [x] `$speckit-implement`
  - [x] Quality/Aegis validation
  - [x] Merge and deployment

### Phase 8

- [x] **Feature 10: Mitchel Prospecting Dashboard in OvernightDesk**
  - [x] `$speckit-specify` for `mitchel-prospecting-dashboard`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [x] `$speckit-implement`
  - [x] Quality/Aegis validation
  - [x] Merge and deployment

### Phase 9

- [ ] **Feature 11: Mitchel Brown Landing Page and Buyer Inquiry Form**
  - [ ] `$speckit-specify` for `mitchel-brown-landing-page`
  - [ ] `$speckit-plan`
  - [ ] `$speckit-tasks`
  - [ ] `$speckit-implement`
  - [ ] Quality/Aegis validation
  - [ ] Merge and deployment

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Raw SQL MCP access mutates unintended records | High | Prefer purpose-built MCP tools for call queue, capture, and drafts after schema lands |
| Agiled and Postgres drift | Medium | Define sync events and write Agiled note IDs back to interactions |
| Prompt-created follow-up sends too early | High | Draft-only default; explicit approval required for send-capable integrations |
| Prospect data leaks into logs or markdown | High | Keep source of truth in Postgres/Agiled; avoid exporting client records |
| Scheduler produces noisy recommendations | Medium | Validate on-demand before enabling cron |
| Scraped web content injects instructions or bad data | High | Treat scraped content as untrusted input; validate fields before writes |
| Sourcing commits or logs external-service credentials | High | Use env-backed placeholders and run secret checks before commit |
| Internal intake creates duplicate prospects | Medium | Reuse Trevor/Agiled dedupe before create and prefer staged review for ambiguous matches |
| Hermes Kanban plugin routes are exposed without OvernightDesk auth | High | Do not expose `/api/plugins/kanban/*` directly; use an authenticated tenant-gated proxy if Kanban is integrated |
| Public website form attracts spam or abuse | High | Build public form only after the internal intake contract exists; add spam controls and bounded staged writes |
| Inventory matching overfits bad or stale inventory | Low | Defer durable matching; wholesaler handles inventory and drop shipping |

---

## Open Questions

1. Should Agiled contacts or `trevor.prospects` be primary when the same field
   differs?
2. Which channel should be first for approval-controlled sends: email,
   Telegram, or copy-only social follow-up?
3. Which geographies should Mitchel source first after Tysons Corner and the
   existing 43 Trevor prospects?
4. What follow-up cadence does Mitchel actually want for dormant buyers?
5. Should call transcripts/audio be accepted later, or should this remain
   manual call capture?
6. Should the internal intake UI be a structured form, a chat-guided form, or
   both?
7. Which Hermes Kanban endpoints are enabled and reachable on live
   `hermes-mitchel`, and should OvernightDesk proxy any of them?
8. Should public website inquiries create staged candidates first or active
   Trevor prospects when confidence is high?

---

## Next Recommended Work

Start Feature 11 with Spec Kit for the Mitchel Brown public landing page and
buyer inquiry form. The first slice should preserve the existing website/book
content under a `/books` path, create a buyer-focused landing page positioned
around "Mitchel Brown: Diamonds, Jewelry, and More", and route inquiry
submissions through the deployed Feature 9 intake contract with spam controls,
bounded staged writes, and `outboundSent=false` guarantees. Use the Feature 10
dashboard and deployed Mitchel summary endpoint as the authenticated operator
review surface for submitted inquiries.
