# Research: Daily Call Queue

## Decision 1: Purpose-Built MCP Tool Instead Of Prompted Raw SQL

**Decision**: Implement daily queue generation as a purpose-built Trevor MCP tool rather than asking Hermes to compose raw SQL through `db_query` and `db_execute`.

**Rationale**: The live `trevor-db` server currently exposes generic SQL tools. That is useful for operator inspection but too easy to misuse for a repeated sales workflow that must suppress do-not-contact prospects and avoid duplicate tasks. A purpose-built tool can enforce ranking, suppression, idempotency, limits, and safe output formatting in code.

**Alternatives considered**:

- Raw SQL prompt recipe in a skill: rejected because suppression and idempotency would depend on prompt compliance.
- Next.js API route: rejected because the workflow is tenant-local and should not route prospect business data through the customer-facing platform app.
- Scheduled cron digest first: rejected because on-demand output must be trusted before automation.

## Decision 2: Deterministic Database-Backed Ranking

**Decision**: Rank with deterministic SQL and code-level tie breakers: due next action, priority, stale relationship state, status heat, and contact readiness.

**Rationale**: Mitchel needs a stable working list. Re-running the queue against unchanged data should return the same order and task references. A deterministic score is easier to test, debug, and explain than an LLM-generated ranking.

**Alternatives considered**:

- LLM-only ranking from all prospect rows: rejected because it is harder to prove DNC suppression and repeatability.
- Randomized or rotation-based ranking: rejected because it can hide high-value due work.
- Agiled-first ranking: deferred because Agiled context may be missing or unavailable and should not block cadence-based queue generation.

## Decision 3: Reuse `trevor.call_tasks` For Durable Queue State

**Decision**: Persist generated queue items in `trevor.call_tasks` with `task_type = 'call'`, `status = 'open'`, and a due time for the sales day. Avoid duplicate open call tasks for the same prospect and day.

**Rationale**: Feature 1 deployed `call_tasks` for exactly this purpose. Reusing it creates a durable handoff to later pre-call brief and post-call capture features without adding schema.

**Alternatives considered**:

- Add a separate `daily_queues` table: rejected for this slice because current requirements can be met with `call_tasks`.
- Store queue output only in chat/session history: rejected because it would not create stable work items.
- Store queue in markdown: rejected because prospect data should remain in Postgres/Agiled.

## Decision 4: Agiled And Inventory Are Optional Enrichment

**Decision**: The first queue implementation uses Trevor Postgres cadence fields as the authoritative minimum. Agiled and inventory context can enrich explanations when available but must not block queue generation.

**Rationale**: The PRD names Agiled and inventory as important, but the current feature is blocked only on Feature 1 schema. The queue must be useful with deployed data today. Missing Agiled or inventory should be visible as missing context, not treated as failure.

**Alternatives considered**:

- Require Agiled lookups for every queue item: rejected because missing links would make the queue brittle.
- Build durable inventory matching now: rejected because the inventory source is still an open roadmap question.
- Ignore Agiled entirely forever: rejected because later pre-call brief and post-call capture need CRM context.

## Decision 5: Sanitized Observability

**Decision**: Validation and telemetry should report counts, statuses, task IDs, and suppression totals, not full notes, generated openers, secrets, or raw contact details.

**Rationale**: Prospect data is sensitive business data. Operators need enough evidence to prove the queue works without leaking the sales list into logs or deployment records.

**Alternatives considered**:

- Log full queue payloads for debugging: rejected due to data leakage risk.
- No telemetry: rejected because production workflow failures would be hard to diagnose.
- Metrics backend integration: deferred; current validation can rely on structured MCP results and SQL verification.

## Decision 6: Deploy As Tenant-Local Source Controlled From Repo

**Decision**: Add source-controlled tenant workflow files under `tenet-0/tenant-workflows/hermes-mitchel/`, then sync/build them into `/opt/data/mcp-servers/trevor-db` and `/opt/data/skills/daily-call-queue` on Aegis during implementation.

**Rationale**: The live tenant already runs these tools from `/opt/data`, but the repo needs durable artifacts so future agents can review, test, redeploy, and roll back the workflow.

**Alternatives considered**:

- Edit only live files on Aegis: rejected because it creates untracked production drift.
- Move the workflow to `overnightdesk-ops`: rejected because this is tenant business workflow, not platform knowledge.
- Move the workflow to the Next.js app: rejected because it would widen the tenant data boundary.
