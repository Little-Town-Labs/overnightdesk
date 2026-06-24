# Hermes Mitchel Prospecting System PRD

## Purpose

Design and prepare a prospecting system for `hermes-mitchel` that acts as a
sales support agent for Mitchel's wholesale diamond sales work. The system
should support a human salesperson making calls, then help with structured
follow-up over email, Telegram, social messages, and Agiled CRM.

This PRD captures the ideal system, the current deployed foundation, the gap
between them, and the build sequence needed for future deployment.

Execution roadmap: `.specify/roadmap-hermes-mitchel-prospecting.md`.

## Current Foundation

The existing Mitchel tenant already has the core building blocks for a
sales-support workflow:

- `hermes-mitchel` runs as Agent One on aegis-prod.
- The tenant is documented as Mitchell's diamond sales assistant.
- Tenant data lives in the `hermes-mitchel-data` Docker volume at `/opt/data`.
- The tenant uses `gpt-5.5` through the `openai-codex` provider.
- `tenet0-postgres` hosts the `trevor` schema for Mitchel's business data.
- `trevor_app` is the application role for the `trevor` schema.
- `trevor.prospects` stores diamond-buyer profiles.
- `trevor.interactions` is available for chronological touchpoint history.
- `trevor.memory` stores persistent assistant context.
- A tenant-local `trevor-db` MCP server gives Hermes tools to read and write
  the `trevor` schema.
- A tenant-local Agiled MCP server gives Hermes tools for contacts, accounts,
  deals, pipeline stages, invoices, notes, files, meetings, and search.
- Tenant-local skills exist for diamond client lookup, Agiled lead intake,
  pipeline reporting, follow-up drafting, availability formatting, and invoice
  generation.

Observed current data shape:

- `trevor.prospects`: active prospect list exists.
- `trevor.interactions`: touchpoint log table exists but is not yet populated.
- `trevor.memory`: minimal persistent context exists.
- Hermes cron jobs for the Mitchel tenant are not active for the sales cadence
  workflows yet.

## Target Users

- Primary: Mitchel, as the salesperson making outbound calls and closing deals.
- Secondary: Trevor, the `hermes-mitchel` agent persona supporting Mitchel.
- Operator: OvernightDesk platform operator maintaining the tenant, database,
  MCP servers, and deployment process.

## Goals

- Turn a static prospect list into a daily prospecting operating system.
- Help Mitchel decide who to call and why.
- Give a concise pre-call brief for each prospect.
- Capture call outcomes in structured form.
- Draft timely follow-up for email, Telegram, SMS, or social channels.
- Keep Agiled CRM and the Trevor Postgres store aligned.
- Match available diamond inventory to likely buyers.
- Preserve human approval before outbound communication is sent.
- Consider `mitchelbrown.com` as a related public acquisition and credibility
  surface that can feed new prospects into the sales-support loop.

## Non-Goals

- Fully automated cold calling.
- Sending emails or social messages without explicit Mitchel approval.
- Replacing Agiled as the business CRM.
- Building a general-purpose CRM product in the first phase.
- Storing secrets or business records in markdown notes.

## Ideal System

### Prospect Intelligence Store

The system should maintain a structured profile for every prospect:

- Identity: name, company, email, phone, social handles.
- Buyer profile: buyer type, preferred cuts, budget range, certification
  preference, purchase cadence, relationship notes.
- CRM references: Agiled contact ID, deal IDs, invoice IDs.
- Relationship state: status, last interaction, last outcome, next action.
- Compliance state: opt-out flag, preferred channel, do-not-contact reason.

Postgres should be the agent-optimized working memory. Agiled should remain the
commercial CRM of record for contacts, deals, notes, and invoices.

### Daily Call Queue

Every sales day, Trevor should produce a ranked call queue:

- New inbound leads.
- Prospects with matching inventory.
- Quoted or negotiating buyers that have gone stale.
- Buyers with open questions or pending invoices.
- Dormant buyers worth reactivating.

Each call target should include:

- Priority.
- Reason for calling.
- Call objective.
- Suggested opener.
- Relevant buyer preferences.
- Suggested inventory or deal context.

### Pre-Call Brief

Before a call, Trevor should prepare a compact brief:

- Prospect identity and company.
- Last interaction and current status.
- Open Agiled deals or invoices.
- Buyer preferences and known objections.
- Recommended ask.
- Relevant inventory to mention.
- Follow-up fallback if there is no answer.

### Call Capture

After the human salesperson places a call, Trevor should capture the outcome:

- Called prospect.
- Outcome: no answer, left voicemail, interested, quoted, follow up later, not
  interested, sold, wrong number, do not contact.
- Free-text summary.
- Updated buyer preferences.
- Next action type and due date.
- Follow-up draft needed or not.
- Agiled note creation result.
- `trevor.interactions` write result.

Transcript/audio ingestion can come later. The first version should support a
manual structured post-call form through Hermes chat.

### Follow-Up Composer

Trevor should draft follow-up messages based on call outcomes:

- Email.
- Telegram.
- SMS copy.
- LinkedIn or Instagram DM copy.
- Agiled note.

Messages must be specific to the call and buyer profile. External sends require
explicit Mitchel approval. Until direct channel integrations are proven, social
follow-up can be copy-ready drafts.

### Cadence Engine

The system should maintain next actions and reminders:

- New lead: same-day call and follow-up.
- Quoted deal: follow up after two business days.
- Negotiating deal: follow up every one to two business days.
- Dormant prospect: reactivation when inventory matches.
- Unpaid invoice: reminder path after configured terms.

Cadence decisions should update the call queue and daily digest.

### Inventory Matching

Inventory matching is the domain-specific leverage point:

- Given a buyer, suggest available stones that fit preferences.
- Given a stone, suggest buyers likely to care.
- Given a weekly availability list, recommend targeted outreach.

The first version can accept pasted inventory. A later version should introduce
a durable inventory source or integration.

### Analytics

The system should expose basic sales support metrics:

- Calls queued.
- Calls completed.
- Follow-ups drafted.
- Follow-ups approved/sent.
- Stale prospects.
- Active deals by stage.
- Conversion by source.
- Won/lost reasons.

The first version can be a text digest. A dashboard can follow after the
workflow proves useful.

## Current Gap Analysis

### Already Built

- Live Hermes tenant for Mitchel.
- Dedicated Postgres schema for Trevor.
- Prospect, interaction, and memory tables.
- `trevor-db` MCP server for database access.
- Agiled MCP server for CRM access.
- Skills describing lead intake, pipeline reporting, follow-up drafting,
  availability formatting, invoicing, and client lookup.
- Platform documentation for the tenant and database.

### Missing

- Reproducible schema migrations for the `trevor` prospecting model.
- Structured next-action fields or tables.
- Call queue generator.
- Pre-call brief generator.
- Post-call capture workflow.
- Follow-up drafting connected directly to call outcomes.
- Active scheduled jobs for morning queue, stale-deal scan, or follow-up
  reminders.
- Inventory source and buyer matching.
- Approval audit trail for outbound communication.
- Sync rules between Agiled and the Trevor schema.
- Operator runbook for deployment, backup, and recovery.

## Proposed Data Model Changes

Keep the existing `trevor.prospects`, `trevor.interactions`, and `trevor.memory`
tables. Add the minimum structure needed to run a prospecting cadence.

### `trevor.prospects` Additions

- `lead_source text`
- `preferred_channel text`
- `do_not_contact boolean default false`
- `do_not_contact_reason text`
- `last_outcome text`
- `next_action_type text`
- `next_action_at timestamptz`
- `priority integer default 0`

### New `trevor.call_tasks`

Purpose: materialized daily call queue and follow-up work list.

Fields:

- `id bigserial primary key`
- `prospect_id bigint references trevor.prospects(id)`
- `task_type text not null`
- `priority integer not null default 0`
- `reason text not null`
- `call_objective text`
- `status text not null default 'open'`
- `due_at timestamptz`
- `completed_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### New `trevor.followup_drafts`

Purpose: approval-controlled outbound follow-up drafts.

Fields:

- `id bigserial primary key`
- `prospect_id bigint references trevor.prospects(id)`
- `interaction_id bigint references trevor.interactions(id)`
- `channel text not null`
- `subject text`
- `body text not null`
- `status text not null default 'draft'`
- `approved_by text`
- `approved_at timestamptz`
- `sent_at timestamptz`
- `external_message_id text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### Optional Later Tables

- `trevor.inventory`
- `trevor.inventory_matches`
- `trevor.cadence_rules`
- `trevor.sync_events`

## Workflow Requirements

### Daily Prospecting Digest

Trigger: weekday morning, or on demand.

Output:

- Top prospects to call.
- Reason for each call.
- Deals or buyers that are stale.
- Inventory-driven opportunities.
- Follow-ups awaiting approval.

### Call Queue Generation

Inputs:

- `trevor.prospects`
- `trevor.interactions`
- Agiled deals and notes
- optional inventory list

Rules:

- Prioritize overdue `next_action_at`.
- Promote hot stages such as quoted or negotiating.
- Promote buyers matching current inventory.
- Suppress `do_not_contact` prospects.
- Deprioritize prospects recently contacted unless a next action is due.

### Post-Call Capture

The agent should ask for structured fields if Mitchel provides only a loose
summary:

- Who was called?
- What happened?
- What should happen next?
- When should Trevor remind Mitchel?
- Should Trevor draft a follow-up?

The workflow must write:

- `trevor.interactions`
- `trevor.prospects.last_contacted_at`
- `trevor.prospects.last_outcome`
- `trevor.prospects.next_action_type`
- `trevor.prospects.next_action_at`
- Agiled note when an Agiled contact or deal is linked.

### Follow-Up Drafting

Drafts should be created from a call outcome and buyer profile.

Requirements:

- Never send without explicit approval.
- Store draft text before approval.
- Record approval and send metadata once integrated.
- Store a final interaction record after send or manual confirmation.

### Agiled Sync

Rules:

- Search before creating contacts to prevent duplicates.
- Keep `agiled_contact_id` unique in `trevor.prospects`.
- Write meaningful call notes to Agiled.
- Link deal IDs and note IDs in `trevor.interactions` when available.
- If Agiled and Postgres disagree, preserve both facts and create a sync event
  for operator review.

## Deployment Plan

### Phase 1: Durable Specification and Schema

- Add this PRD.
- Create SQL migration for the proposed fields and tables.
- Add a short operator runbook for backing up the `trevor` schema before
  deployment.
- Update platform standard database docs after deployment.

### Phase 2: Agent Workflows

- Add or update tenant skills:
  - daily call queue
  - pre-call brief
  - post-call capture
  - call-based follow-up draft
- Extend `trevor-db` MCP with safer purpose-built tools if raw SQL proves too
  easy to misuse.

### Phase 3: Scheduler

- Add Hermes cron jobs or an external scheduler for:
  - weekday morning prospecting digest
  - weekday follow-up scanner
  - optional weekly dormant-buyer reactivation scan

### Phase 4: Inventory Matching

- Define inventory input source.
- Build buyer-to-inventory and inventory-to-buyer matching.
- Add recommendations to the daily digest and pre-call brief.

### Phase 5: Channel Integrations

- Start with copy-ready drafts.
- Add email draft integration.
- Add social/browser-assisted flows only after approval, audit, and opt-out
  handling are reliable.

### Phase 6: Public Website / Landing Page

- Define the audience for `mitchelbrown.com`: wholesale diamond buyers, retail
  jewelers, brokers, collectors, referral partners, or some narrower segment.
- Explore brand-forward positioning such as "Mitchel Brown: Diamonds, Jewelry,
  and More" so the root site can support diamonds, jewelry, books, and buyer
  relationships rather than feeling like only an inquiry form.
- Build a focused landing page with credibility signals, buyer-intake path,
  current availability request, and a clear contact flow.
- Preserve or redirect the current website/book content under
  `mitchelbrown.com/books` so the root domain can become the buyer-focused
  landing page without losing existing content.
- Route website inquiries into Agiled and `trevor.prospects` without creating
  duplicate prospect records.
- Track source attribution as `mitchelbrown.com`.
- Decide whether the website is hosted as an OvernightDesk-managed deployment
  or as a separate marketing property.

## Acceptance Criteria

The first deployable prospecting system is complete when:

- The `trevor` schema changes are reproducible from migration files.
- Mitchel can ask "who should I call today?" and receive a ranked call queue.
- Mitchel can ask for a pre-call brief for any prospect.
- Mitchel can report a call outcome and have Postgres plus Agiled updated.
- Trevor can draft a follow-up from that call outcome.
- Drafts are stored and require approval before outbound send.
- The daily digest can run on demand.
- Operator docs explain backup, deployment, rollback, and verification.

## Risks

- Raw SQL MCP access can mutate data too freely if prompts are ambiguous.
- Agiled and Postgres can drift without explicit sync rules.
- Social media integrations may be brittle or violate channel terms if rushed.
- Automated outbound communication creates trust and compliance risk.
- Prospect data is sensitive business data and should not be exported into
  markdown or logs unnecessarily.

## Open Questions

- Should `trevor.prospects` remain the primary prospect source, or should
  Agiled contacts become primary with Postgres as an enrichment/cache layer?
- Which outbound channels matter first: email, Telegram, SMS, LinkedIn,
  Instagram, or another channel?
- Where should diamond inventory live long term: Google Sheets, Agiled custom
  objects, Postgres, or a dedicated inventory service?
- Should call capture stay manual, or should we plan for transcript/audio
  ingestion?
- What is the acceptable follow-up cadence for dormant buyers?
- Should `mitchelbrown.com` be part of the first prospecting system release, or
  should it be a follow-on acquisition feature after the call workflow is live?
