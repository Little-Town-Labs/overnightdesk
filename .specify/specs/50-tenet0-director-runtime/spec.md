# Feature 50: Tenet-0 Director Runtime

## Overview

This feature builds the **runtime platform** that future Director agents (Features 52–56) and the SecOps auditor (Feature 57) will live on. It promotes Agent Zero from "the tenant's agent" to **President/CEO** of the Tenet-0 corporate hierarchy, supplies the supporting infrastructure that lets Zero govern department subagents, and gives every Director persistent memory across spawns.

The President is not a separate process — Zero IS the President. Every Director is a Claude Code subagent (markdown file in `~/.claude-agent-zero/agents/`) spawned by Zero via the Task tool when reasoning is needed. All reasoning runs on Zero's existing Claude Code OAuth subscription — no new Anthropic API key, no new per-token billing line.

The platform supplies:
- **Go MCP servers** that expose Feature 49 plumbing (event bus, constitution, governor) and the new state stores (pending approvals, decision audit log, Director memory) as tools subagents can call.
- **Go background daemons** that supply the daemon-shaped behavior Claude Code sessions lack (event-loop subscription, periodic polling, deadline sweeping, self-audit).
- **Director memory subsystem** — per-Director namespaced persistent memory with a constitutional access matrix.
- **Director interface contract** — the markdown convention every Director (this feature's `president.md` and all future Directors) follows.
- **One reference Director** — `president.md` itself, as the worked example. No other Directors ship in this feature.

**Business Value:** Unblocks Features 52–57. Eliminates the cost-and-complexity overhead of running each Director as a separate Anthropic-API-keyed Go service. Reuses Zero's existing OAuth subscription for all reasoning. Establishes the contract every future Director must implement — without it, no Director is buildable.

**Scope Note:** Tenet-0 only. Customer tenants do not receive this runtime. The corporate-hierarchy pattern is opt-in for future phases. Constitution Principle 1 (Data Sacred) governs the boundary absolutely: Directors and Director memory MUST NOT contain tenant conversation content, customer credentials, or PII.

## Problem Statement

Feature 49 shipped the substrate: event bus, constitution, token governor, audit log. The substrate enforces rules mechanically (FR-2a credential auth, FR-6a pre-approval gates, FR-11 rule evaluation), but three categories of behavior are intentionally left to the layer above:

1. **Reasoned post-hoc review.** The bus admits a correctly-formed event; someone has to read the stream and judge whether the *pattern* of department behavior is healthy.
2. **Reasoned pre-approval decisions.** Approvals that require context (a refund above threshold, a production deploy, an unfamiliar payment) need a decision-maker, not a rule engine.
3. **Continuous awareness — escalations, healthchecks, deadlines, audits.** Cron-style work that supports the reasoning layer.

Today, no Tenet-0 process fills these roles. Reports published to the bus have no consumer. Pre-approval events with no `president.approved` in their causality chain are rejected by the bus with no alternative path. No Director can be built (Features 52–57) without a President to escalate to AND a runtime contract to conform to AND persistent memory to accumulate institutional knowledge.

The original Feature 50 design proposed a standalone Go President service with its own Anthropic API key. That design was abandoned because:
- It would require a new monthly Anthropic billing line for the President alone (and another for each future Director)
- It would split Tenet-0's "voice" across multiple LLM identities — Zero (OAuth, Claude Code) and President (API, separate Go service)
- It would force per-Director API key sprawl (one for every department added in Phase 10.x)
- It would lose the operator-facing continuity that "Zero is the President" provides

The new design uses Claude Code's existing primitives (subagents via Task tool) so that Zero IS the President, every Director is a markdown file Zero spawns on demand, all reasoning is OAuth-paid, and the Go layer shrinks to small daemons + MCPs that supply the missing daemon-shaped behavior and expose state.

## Design Decision

**Reference:** `.docs/tenet-0/sub-agent-architecture.md` — President/CEO role, post-hoc review model, departments-as-subagents.

The President is **embodied by Zero**, scaffolded by `~/.claude-agent-zero/agents/president.md` (a Director markdown file). Zero remains the operator-facing identity. When the President role requires reasoning (digest synthesis, escalation routing, novel approval), Zero invokes the appropriate Director subagent via the Task tool. When the President role requires deterministic action (rule-path approval, healthcheck transition acknowledgment), Zero acts inline using MCP tools.

**Bus events arrive at Zero.** A small Go daemon (`tenet0-bus-watcher`) subscribes to the Feature 49 Postgres LISTEN/NOTIFY channel and translates each new event into a structured message routed into Zero's session. The mechanism mirrors how Telegram messages already arrive at Zero today (via comm-module). Zero processes events as they arrive, in order, just as it processes operator messages.

**Directors are markdown files.** Every Director — including the President's own scaffold — is a Claude Code subagent definition. The contract every Director conforms to (identity, charter, MCP grants, bus namespace, memory protocol, constitutional acknowledgment) is defined in this feature.

**Memory is persistent and namespace-scoped.** Each Director writes to its own memory namespace via `tenet0-director-memory-mcp`. The President can read all Director memories (for digest synthesis and escalation context) but writes only its own. SecOps reads everything but writes only its own. The access matrix lives in `constitution-rules.yaml` so it is governance, not configuration.

**Cost model:** Zero's reasoning is paid by your Claude Code OAuth subscription. Director subagents inherit Zero's auth and likewise cost nothing in per-token API charges. The token governor remains useful: it tracks reasoning effort per Director (token-equivalent) for capacity modeling and rate-limit hygiene, even though there is no per-token bill.

## User Stories

### User Story 1: Zero Consumes a Bus Event
**As** Zero (the President)
**I want to** receive bus events as structured messages in my session
**So that** I can react to department activity without polling

**Acceptance Criteria:**
- [ ] When a new event lands on the Feature 49 bus, Zero is notified within 5 seconds
- [ ] The notification includes event type, source department, payload, parent event ID (causality), and the event's full bus ID
- [ ] Zero can distinguish bus event messages from operator messages (different framing)
- [ ] If Zero is busy when the event arrives, the event waits in the bus until Zero processes it (durable per Feature 49 NFR-3)
- [ ] If multiple events arrive in burst, Zero receives them in publish order
- [ ] Zero can dispatch the event two ways: handle inline (deterministic / rule-path) or spawn a Director subagent (LLM-path / reasoning)

**Priority:** High

### User Story 2: Zero Handles a Pre-Approval Event with a Director
**As** Zero (the President)
**I want to** spawn the appropriate Director subagent when an event requires reasoning
**So that** the decision is made by the department with relevant expertise and memory

**Acceptance Criteria:**
- [ ] Zero looks up the constitutional rule (via `tenet0-constitution-mcp`) to confirm the event requires approval
- [ ] Zero claims the approval in the pending-approvals queue (via `tenet0-pending-mcp`) so duplicate processing is prevented
- [ ] Zero spawns the right Director subagent (e.g., Finance for `fin.payment.outbound`) using Claude Code's Task tool, passing the event context
- [ ] The Director returns a decision (approve/reject/defer) with a rationale; Zero records it via `tenet0-pending-mcp.record_decision`
- [ ] Zero publishes the corresponding outcome event (`president.approved` / `president.rejected` / `president.deferred`) to the bus, signed by the President credential
- [ ] The decision is recorded in `decision_log` with hash chain integrity (Feature 49 NFR-4 pattern)
- [ ] If the Director declines to decide and surfaces to the operator, Zero routes the surfacing through the operator notification channel

**Priority:** High

### User Story 3: A Director Loads, Uses, and Writes Memory
**As** a Director subagent (e.g., the President)
**I want to** load my memory on spawn, search it during reasoning, and write new entries when I learn something
**So that** my reasoning accumulates institutional knowledge across spawns and survives session restarts

**Acceptance Criteria:**
- [ ] On spawn, the Director can call `tenet0-director-memory-mcp.load_memory_index` and receive a MEMORY.md-shaped index of its own memories
- [ ] The Director can call `read_memory(name)` to fetch a specific entry, or `search_memory(query, type?)` to full-text search its namespace
- [ ] The Director can call `write_memory(type, name, description, body, source_event_id?)` to record new memory; allowed types are `charter`, `decision`, `pattern`, `state`, `reference`
- [ ] The Director cannot read or write under any other Director's namespace; attempts are denied at the MCP and audit-logged
- [ ] Memory writes containing tenant conversation content, customer credentials, or PII patterns are rejected by a pre-write scrubber and audit-logged as `secops.violation.memory_pii`
- [ ] Memory entries are append-only with supersedes — `update_memory` creates a new row and marks the old one superseded; `forget_memory` marks superseded with no replacement and an audit-logged reason
- [ ] Memory survives Zero session restart, MCP server restart, and Postgres container restart (durability via Feature 49's Postgres backups)

**Priority:** High

### User Story 4: The President Synthesizes Across Director Memories
**As** Zero (the President)
**I want to** read across all Directors' memories when synthesizing a daily digest or routing an escalation
**So that** I see cross-cutting themes no single Director would notice on its own

**Acceptance Criteria:**
- [ ] The President's MCP credential grants read access to every Director's memory namespace, per the access matrix in `constitution-rules.yaml`
- [ ] The President can call `search_memory(query)` without a department filter and receive matches from every Director
- [ ] When the President writes a `decision` memory that affects another Director, it can mark `visible_to: [department]` so the affected Director can read that single entry
- [ ] Cross-department reads by the President are audit-logged (which department's memory was read, what query, what was returned), so SecOps can verify the President is not over-reaching
- [ ] No other Director (Operations, Finance, etc.) can read across namespaces — only the President and SecOps have cross-cutting read access

**Priority:** High

### User Story 5: Operator Surfaces and Approval Round-Trip
**As** Gary (the operator)
**I want to** see pending approvals via Telegram and respond with a single tap or short reply
**So that** Directors are not blocked waiting for me and I can govern from anywhere

**Acceptance Criteria:**
- [ ] When an approval needs operator input, the surfacing message arrives in Gary's Telegram within 30 seconds of the original bus event (NFR-2)
- [ ] Gary can respond approve / reject / defer with a brief reason in a single message
- [ ] Gary's response is verified (operator-channel signature) and converted into the corresponding `president.*` outcome event
- [ ] Approvals carry an expiry (10 minutes default per Feature 49 FR-11a); expired approvals auto-convert to `president.rejected` with reason "expired awaiting operator input"
- [ ] Gary can ask Zero "show me what's pending" at any time and receive the current pending queue without waiting for a new notification
- [ ] Sustained operator unavailability (configurable threshold) triggers a `president.operator.unavailable` event so Gary sees the cumulative state on return

**Priority:** High

### User Story 6: A Director's Tools Become Unavailable
**As** Zero (the President)
**I want to** detect when a Director's required MCP servers are unreachable
**So that** I do not dispatch to a Director that cannot do its work, and I can surface the degradation honestly

**Acceptance Criteria:**
- [ ] The healthcheck poller cycles every registered Director on a configurable interval (default 60 seconds)
- [ ] For each Director, the poller verifies every MCP server the Director's contract declares as a dependency
- [ ] If a required MCP server fails the liveness check, a `*.lifecycle.degraded` event is published with the affected Director, the failed MCP, and the failure mode
- [ ] When dispatching, Zero checks the most recent lifecycle state for the target Director; degraded Directors are not dispatched to (the event is queued or surfaced to the operator)
- [ ] Reactive detection complements the poller: when Zero attempts to spawn a Director and the spawn fails (or the Director's first MCP call fails inside the spawn), Zero publishes the same `*.lifecycle.degraded` event without waiting for the next poll cycle
- [ ] Recovery: when a previously-degraded MCP passes liveness again, a `*.lifecycle.recovered` event is published and Zero resumes dispatching

**Priority:** High

### User Story 7: Pending Approval Lapses Past Deadline
**As** the deadline sweeper
**I want to** detect pending approvals whose operator deadlines have passed
**So that** stuck approvals do not silently block the system and outcomes are emitted honestly

**Acceptance Criteria:**
- [ ] Every minute, the sweeper scans `pending_approvals` for rows whose `operator_deadline` is in the past and whose status is `awaiting_operator`
- [ ] Each lapsed row is updated to status `expired` and a `president.rejected` event is published with reason "expired awaiting operator input"
- [ ] The expiry decision is recorded in `decision_log` like any other President decision
- [ ] The corresponding requesting Director is responsible for follow-up per its own policy (this feature publishes the rejection; it does not dictate downstream behavior)
- [ ] If a sustained pattern of expirations indicates operator unavailability (configurable threshold), a `president.operator.unavailable` event is raised in addition to the per-approval rejections

**Priority:** Medium

### User Story 8: Audit Self-Check Detects a Forged Decision
**As** the audit self-checker
**I want to** detect any `president.*` event in the bus audit log that lacks a matching `decision_log` row
**So that** forgeries or audit gaps are surfaced quickly even if other defenses fail

**Acceptance Criteria:**
- [ ] Every 15 minutes, the self-checker queries the bus audit log for `president.*` events in the past 24 hours
- [ ] For each such event, the self-checker verifies a matching `decision_log` row exists with the same outcome event ID
- [ ] Any unmatched event raises `secops.violation.namespace_impersonation` with the offending event ID
- [ ] The self-checker also validates a random 1,000-row sample of the `decision_log` hash chain on each cycle and a full chain validation nightly; corruption raises `secops.violation.audit_corruption` with the affected row range
- [ ] The self-checker also verifies that every approval request observed in the past 24 hours has exactly one matching outcome (approve / reject / defer / expire); gaps raise `secops.violation.audit_gap` with the gap IDs

**Priority:** High

### User Story 9: Director Lifecycle Registration
**As** the operator
**I want to** add a new Director by dropping a markdown file into `~/.claude-agent-zero/agents/`
**So that** the runtime picks it up automatically and the new Director becomes available for dispatch

**Acceptance Criteria:**
- [ ] When a new Director markdown file appears, a `*.lifecycle.registered` event is published with the Director's department namespace, declared MCP grants, and a hash of the file
- [ ] The Director's memory namespace is created (empty index, ready for first writes) within 30 seconds of registration
- [ ] When a Director markdown file is removed, a `*.lifecycle.deregistered` event is published; existing memory rows are preserved (audit retention)
- [ ] When a Director markdown file is edited, a `*.lifecycle.deregistered` followed by `*.lifecycle.registered` pair is published; the new contract takes effect for next spawn
- [ ] Lifecycle events trigger the President to update its dispatch routing table; degraded Directors (per US-6) are excluded
- [ ] Conflict — two markdown files claiming the same department namespace — raises `secops.violation.registry_conflict` and both files are quarantined (no dispatch) until resolved

**Priority:** Medium

## Functional Requirements

### FR-1: Bus Event Subscription via Daemon
A background process subscribes to the Feature 49 bus's LISTEN/NOTIFY channel and translates each new event into a structured message routed to Zero's Claude Code session. The daemon does not interpret events; it formats and forwards.

### FR-2: Bus Event Notification Format
Each notification message routed to Zero contains: event type, source department, payload, parent event ID (causality), the bus event's UUID, and a frame marker that distinguishes bus events from operator messages.

### FR-3: Bus Event Ordering
Events are delivered to Zero in the same order they appear in the bus. If Zero is processing one event when another arrives, the new event waits (durable per Feature 49 NFR-3) and is delivered in turn.

### FR-4: Event Routing Mechanism
The mechanism for routing notifications into Zero's session reuses the existing comm-module bridge pattern by default; an alternative path may be selected by operator configuration. (See CL-1.)

### FR-5: Inline vs Director Dispatch
Zero handles deterministic events (rule-path: matches a constitutional rule, blanket authorization, or routing policy) inline using MCP tools. Zero spawns a Director subagent for events that require reasoning (LLM-path: novel context, cross-department synthesis, ambiguous approval). The choice is observable via the `decision_mode` field on the outcome event.

### FR-6: Director Subagent Spawning
Zero invokes Director subagents via Claude Code's Task tool. The Director receives the event context, its identity scaffold (its own markdown file content), and access to its declared MCP grants. The subagent reasons and returns a structured decision. Zero records the decision in `decision_log` and publishes the outcome event.

### FR-7: Pending Approvals Queue
The pending-approvals queue is a durable Postgres-backed store. Each pending approval row captures: bus request event ID, target event, requesting department, the constitutional rule that triggered approval, status (pending / awaiting_llm / awaiting_operator / decided / expired), operator deadline, and (when decided) outcome + decision mode + rationale + (LLM path) confidence and model identifier.

### FR-8: Pending Approval State Machine
A pending row transitions: pending → (awaiting_llm if reasoning needed) → (awaiting_operator if Director defers) → decided. Or any state → expired (operator deadline lapsed). Crash recovery downgrades `awaiting_llm` to `pending` (in-flight LLM output discarded as untrusted after crash).

### FR-9: Decision Log
Every Zero/President decision (approve, reject, defer, escalation resolution, health transition acknowledgment, digest publication, department pause/resume) is recorded in a `decision_log` table with a SHA256 hash chain (each row carries `prev_hash` and `row_hash = SHA256(prev_hash || canonical_row)`).

### FR-10: Decision Log Append-Only Enforcement
The `decision_log` is append-only at the database level: the President's database role has `INSERT` only; `UPDATE`/`DELETE`/`TRUNCATE` are revoked; a `BEFORE UPDATE OR DELETE` trigger raises an exception as belt-and-braces.

### FR-11: Director Memory Storage
Each Director's persistent memory is stored in a Postgres table partitioned by department. Each memory row carries: department, type (one of `charter`, `decision`, `pattern`, `state`, `reference`), name, description, body, optional source event ID (causality), optional `superseded_by` reference, optional `visible_to` list (per US-4), and timestamps.

### FR-12: Director Memory Index
Each Director has a MEMORY.md-shaped index summarizing its own memory. The index is rebuilt on every memory write or supersede so a fresh subagent spawn gets an accurate one-shot summary on first call to `load_memory_index`.

### FR-13: Memory Access Matrix
The matrix defining which Director may read/write which other Director's namespace is stored in `constitution-rules.yaml` under `memory_access_matrix`. Default matrix (subject to amendment):
- President: write own; read all
- Each operating Director: write own; read own
- SecOps: write own; read all
- All other reads/writes are denied

### FR-14: Memory Access Enforcement
Every memory MCP call is checked against the matrix using the calling Director's credential. Violations are rejected at the MCP and audit-logged as `secops.violation.memory_access`.

### FR-15: Memory Pre-Write Scrubber
Memory writes are scanned before persistence for tenant-data patterns: customer email addresses, credit card numbers, conversation transcripts (heuristic detection), and Anthropic-shaped credentials. Matches reject the write and raise `secops.violation.memory_pii`.

### FR-16: Memory Append-Only with Supersedes
Memory rows are never deleted. `update_memory(name, body)` creates a new row referencing the old one's ID via `superseded_by`. `forget_memory(name, reason)` marks the row superseded with no replacement; the reason is audit-logged.

### FR-17: Memory Size Caps
Per-Director memory entry counts are bounded. (See CL-3.) Writes that would exceed the hard cap are rejected with reason "memory cap exceeded; consolidate before writing"; a soft cap publishes a warning event.

### FR-18: Healthcheck Polling
A daemon polls every registered Director on a configurable interval (default 60 seconds). For each Director, it checks liveness of the MCP servers the Director declares as dependencies. (See CL-2 for the exact healthcheck semantics.) State transitions are published as `*.lifecycle.degraded` and `*.lifecycle.recovered` events; raw poll results are not published.

### FR-19: Reactive Health Detection
When Zero attempts to spawn a Director and the spawn fails or the Director's first MCP call fails, Zero publishes a `*.lifecycle.degraded` event for that Director without waiting for the next poll cycle.

### FR-20: Deadline Sweeping
A daemon scans `pending_approvals` every minute for rows whose `operator_deadline` has passed and whose status is `awaiting_operator`. Each lapsed row transitions to `expired` and a `president.rejected` event is published with reason "expired awaiting operator input".

### FR-21: Audit Self-Check
A daemon runs every 15 minutes verifying: (a) every `president.*` event in the bus audit log over the past 24 hours has a matching `decision_log` row; (b) every approval request in the past 24 hours has exactly one outcome; (c) a random 1,000-row sample of the `decision_log` hash chain validates; (d) a nightly cycle validates the entire hash chain; (e) the effective `memory_access_matrix` grants match the last-amended baseline recorded in `constitution-rules.yaml` — divergence raises `secops.violation.matrix_drift` (defense-in-depth against T1 misconfiguration / matrix tampering). Violations raise the appropriate `secops.violation.*` event (`namespace_impersonation`, `audit_gap`, `audit_corruption`, `matrix_drift`).

### FR-22: Director Lifecycle from File-System
A daemon (or a polling task within an existing daemon) detects markdown files added/removed/edited under `~/.claude-agent-zero/agents/` and emits the corresponding `*.lifecycle.registered`, `*.lifecycle.deregistered`, or pair (for edits) on the bus. (See OQ-1 for debounce specifics.)

### FR-23: Director Markdown Contract
Every Director markdown file MUST declare: identity (name, department namespace), charter (one-paragraph mission), MCP grants list (subset of the global MCP catalog), bus namespace prefix, memory protocol footer, and constitutional acknowledgment. A markdown file missing any required section raises `secops.violation.registry_invalid` and is quarantined (no dispatch) until corrected.

### FR-24: President Reference Director
This feature ships exactly one Director: `~/.claude-agent-zero/agents/president.md`. It is the worked example of the contract. No other Directors are shipped in this feature; Operations Director is Feature 52 and follows separately.

### FR-25: Operator Notification Channel
Operator surfacing routes through the operator notification channel (Telegram via comm-module by default). Operator responses arriving via the same channel are verified (signature + nonce) before being treated as a decision. The mechanism conforms to the security model defined in constitution Pillar B.

## Non-Functional Requirements

### NFR-1: Notification Latency
- Bus event published → Zero notified: p95 < 5 seconds
- Inline (rule-path) decision: p95 < 10 seconds end-to-end (bus event → outcome event)
- Director-spawn (LLM-path) decision: p95 < 60 seconds end-to-end (includes subagent spawn overhead)

### NFR-2: Operator Round-Trip
- Approval request → operator notification arrives: p95 < 30 seconds
- Operator response → outcome event published: p95 < 10 seconds

### NFR-3: Audit Completeness
- 100% of Zero/President decisions emit a `president.*` event AND a `decision_log` row
- The audit self-checker detects gaps within one cycle (≤15 minutes)
- Hash chain validation success rate: 100% (any failure is a critical incident)

### NFR-4: Graceful Degradation
- A single MCP server outage degrades only the Directors that depend on that MCP; unrelated Directors continue
- A comm-module outage triggers the bus-watcher's fallback notification path; events queue durably until recovery
- A Zero session crash does not lose pending approvals or in-flight memory writes; the Go daemons keep publishing events; the bus accumulates them; Zero processes the backlog on restart in publish order
- A bus outage is detected by the daemons; they pause publishing and resume on recovery; out-of-band alerts fire per Feature 49 NFR-5

### NFR-5: Memory Durability
- Memory survives Zero session restart, MCP server restart, container restart, Postgres container restart
- Postgres backup cadence covers memory tables; restore tested at deploy time
- Memory writes are durable before being acknowledged (no fire-and-forget)

### NFR-6: Memory Isolation
- Verified by automated test: a Director credential scoped to namespace A cannot read or write under namespace B
- Verified by automated test: revoking a Director credential immediately denies subsequent reads and writes (no caching)
- Verified by automated test: the access matrix is loaded fresh from `constitution-rules.yaml` on every MCP server startup; runtime amendments require restart or explicit reload

### NFR-7: Cost
- Zero new Anthropic API spend introduced by this feature: the President and all Directors run on the existing Claude Code OAuth subscription
- The governor MCP measures token-equivalent reasoning effort per Director for capacity modeling, even though no per-token bill is paid

### NFR-8: Test Coverage
- ≥80% line coverage on each Go daemon
- ≥80% line coverage on each Go MCP server
- ≥95% coverage on the memory access matrix enforcement code (security-critical)
- ≥95% coverage on the hash chain validation code
- Director markdown contract validation has golden-file tests for the reference `president.md`

### NFR-9: Security
- Database role separation: `president_app` role has zero grants on tenant tables; INSERT-only on append-only tables; UPDATE/DELETE/TRUNCATE revoked + trigger as belt-and-braces
- All MCP credentials are injected via Phase.dev (no plaintext on disk; no embedding in container images)
- Compile-time isolation: the President's package tree has zero imports from any tenant package; CI lints for it
- Operator response signatures verified before treatment as a decision (operator-channel-signing, exact mechanism per FR-25)

### NFR-10: Observability
- Each Go daemon exposes a Prometheus `/metrics` endpoint on a stable port
- Metrics include: notification latency (histogram), pending approvals count (gauge by status), MCP server liveness (gauge per MCP), self-audit gaps detected (counter), memory writes per Director (counter by type)
- Logs are structured JSON; one line per decision; fields scrubbed for credentials and PII

## Behavior Specification

### Flow A: Pre-Approval — Director Subagent Path

```
Director publishes *.approval.requested  (e.g. fin.approval.requested for fin.payment.outbound $5,000)
  │
  ▼
Bus (Feature 49) — constitution check confirms request itself is allowed → durable insert + LISTEN/NOTIFY
  │
  ▼
tenet0-bus-watcher daemon receives notification
  │ formats structured message
  ▼
Zero's session receives the message via operator notification channel
  │
  ▼
Zero (President):
  1. tenet0-constitution-mcp.requires_approval(target_event_type) → confirms approval needed
  2. tenet0-pending-mcp.claim_for_decision(request_event_id) → durable claim, prevents double-handling
  3. Decide rule-path or LLM-path:
     a. If matches blanket authorization → rule-path inline:
        - tenet0-pending-mcp.record_decision(approval_id, outcome=approve, mode=rule, rule_id=...)
        - tenet0-bus-mcp.publish_event(president.approved, ...)
        - Done.
     b. If novel/reasoning required → spawn Director subagent (e.g. finance-director.md) via Task tool:
        - Director loads its memory (charter, prior decisions, patterns)
        - Director searches for relevant context (vendor history, prior similar amounts)
        - Director reasons, returns {decision, rationale, confidence}
        - Zero records via tenet0-pending-mcp.record_decision(..., mode=llm, model=..., confidence=...)
        - Zero publishes outcome via tenet0-bus-mcp.publish_event(president.{approved|rejected|deferred})
     c. If Director defers to operator:
        - Zero surfaces the request through the operator notification channel
        - Pending row → status awaiting_operator with operator_deadline = now + 10min
        - Wait for operator response (or deadline sweeper handles expiry)
  │
  ▼
Bus rebroadcasts the outcome event; the requesting Director consumes it and proceeds or aborts.
```

### Flow B: Director Health Degradation

```
Every 60s (configurable):
tenet0-healthcheck-poller daemon:
  for each registered Director:
    for each MCP server in Director's declared grants:
      probe MCP liveness (cheap RPC: list_tools or similar)
      if any required MCP fails:
        publish *.lifecycle.degraded { director, failed_mcp, error }
        update in-memory routing table: this Director is degraded

When MCP recovers (next successful poll):
  publish *.lifecycle.recovered { director, mcp }
  remove degraded marker

Reactive path (between polls):
Zero attempts Task spawn or MCP call from inside a subagent; spawn or MCP call fails:
  Zero publishes *.lifecycle.degraded immediately (no waiting for next poll)
  Routing table updated
```

### Flow C: Director Memory Write and Cross-Director Read

```
Finance Director (during a decision):
  → tenet0-director-memory-mcp.search_memory(query="vendor acme_corp")  [scoped to fin namespace]
  ← {results: [{name: "vendor_acme_history", body: "..."}, ...]}
  → reasons, makes decision
  → tenet0-director-memory-mcp.write_memory(
      type="decision",
      name="acme_payment_2026_04_18",
      description="Approved $5,000 to Acme; vendor verified Jan, no prior issues",
      body="...full rationale...",
      source_event_id=<the bus event ID being decided>
    )
  ← {id: <new memory row UUID>}

Memory write path:
  1. MCP verifies credential → namespace=fin → access matrix allows write to fin
  2. Pre-write scrubber: scan for PII / tenant patterns / credentials
     a. If clean: INSERT into director_memory; rebuild fin's MEMORY.md index; return id
     b. If flagged: REJECT; publish secops.violation.memory_pii { director: fin, pattern_matched: ... }

Later, President synthesizing daily digest:
  → tenet0-director-memory-mcp.search_memory(query="vendor relationships")  [no namespace filter]
  ← {results: [
       {namespace: "fin",     name: "vendor_acme_history",     body: "..."},
       {namespace: "support", name: "acme_support_pattern",    body: "..."},
       {namespace: "tech",    name: "acme_api_integration",    body: "..."}
     ]}
  → synthesizes cross-cutting view; publishes president.digest.daily
```

### Flow D: Audit Self-Check Catches a Forged Decision

```
Hypothetical attacker compromises a Director credential and forges a president.approved event:
  attacker → bus.publish_event(president.approved, ...)  [REJECTED at bus by FR-2a credential check]

Defense-in-depth: imagine the bus check is somehow bypassed.
  An unauthorized president.approved exists in bus events, but no decision_log row exists for it.

Every 15 minutes:
tenet0-audit-self-checker daemon:
  query bus.events WHERE event_type LIKE 'president.%' AND timestamp > now() - 24h
  for each event e:
    check decision_log WHERE outcome_event_id = e.id
    if no row found:
      publish secops.violation.namespace_impersonation {
        offending_event_id: e.id,
        observed_at: e.timestamp,
        detection_lag_seconds: <now - e.timestamp>
      }

Operator (and SecOps when Feature 57 ships) sees the violation event in audit log; investigation begins.
```

## Edge Cases

### EC-1: Two Events Arrive Simultaneously Requiring the Same Director
Zero processes events in publish order. If two events both require the Finance Director and arrive in burst, Zero may spawn two Finance subagents in parallel via Claude Code's parallel Task spawning, OR process them sequentially — both are correct. Pending-approvals row claims (FR-7 `claim_for_decision`) prevent double-handling.

### EC-2: Zero's Session Crashes Mid-Decision
Pending row state allows recovery. On Zero's next session start, any rows in `awaiting_llm` are downgraded to `pending` (in-flight LLM output discarded as untrusted), any in `awaiting_operator` retain that state (operator deadline still applies). Zero re-processes pending rows in publish order. The `tenet0-bus-watcher` daemon kept running; bus events that arrived during the outage are queued and replayed.

### EC-3: A Director's Markdown File Is Edited Mid-Spawn
The in-flight subagent uses the version of the file that was loaded at spawn time. The next spawn loads the new version. The lifecycle daemon publishes a deregistered + registered pair when it detects the change; Zero updates its routing table. No in-flight subagent is killed.

### EC-4: Memory Write Contains Scrubber-Flagged Content
The pre-write scrubber rejects the write. The MCP returns an error to the Director with reason "rejected by pre-write scrubber: pattern <X>". A `secops.violation.memory_pii` event is published with the Director's namespace and the pattern category that matched (not the content itself). The Director must rephrase or omit and retry.

### EC-5: Director Attempts to Read Another Director's Memory
The MCP credential check fails the access matrix lookup. The MCP returns an authorization error. A `secops.violation.memory_access` event is published with the offending Director, the target namespace, and the operation attempted. The original read returns no data.

### EC-6: bus-watcher Daemon Dies
Events queue on the bus (durable per Feature 49 NFR-3). When the daemon restarts, it resumes from the last acknowledged event and flushes the backlog to Zero in order. Zero sees a burst of catchup events; this is normal and the system handles it without special intervention.

### EC-7: comm-module Is Down
The bus-watcher detects the comm-module failure and falls back per CL-1's selected option (polling fallback if A; out-of-band Telegram if B; etc). A `president.notification.degraded` event is published so Zero knows operator surfacing latency may exceed NFR-2.

### EC-8: Director's Required MCP Server Is Unreachable
Detected reactively (FR-19) and via poll (FR-18). The Director is marked degraded; Zero declines to dispatch to it; events that would have gone to that Director either queue or are surfaced to the operator depending on event criticality. Recovery is automatic when the MCP returns.

### EC-9: Memory Size Cap Reached
Per CL-3 settings, the write is rejected with reason "memory cap exceeded; consolidate before writing". A `president.memory.cap_warned` (soft cap) or `president.memory.cap_rejected` (hard cap) event is published. The Director must call `update_memory` on existing entries to consolidate before further writes succeed.

### EC-10: Constitution Amendment Changes the Memory Access Matrix
Running in-flight subagents continue with the matrix loaded at spawn. New spawns load the updated matrix on first MCP call. The MCP server reloads the matrix on next constitution version change (or restart). A `president.constitution.matrix_amended` event is published noting the version change so audit can correlate any access shifts.

### EC-11: Audit Self-Checker's Hash Chain Validation Finds Corruption
A `secops.violation.audit_corruption` event is published with the affected row range (from the first invalid hash to the most recent validated row). The decision log continues accepting writes (corruption is detection, not freeze), but operator + SecOps are notified for forensic investigation.

### EC-12: A Director Markdown File Has Conflicting Department Namespace
Two markdown files both declare `department: ops`. The lifecycle daemon detects the conflict and publishes `secops.violation.registry_conflict` with both file paths. Both Directors are quarantined (no dispatch) until the operator resolves the conflict. Existing memory in the `ops` namespace is preserved (no destructive action).

### EC-13: Zero Spawns a Director That Has No Memory Yet
On first spawn, the Director's `load_memory_index` returns an empty index (just the header skeleton). The Director may write its first `charter` memory inside the spawn (defining who it is). Subsequent spawns load the populated index.

## Success Metrics

- Feature 52 (Operations Director) is buildable against this runtime — its first spawn, healthcheck, and approval cycle all complete end-to-end against the runtime in integration testing
- The reference `president.md` Director is the worked example: exhibits every required contract section; passes contract validation; spawns successfully; loads/writes memory; survives session restart
- Zero new Anthropic API spend (NFR-7) verified by Anthropic billing dashboard at deploy + 30 days
- Audit self-check finds zero gaps in a 7-day production window with normal traffic
- Memory access matrix enforcement: zero false-positive denials and zero false-positive permits in a 7-day production window (verified by Auditor manual review of `secops.violation.memory_access` events plus a sample of allowed reads)
- Operator round-trip p95 < 30 seconds measured across a week of real approvals (NFR-2)
- ≥80% test coverage across the codebase; ≥95% on memory access matrix and hash chain code (NFR-8)
- Hash chain validation: zero corruption detected in production over 30 days

## Out of Scope

- Operations Director (Feature 52)
- Other department Directors — Technology, Sales/Marketing, Customer Support, Finance (Features 53–56)
- SecOps Auditor (Feature 57)
- Customer-facing approval UI on the platform dashboard (later phase)
- Multi-tenant Director runtime (Tenet-0 only per Phase 10 scope, roadmap Resolved Decisions 2026-04-14)
- Replacing or migrating Zero's existing Claude Code session setup; the runtime augments rather than replaces
- Non-Tenet-0 use of the Director runtime (customer tenants do not get this)
- Per-Director Anthropic API keys (the deliberate cost-model decision; if a future feature needs them, that feature reintroduces them)

## Dependencies

- **Feature 49 (Event Bus + Constitution + Token Governor)** — MUST be live on aegis-prod (it is). Hard dependency. Every component of this feature is a client of the bus, the constitution, and/or the governor.
- **Existing comm-module Telegram bridge** — soft dependency for CL-1 default option. If comm-module is not yet live for bidirectional Zero ↔ operator messaging, the bus-watcher uses the polling fallback (CL-1 Option C).
- **Zero's existing Claude Code session in `overnightdesk-tenant-0`** — operational dependency. The runtime LIVES alongside Zero's existing session. Zero's OAuth subscription, MCP configuration, and `.claude-agent-zero/` directory are all reused; this feature ADDS to them.
- **Constitution v1.0.0** — present and loadable. Amendments to add the `memory_access_matrix` section follow the Constitution Part IV amendment process (owner approval, version bump, both `constitution.md` and `constitution-rules.yaml` updated together).

## Clarifications

All three resolved 2026-04-18 by owner (Gary), accepting recommendations.

### CL-1: Bus event injection into Zero's session → **comm-module bridge with polling fallback**

The `tenet0-bus-watcher` daemon publishes each new bus event as a structured message through the existing comm-module Telegram bridge. Zero consumes these like any other inbound operator message. Gary inherits operator visibility into the bus stream "for free" via Telegram. If comm-module is not yet live for bidirectional Zero ↔ operator messaging, the daemon falls back to a polling mode where Zero (on a schedule via cron MCP) calls `tenet0-bus-mcp.list_unprocessed_events` and works the queue. Direct Claude Code SDK injection is reserved as a future optimization once runtime experience identifies a need.

**Implications already reflected in spec:**
- FR-1 / FR-4 specify the routing daemon and the comm-module-default mechanism
- EC-7 documents the fallback path on comm-module outage
- NFR-1 5-second notification latency is achievable on the comm-module path
- Risk section notes the late-comm-module fallback option

### CL-2: Director healthcheck shape → **MCP-server liveness + reactive detection (hybrid)**

The `tenet0-healthcheck-poller` daemon checks the liveness of every MCP server each registered Director declares as a dependency. Polling is cheap and broad — it catches "the tools the Director needs are unreachable" but not "the Director's prompt is broken" or "the grants are misconfigured." Reactive detection (FR-19) covers the rest: when Zero attempts a Task spawn and it fails, or when a Director's first MCP call inside a spawn fails, Zero publishes `*.lifecycle.degraded` immediately without waiting for the next poll cycle. No-op spawn tests as healthchecks were rejected — every poll would cost a real LLM spawn, which would dominate operator-perceivable activity for no commensurate benefit.

**Implications already reflected in spec:**
- FR-18 codifies MCP-server-liveness polling
- FR-19 codifies reactive detection on spawn/call failure
- US-6 acceptance criteria assume both paths work together
- Out-of-scope implicitly excludes spawn-test polling

### CL-3: Memory size caps → **soft warn 1,000 / hard reject 5,000 entries per Director; state-type auto-expires after 30 days**

Per-Director memory is bounded to encourage consolidation rather than hoarding. Soft cap at 1,000 entries publishes `president.memory.cap_warned` and prompts the Director to consolidate via `update_memory` calls. Hard cap at 5,000 rejects new writes with reason "memory cap exceeded; consolidate before writing" and publishes `president.memory.cap_rejected`. Memory entries of type `state` (in-progress work, watch lists) auto-expire after 30 days if not updated; the other types (`charter`, `decision`, `pattern`, `reference`) persist indefinitely.

**Implications already reflected in spec:**
- FR-17 references the caps
- EC-9 handles cap exhaustion
- The expiry semantic forces healthy consolidation behavior from day one and keeps `load_memory_index` digestible at spawn time

## Open Questions for Clarify Phase

These are lower-priority but should be resolved before `/speckit-plan`. Recommendations are inline; not counted against the 3-clarification cap.

### OQ-1: Director Lifecycle Detection Mechanism
When a Director's markdown file changes (operator edits it), what triggers `*.lifecycle.deregistered` + `*.lifecycle.registered` re-publication? Recommendation: file-system watcher inside one of the daemons (probably `tenet0-bus-watcher`) with debounce (5-second quiet period before publishing the pair) to avoid event storms during multi-edit sessions.

### OQ-2: Memory Versioning Across Constitution Amendments
Should existing memory rows be tagged with the constitution version they were written under? Recommendation: yes — add a `constitution_version` column. Enables re-evaluation of older memories if the constitution drifts (e.g., a memory written under a permissive matrix should be flagged when the matrix tightens).

### OQ-3: Memory Visibility Refinement (`visible_to`)
Component 4 specifies that the President can mark its own decision memories as `visible_to: [department]` so the affected Director can read that single entry. Should the same field exist on Directors' own memories so they can deliberately share specific entries? Recommendation: yes — same field, same MCP enforcement. Default empty (private).

### OQ-4: Daemon Container Topology
Should the four Go daemons (bus-watcher, healthcheck-poller, deadline-sweeper, audit-self-checker) ship as one container with multiple processes, or one container per daemon? Recommendation: one container per daemon. Matches the "small simple binaries" spirit; gives Docker `restart: unless-stopped` clean per-concern semantics; trivial extra resource overhead at MVP scale.

### OQ-5: Spawn Telemetry
Should the governor MCP record subagent spawn timings (cold start, warm start, total wall-clock) as part of token accounting? Recommendation: yes. Gives capacity-planning data for future Phase 10.x Director additions and helps detect Claude Code spawn-overhead regressions.

## Risks

- **Single-session concurrency limit.** Zero's session can spawn a bounded number of Task subagents in parallel within one turn (typically 5–10 per Claude Code message). A burst of 50 simultaneous events queues serially. Mitigation: post-MVP, evaluate spawning multiple concurrent President "shifts" (separate Claude Code sessions) if the queue depth becomes operationally problematic.
- **Subagent spawn latency dominates LLM-path NFR-1.** Each cold subagent spawn costs ~3–5 seconds of Claude Code overhead. The 60-second p95 target accommodates this but allows little slack. Mitigation: rule-path dominance (designed into the contract — Directors decline simple cases via their own logic), observed via decision-mode metric.
- **Zero's session is a single point of failure for governance.** If Zero's Claude Code session crashes (rare but possible), no decisions are made until restart. The Go daemons keep publishing; the bus accumulates events; no data loss. But governance pauses. Mitigation: existing comm-module already alerts on Zero unresponsiveness; add a `president.session.unresponsive` heartbeat check.
- **Memory access matrix amendment errors.** A bad amendment could either over-permit (Director X reads Y when it shouldn't) or over-restrict (President can't read what it needs for digests). Mitigation: amendments require Constitution Part IV process (owner approval, version bump); SecOps can audit access-grant changes against subsequent reads.
- **OAuth subscription rate limits.** All Directors share Zero's OAuth subscription rate limit. A heavy day (many digests + many Director spawns) could hit Anthropic's per-account limits. Mitigation: governor tracks token-equivalent effort; future feature can introduce per-Director rate budgets enforced at the dispatch layer.
- **comm-module dependency for CL-1 Option A.** If comm-module ships late, the runtime ships on the polling fallback (Option C) with worse latency until comm-module catches up. Mitigation: explicit fallback path; not a hard dependency.
- **Markdown contract drift.** A Director author writes a `.md` file that "works" by passing validation but reasons poorly because the prompt construction is subtle. Mitigation: golden-file regression tests on the reference `president.md`; planned future "Director linter" once we have multiple Directors to compare.
- **Pre-write scrubber false negatives.** PII or tenant content slips through the scrubber and lands in memory. Mitigation: scrubber rules versioned alongside constitution; periodic SecOps memory audit (Feature 57 will automate); Postgres encryption-at-rest mitigates blast radius.
