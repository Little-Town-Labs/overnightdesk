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

**Total Features:** 6
**Phases:** 4
**Critical Path:** Schema Hardening -> Call Queue -> Post-Call Capture -> Follow-Up Drafting -> Scheduler

---

## Current Status

**Last Updated:** 2026-06-24
**Active Branch:** `005-follow-up-drafting`
**Latest Merged OvernightDesk SHA:** `cb6c3e5`
**Latest Deployed OvernightDesk Source SHA:** `cb6c3e5`
**Latest Deployed Platform Standard SHA:** `0833e6b`
**Feature 1 Status:** Deployed to `aegis-prod`; platform-standard inventory PR #1 merged and standards consumer refreshed
**Feature 2 Status:** Merged via PR #8 and deployed to `aegis-prod/hermes-mitchel`
**Feature 3 Status:** Merged via PR #9 and deployed to `aegis-prod/hermes-mitchel`
**Feature 4 Status:** Merged via PR #10 and deployed to `aegis-prod/hermes-mitchel`
**Feature 5 Status:** Spec Kit artifacts created on branch `005-follow-up-drafting`; implementation pending
**Next Work:** Implement Feature 5 tasks in `specs/005-follow-up-drafting/tasks.md`.

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
- Feature 5, `follow-up-drafting`, has entered Spec Kit on branch
  `005-follow-up-drafting`.

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
| Trevor DB MCP server | `/opt/data/mcp-servers/trevor-db` | Live with daily call queue and pre-call brief tools |
| Agiled MCP server | `/opt/data/mcp-servers/agiled` | Live |
| Diamond client skill | `/opt/data/skills/diamond-clients` | Live |
| Daily call queue skill | `/opt/data/skills/daily-call-queue` | Live |
| Pre-call brief skill | `/opt/data/skills/pre-call-brief` | Live |
| Agiled workflow skills | `/opt/data/skills/agiled/*` | Live |
| Prospecting PRD | `docs/hermes-mitchel-prospecting-prd.md` | Drafted |
| Feature 1 migration | `tenet-0/db/migrations/051_trevor_prospecting.sql` | Deployed |
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

- [ ] Trevor can draft email, Telegram, SMS-copy, and social-copy follow-ups.
- [ ] Drafts are stored in `trevor.followup_drafts`.
- [ ] Draft status tracks draft, approved, sent, or discarded.
- [ ] Explicit Mitchel approval is required before any send-capable integration.
- [ ] Approved follow-up can be logged back to `trevor.interactions`.

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

- [ ] Morning digest can run on demand.
- [ ] Scheduled execution path is documented and enabled after manual validation.
- [ ] Stale prospects and follow-up drafts appear in the digest.
- [ ] Scheduler output avoids exposing secrets or unnecessary prospect details in logs.
- [ ] Operator runbook covers validation and disabling jobs.

---

## Deferred Features

### Inventory Matching

**Reason Deferred:** It is the highest domain-specific leverage point, but it
depends on a durable inventory source. First version can accept pasted
inventory inside the call queue or brief workflow.

**Future Work:**

- Define inventory source: Google Sheet, Agiled, Postgres, or dedicated service.
- Add buyer-to-stone matching.
- Add stone-to-buyer recommendations.
- Add weekly availability workflow integration.

### Dashboard and Analytics

**Reason Deferred:** A text-first assistant workflow should prove the operating
loop before UI investment.

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

### Public Website / Landing Page

**Reason Deferred:** `mitchelbrown.com` is a useful acquisition and credibility
surface, but it can come later after the internal prospecting loop is reliable.
It should not block the data model, call queue, call capture, or follow-up
drafting work.

**Future Work:**

- Define the site audience and positioning.
- Build a focused landing page for buyer inquiries and credibility.
- Add a buyer-intake form that routes to Agiled and `trevor.prospects`.
- Track source attribution as `mitchelbrown.com`.
- Decide whether to host it under OvernightDesk-managed infrastructure or as a
  separate marketing deployment.

---

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
    |
    +--> Future: Inventory Matching
    +--> Future: Dashboard and Analytics
    +--> Future: Public Website / Landing Page
```

**Critical Path:** 1 -> 2 -> 3 -> 4 -> 5 -> 6

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

- [ ] Follow-up draft can be generated from a captured call outcome.
- [ ] Draft is stored and linked to prospect/interaction.
- [ ] Approval status is explicit.
- [ ] Approved or manually sent follow-up can be logged.

---

### Phase 4: Cadence Automation

**Goal:** The sales-support workflow becomes a daily operating loop.

**Features:**

- Feature 6: Cadence Scheduler and Digest

**Completion Gate:**

- [ ] Morning digest is validated manually.
- [ ] Scheduler is enabled only after on-demand output is trusted.
- [ ] Stale-deal and follow-up reminders appear.
- [ ] Disable/rollback instructions are documented.

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

- [ ] **Feature 5: Follow-Up Drafting**
  - [x] `$speckit-specify` for `follow-up-drafting`
  - [x] `$speckit-plan`
  - [x] `$speckit-tasks`
  - [ ] `$speckit-implement`

### Phase 4

- [ ] **Feature 6: Cadence Scheduler and Digest**
  - [ ] `$speckit-specify` for `cadence-scheduler-digest`
  - [ ] `$speckit-plan`
  - [ ] `$speckit-tasks`
  - [ ] `$speckit-implement`

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Raw SQL MCP access mutates unintended records | High | Prefer purpose-built MCP tools for call queue, capture, and drafts after schema lands |
| Agiled and Postgres drift | Medium | Define sync events and write Agiled note IDs back to interactions |
| Prompt-created follow-up sends too early | High | Draft-only default; explicit approval required for send-capable integrations |
| Prospect data leaks into logs or markdown | High | Keep source of truth in Postgres/Agiled; avoid exporting client records |
| Scheduler produces noisy recommendations | Medium | Validate on-demand before enabling cron |
| Inventory matching overfits bad or stale inventory | Medium | Defer durable matching until inventory source is clear |

---

## Open Questions

1. Should Agiled contacts or `trevor.prospects` be primary when the same field
   differs?
2. Which channel should be first for approval-controlled sends: email,
   Telegram, or copy-only social follow-up?
3. What is the long-term inventory source?
4. What follow-up cadence does Mitchel actually want for dormant buyers?
5. Should call transcripts/audio be accepted later, or should this remain
   manual call capture?

---

## Next Recommended Spec

Start with **Feature 1: Trevor Prospecting Data Model**. It is the smallest
foundational slice that unlocks the operating loop while keeping production risk
bounded to a schema migration plus documentation.
