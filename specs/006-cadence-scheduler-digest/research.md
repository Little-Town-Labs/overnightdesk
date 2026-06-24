# Research: Cadence Scheduler and Digest

## Decision: Keep digest orchestration in `trevor-db`

**Rationale**: Features 2 through 5 already use the repo-controlled `trevor-db` MCP server for call queue, capture, and follow-up draft workflows. The cadence digest composes those same domain records and should reuse the existing DB connection, validation style, deployment path, and test harness.

**Alternatives considered**:

- New scheduler service: rejected for the first slice because it adds deployment surface before on-demand digest behavior is proven.
- Raw SQL skill only: rejected because repeated digest generation needs a safe, bounded, testable tool.

## Decision: On-demand digest first, scheduler opt-in later

**Rationale**: The roadmap risk explicitly calls out noisy scheduler recommendations. A manual `generate_cadence_digest` tool lets Mitchel and the operator validate content, counts, and side effects before any weekday automation runs.

**Alternatives considered**:

- Enable cron during Feature 6 deployment: rejected because scheduled behavior should follow manual validation.
- Document scheduler without an MCP digest: rejected because there must be a repeatable command to validate.

## Decision: Default digest runs are read-only

**Rationale**: The digest is a summary workflow. It should not create interactions, follow-up drafts, approvals, sends, or scheduler jobs. Call task persistence can reuse existing daily call queue behavior only when the caller explicitly chooses it.

**Alternatives considered**:

- Persist call tasks by default: rejected because scheduled or habitual digest use could create unwanted tasks.
- Automatically create follow-up drafts for stale work: rejected because Feature 5 made draft generation explicit and approval-controlled.

## Decision: Stale work is summarized, not exported

**Rationale**: The digest should help Mitchel decide what to do next while protecting customer/prospect data. It should include prospect identity, reason labels, age/due indicators, and next action categories, not full private notes or full draft bodies.

**Alternatives considered**:

- Include full notes and full draft bodies: rejected because this increases leakage risk in logs and daily summaries.
- Hide stale work entirely until scheduler exists: rejected because stale work is a core digest value.

## Decision: Scheduler path is a runbook-controlled local tenant job

**Rationale**: The live `hermes-mitchel` tenant already runs tenant-local tools and has a data volume. A documented job path can be validated, enabled, disabled, and rolled back without changing database schema or adding a new platform service.

**Alternatives considered**:

- External cloud scheduler: deferred because the first need is operator-validated weekday digest execution.
- Database-backed job table: deferred because the initial scheduler does not need durable job history beyond logs and deployment records.
