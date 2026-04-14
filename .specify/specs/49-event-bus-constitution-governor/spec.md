# Feature 49: Event Bus + Constitution + Token Governor

## Overview

Phase 10 of OvernightDesk introduces a corporate-hierarchy agent architecture for **Tenet-0** (Gary's business, the platform itself running on aegis-prod). Feature 49 is the foundational infrastructure layer that every subsequent Phase 10 feature depends on:

1. **Event Bus** — the communication substrate. Departments publish events; other departments and the President subscribe. All inter-department traffic flows through this bus.
2. **Constitution** — the governance document that defines how Tenet-0 builds, acts, and treats customer tenants. Loaded into every agent's system prompt; enforced at the event-bus protocol layer.
3. **Token Governor** — per-department token spend tracking with soft-warn thresholds and hard-kill limits.

Without this foundation, no Phase 10 department can exist. This feature is pure plumbing — no customer-facing behavior changes.

**Business Value:** Unlocks the entire Phase 10 roadmap. Establishes the governance and cost-control guardrails that make autonomous department agents safe to run. Prevents runaway spending during department development.

**Scope Note:** Tenet-0 only. Customer tenants do not receive this infrastructure. The corporate-hierarchy pattern is opt-in for future phases.

## User Stories

### User Story 1: Department Publishes an Event
**As a** Tenet-0 department agent (e.g., Operations)
**I want to** publish events describing work I have done
**So that** other departments and the President can react to my work

**Acceptance Criteria:**
- [ ] A department can publish an event with a type (`ops.job.completed`), payload, and source identifier
- [ ] Published events are durably stored — they survive a process restart
- [ ] Publishing is non-blocking (fire-and-forget semantics); the publisher does not wait for subscribers
- [ ] Publishing succeeds in under 50ms under normal conditions
- [ ] An event without a valid source identifier is rejected before storage

**Priority:** High

### User Story 2: Department Subscribes to Events
**As a** Tenet-0 department agent (e.g., Technology)
**I want to** subscribe to events from other departments
**So that** I can react to them within my policy

**Acceptance Criteria:**
- [ ] A department can subscribe to specific event types (`fin.payment.received`) or wildcard patterns (`*.failed`)
- [ ] Subscribers receive events in the order they were published
- [ ] A subscriber that is offline when an event is published still receives the event when it reconnects (within a retention window)
- [ ] Subscribers acknowledge events after processing; unacknowledged events are retried with exponential backoff
- [ ] A subscriber that crashes mid-processing causes the event to be redelivered

**Priority:** High

### User Story 3: President Observes Everything
**As the** President (Agent Zero)
**I want to** observe all events flowing through the bus
**So that** I can monitor department behavior, aggregate reports, and intervene when needed

**Acceptance Criteria:**
- [ ] The President subscribes to all event types with a single wildcard
- [ ] Event metadata includes source department, timestamp, and causality chain (parent event ID, if any)
- [ ] The President can query historical events by department, type, or time range
- [ ] The President's subscription does not delay event delivery to other subscribers

**Priority:** High

### User Story 4: Constitutional Enforcement at the Bus Layer
**As a** Tenet-0 operator
**I want** the event bus to reject events that violate the constitution
**So that** constitutional violations cannot propagate, even when a department is misbehaving

**Acceptance Criteria:**
- [ ] The constitution defines event-level rules (e.g., "Finance cannot publish `fin.payment.outbound` without `president.approved` in the causality chain")
- [ ] Rule violations cause the event to be rejected at publish time; the publisher receives an error
- [ ] Rejected events are logged to an immutable audit log with the rule that was violated
- [ ] Rule evaluation completes in under 10ms per event
- [ ] The President is notified when any department attempts to publish a rejected event

**Priority:** High

### User Story 5: Constitution Loaded Into Every Agent
**As a** department agent
**I want** the constitution embedded in my system prompt at startup
**So that** my reasoning is grounded in Tenet-0 policy before I take any action

**Acceptance Criteria:**
- [ ] Every Tenet-0 agent reads the constitution at startup and embeds it in its system prompt
- [ ] When the constitution changes, running agents receive the updated version within a defined reload window
- [ ] An agent that cannot load the constitution refuses to start
- [ ] The constitution is versioned; every agent logs which version it loaded

**Priority:** High

### User Story 6: Token Budget Enforcement
**As a** Tenet-0 operator
**I want** each department to have a monthly token budget with soft-warn and hard-stop thresholds
**So that** a runaway agent cannot drain the budget before I can intervene

**Acceptance Criteria:**
- [ ] Each department has a configurable monthly token budget (input + output combined, valued in cents)
- [ ] A warning event is published when a department reaches 80% of its budget
- [ ] At 100% of budget, the governor blocks further Claude API calls from that department and publishes a `governor.budget.exceeded` event
- [ ] A blocked department's in-flight call completes but no new calls are admitted
- [ ] Budgets reset on the first day of each calendar month (UTC)
- [ ] The President can grant a one-time budget extension via a signed approval event

**Priority:** High

### User Story 7: Audit Trail for SecOps
**As the** SecOps auditor
**I want** every event, rejection, and budget action to be immutably logged
**So that** I can audit compliance against the 47 InfoSec controls

**Acceptance Criteria:**
- [ ] Every published event, rejected event, budget warning, budget block, and constitution load is recorded in an append-only audit log
- [ ] Audit log entries are timestamped and include the actor (department), action, and relevant payload
- [ ] Audit log entries cannot be modified or deleted by any department, including the President
- [ ] SecOps can query the audit log by actor, action type, or time range
- [ ] The audit log persists independently of the event bus's retention window

**Priority:** High

## Functional Requirements

### FR-1: Event Schema
Every event must include: unique ID, event type (namespaced e.g. `ops.job.completed`), source department, timestamp (UTC), payload (structured data), and optional parent event ID (causality chain).

### FR-2: Event Type Namespace
Event types follow the pattern `<department>.<subject>.<verb>`. Only the department itself may publish events with its namespace prefix. Valid department prefixes: `president`, `ops`, `tech`, `cro`, `cso`, `cfo`, `secops`, `governor`.

### FR-2a: Department Authentication
Each department is issued a unique credential at startup. The event bus maintains a credential → allowed-namespace mapping. Every publish request includes the credential; the bus verifies the credential and rejects publishes where the requested namespace does not match the credential's allowed prefix. Credentials are rotatable without downtime. An unauthenticated publish is rejected and logged to the audit log as a `secops.violation.unauthenticated` event.

### FR-3: Event Retention
Events are retained for at least 30 days after publication. The audit log is retained indefinitely.

### FR-4: Subscription Patterns
Subscribers may subscribe to:
- Exact event type: `fin.payment.received`
- Department-scoped wildcard: `fin.*`
- Global wildcard: `*` (reserved for President and SecOps)
- Suffix wildcard: `*.failed`

### FR-5: Delivery Semantics
At-least-once delivery. Subscribers must be idempotent. Ordering is preserved per department (events from department X arrive in publish order) but not globally.

### FR-6: Constitution Format
The constitution consists of **two companion artifacts**, always versioned together:

1. **`constitution.md`** — a human-readable prose document containing:
   - Principles (how Tenet-0 builds, acts, treats customer tenants)
   - Department boundaries (what each department may/may not do autonomously)
   - Amendment process (versioned; amendments require owner approval)
   - Narrative explanations of the rules

2. **`constitution-rules.yaml`** — a machine-readable rules file containing:
   - Event-level rules evaluated by the bus (pre-approval requirements, causality requirements, namespace restrictions)
   - Approval category definitions (which event types require per-action approval vs. fall under blanket authorizations — see FR-6a)
   - Rule identifiers that `constitution.md` can reference by name

Both files live in `/tenet-0/shared/` and share a version identifier. Amendments update both in a single commit.

### FR-6a: Approval Categories
The rules file defines two approval modes for events that require President authorization:

- **Per-action approval** — High-risk events (e.g., `fin.payment.outbound`, `tech.deploy.production`, anything touching customer data). Each such event requires its own explicit `president.approved` event in the causality chain, scoped to exactly one target event.
- **Blanket authorization** — Routine low-risk events pre-categorized in the rules file (e.g., "Finance may auto-approve refunds under $X," "Marketing may publish scheduled content"). The President issues a standing authorization event that covers all future events matching the category until revoked.

The rules file defines which event types fall into which category. The bus enforces: events in the per-action category are rejected without a scoped approval; events in the blanket category are allowed if a current standing authorization exists.

### FR-7: Constitution Version Tracking
Each constitution has a version identifier. Events published under an outdated constitution version trigger a warning; events older than N versions are rejected.

### FR-8: Budget Configuration
Each department has a budget record with: monthly limit (cents), current spend (cents), warn threshold (default 80%), reset day (default 1st UTC), and a grace extension flag set by President approval.

### FR-9: Budget Tracking Granularity
The governor tracks every Claude API call by a department with: department name, model used, input tokens, output tokens, calculated cost (cents), and timestamp.

### FR-10: Budget Enforcement Point
Budget checks occur before the Claude API call is made. A pre-call cost estimate is used; actual cost is reconciled post-call. Cost overruns within a single call are allowed to complete (NFR-1 bounds them).

### FR-11: Constitutional Rule Evaluation
Rules are expressed in the machine-readable `constitution-rules.yaml` in a declarative form that can be checked against the event's payload and causality chain. Rules are evaluated in a deterministic order; the first violation short-circuits.

### FR-11a: Approval Event Format
Two approval event shapes are supported, matching the categories in FR-6a:

- **Per-action approval event** (`president.approved`) payload includes:
  - `approves_event_id` — the exact target event ID being approved
  - `scope` — the event type the approval authorizes (e.g., `fin.payment.outbound`)
  - `expires_at` — UTC timestamp after which the approval is invalid (default: 10 minutes from issuance)
  - `reason` — human-readable justification recorded to the audit log
  - `issued_by` — always `president`; verified via FR-2a authentication

- **Blanket authorization event** (`president.authorization.granted`) payload includes:
  - `category` — the approval category defined in `constitution-rules.yaml` (e.g., `routine.marketing.content`)
  - `expires_at` — UTC timestamp or `null` for indefinite (revocable)
  - `constraints` — category-specific parameters (e.g., `max_amount_cents: 10000` for refund auto-approval)
  - `reason` — human-readable justification
  - A matching `president.authorization.revoked` event cancels a blanket authorization immediately.

The bus records all approval events (issued, expired, consumed, revoked) in the audit log. An approval that is consumed by a target event is marked so; per-action approvals are single-use.

### FR-12: Causality Chain
When one event triggers another, the child event references the parent's ID. The chain is walkable by SecOps and the President to reconstruct what caused what.

## Non-Functional Requirements

### NFR-1: Performance
- Event publish latency: p50 < 10ms, p99 < 50ms under normal load
- Event delivery to an online subscriber: p50 < 100ms, p99 < 500ms
- Constitutional rule evaluation: p99 < 10ms per event
- Budget check before a Claude call: p99 < 20ms

### NFR-2: Throughput
- Sustained 100 events/second across all departments without loss
- Burst tolerance: 1,000 events in 10 seconds without dropping

### NFR-3: Durability
- Published events survive process crashes, OS reboots, and planned container restarts
- The audit log is fsync-durable; a lost audit entry is treated as a critical incident

### NFR-4: Security
- Only Tenet-0 processes on aegis-prod can connect to the event bus (network-isolated, no external access)
- Only the owning department may publish under its namespace prefix (authenticated at publish)
- Audit log is append-only; no process has delete or update permission
- Constitution file integrity is verified at every load (hash check)

### NFR-5: Reliability
- Event bus uptime SLA: 99.9% (within Tenet-0 — platform-internal)
- If the bus is unavailable, departments enter a degraded mode: they buffer outbound events locally and flush when the bus returns
- A catastrophic bus failure triggers a `secops.violation.critical` event via an out-of-band channel (file system + Telegram alert)

### NFR-6: Observability
- Every event publish, rejection, subscription, delivery, and budget action is logged
- Metrics exposed: events/sec per department, rejection rate, subscription lag, budget utilization per department
- The President can query a real-time dashboard of department activity

## Edge Cases & Error Handling

### EC-1: Department Publishes Outside Its Namespace
Operations attempts to publish `fin.payment.outbound`. The bus verifies the Operations credential maps only to the `ops.*` namespace and rejects the publish with an authorization error. The attempt is logged to the audit log and a `secops.violation.namespace` event is raised.

### EC-1a: Unauthenticated Publish
An unknown process connects to the bus and attempts to publish without a valid credential. The bus rejects the connection, logs the attempt with source details, and raises a `secops.violation.unauthenticated` event.

### EC-1b: Credential Rotation
The Operations department's credential is rotated. The new credential is issued before the old one is revoked. Operations starts using the new credential; the bus accepts it. After a grace window, the old credential is revoked. Any process still holding the old credential is rejected.

### EC-2: Constitutional Rule Blocks a Legitimate Event
Finance publishes `fin.payment.outbound` without prior approval. The bus rejects. Finance must either (a) obtain a `president.approved` event scoped to the specific payment and retry, or (b) if the action falls under a blanket authorization (`president.authorization.granted` for the `routine.finance.small_refund` category and within its constraints), publish with the authorization event in the causality chain.

### EC-2a: Expired Per-Action Approval
Finance obtains a `president.approved` event at T+0, fails to publish before T+10 minutes (the default expiry). The approval is expired at publish time; the bus rejects the event. Finance must request a fresh approval.

### EC-2b: Revoked Blanket Authorization
Marketing has a `routine.marketing.content` blanket authorization. The President publishes `president.authorization.revoked` for that category. A subsequent Marketing publish is rejected. Events published before the revoke remain valid.

### EC-2c: Approval Event Consumed Twice
A per-action approval is scoped to `approves_event_id: evt-abc`. A malicious or buggy department tries to use the same approval for a different event. The bus rejects because the target event ID does not match. The approval is also marked single-use: a second attempt to publish the intended `evt-abc` after successful consumption is rejected.

### EC-3: Subscriber Cannot Process an Event
A subscriber throws an error while processing. The event is re-queued with exponential backoff. After N retries (default 5), the event moves to a dead-letter queue and the subscriber's department is paused pending President review.

### EC-4: Budget Exhaustion Mid-Task
A department has an in-flight Claude call when its budget tips past 100%. The in-flight call completes (cost is recorded). No new calls are admitted until the budget is reset or extended.

### EC-5: Constitution Change During Active Work
The owner amends the constitution. A department is mid-task with the old version loaded. The department completes its current task under the old version, then reloads on next task boundary. The version transition is logged.

### EC-6: Event Storm / Backpressure
A department publishes 10,000 events in a second. The bus applies per-department rate limits (default 100/sec burst, 50/sec sustained) and queues the overflow. The offending department receives warnings and, if sustained, is paused.

### EC-7: Duplicate Event Delivery
A subscriber receives the same event twice due to at-least-once semantics. Subscribers must be idempotent (use event ID as a deduplication key).

### EC-8: Causality Loop
Department A publishes an event that triggers B, which triggers A again. The bus detects cycles by walking the causality chain; chains exceeding depth 10 are flagged and broken.

### EC-9: Audit Log Disk Full
The audit log's disk is exhausted. The bus enters read-only mode (no new publishes accepted) until disk is freed or log is rotated. An out-of-band alert fires.

### EC-10: President is Offline
The President is the approval authority for pre-approval events. If the President is offline when an approval is requested, the event times out after a configurable window (default 10 minutes) and the requesting department must retry later or fall back to a safe default behavior defined in the constitution.

### EC-11: Budget Reset Race
A department is mid-call at exactly midnight UTC on the first of the month. The in-flight call uses the old budget counter; the new budget takes effect for the next call. Budget reset is atomic.

### EC-12: Clock Drift Between Departments
Events are stamped using the event-bus host's clock, not the publisher's. This ensures a single authoritative ordering.

## Success Metrics

- All Phase 10 departments (Features 52–57) publish and subscribe through this bus
- Zero constitutional violations reach downstream subscribers (100% rejection enforcement)
- Budget overruns in a test harness are caught before > 5% over-limit spend
- Audit log is complete and queryable by SecOps for the 47 InfoSec controls
- Event bus p99 publish latency < 50ms in the Tenet-0 production environment
- 80%+ test coverage on the event bus, constitution loader, and governor
