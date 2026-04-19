# Requirements Quality Checklist — Feature 50: Tenet-0 Director Runtime

## Content Quality

- [ ] No implementation details in functional requirements (no library names in FRs; specific tech choices live in plan, not spec)
- [ ] Requirements written from user perspective (Zero, Director, operator, SecOps, daemon-as-actor)
- [ ] Technology-agnostic language where possible (where a specific runtime is referenced, it's inside a `[NEEDS CLARIFICATION]` marker, not an FR)
- [ ] Spec matches Feature 49 sibling style (Problem Statement, Design Decision, User Stories, FRs, NFRs, Edge Cases, Success Metrics)
- [ ] Pivot from prior Feature 50 (standalone Go President) is explained in Problem Statement and Design Decision

## Completeness

- [ ] All 9 user stories have ≥3 acceptance criteria (verified: each has ≥5)
- [ ] All 6 architectural components covered by FRs:
  - [ ] Component 1 — Zero-as-President (FR-1, FR-2, FR-3, FR-4, FR-5, FR-6)
  - [ ] Component 2 — Go MCP servers (FR-7, FR-8, FR-9, FR-10, FR-21 audit, FR-25 operator channel)
  - [ ] Component 3 — Go background daemons (FR-1 bus-watcher, FR-18 healthcheck, FR-20 deadline, FR-21 audit)
  - [ ] Component 4 — Director memory subsystem (FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17)
  - [ ] Component 5 — Director interface contract (FR-23, FR-24)
  - [ ] Component 6 — Constitution + Postgres updates (FR-9, FR-10, FR-13)
- [ ] Edge cases documented (13 EC entries: concurrency, crash recovery, file edits, memory PII, access denial, daemon outages, comm outages, MCP outages, cap exhaustion, constitution amendments, hash corruption, registry conflicts, empty memory)
- [ ] Error handling specified in FRs (FR-15 scrubber, FR-19 reactive degradation, FR-21 audit gaps, EC-2 crash recovery, EC-7 comm outage)
- [ ] Dependencies enumerated (Feature 49 hard, comm-module soft, Zero's session operational, Constitution v1.0.0)
- [ ] Out-of-scope list is specific (Features 52–57, multi-tenant, dashboard UI, OAuth migration, per-Director API keys)
- [ ] Risks enumerated with mitigations

## Testability

- [ ] All functional requirements are measurable or observable
- [ ] All non-functional requirements have numeric thresholds (latency p95, round-trip, coverage %, durability)
- [ ] Acceptance criteria are verifiable by reading bus events + audit log + memory tables (FR-9, FR-12, FR-21 make this structurally true)
- [ ] Success Metrics are measurable in Tenet-0 production (7-day window, 30-day spend check, etc.)
- [ ] NFR-7 (zero new Anthropic API spend) is measurable directly via Anthropic billing dashboard

## Constitutional Compliance (per `.specify/memory/constitution.md` v1.0.0)

- [ ] **Principle 1 (Data Sacred):**
  - [ ] Director memory MUST NOT contain tenant data — enforced by FR-15 pre-write scrubber + audit-logged violations
  - [ ] President MUST NOT read tenant.db — enforced by NFR-9 compile-time isolation + role separation
  - [ ] Repeated in Overview Scope Note
- [ ] **Principle 2 (Security as Feature):**
  - [ ] Memory access matrix in `constitution-rules.yaml` (governance, not config) — FR-13
  - [ ] Database role separation + INSERT-only on append-only tables — FR-10, NFR-9
  - [ ] Hash chain on decision_log — FR-9
  - [ ] Phase.dev secret injection — NFR-9
  - [ ] Operator response signature verification — FR-25, NFR-9
- [ ] **Principle 3 (Agent Acts, Owner Decides):**
  - [ ] Post-hoc review baked into Design Decision; pre-approval events explicitly reference Feature 49 FR-6a
  - [ ] FR-5 inline-vs-Director dispatch reflects post-hoc default
- [ ] **Principle 4 (Simple Over Clever):**
  - [ ] 9-binary fan-out (5 MCPs + 4 daemons) is justified: each is single-purpose; the alternative (one monolith) was the deleted prior Feature 50 design
  - [ ] No new infra beyond what Feature 49 provides (same Postgres instance, same network)
  - [ ] Reuses existing comm-module pattern (CL-1 recommendation)
- [ ] **Principle 6 (Honesty with Customers):**
  - [ ] Honest status reporting codified in FR-19 reactive degradation, EC-7 comm-module outage, EC-12 registry conflict
  - [ ] Audit self-check (FR-21) catches gaps and surfaces them honestly
- [ ] **Principle 7 (Owner's Time is Protected):**
  - [ ] Single-channel operator notification (Telegram via comm-module) — NFR-2 + US-5
  - [ ] Conservative mode after operator unavailability — US-7 acceptance criteria
- [ ] **Test-First Imperative:**
  - [ ] NFR-8 requires ≥80% coverage; ≥95% on security-critical (memory access matrix, hash chain)
  - [ ] Success Metric requires golden-file tests on reference `president.md`
- [ ] **Pillar A (Data Access):**
  - [ ] All DB access through pgx (specified in plan); goose migrations; no raw SQL string interpolation
- [ ] **Pillar B (API Route Security):**
  - [ ] Operator channel auth-first; idempotent mutations (operator nonce); consistent error shape

## Clarifications

- [x] At most 3 `[NEEDS CLARIFICATION]` markers in spec body — **0 remaining (all 3 resolved 2026-04-18)**
- [x] CL-1 resolved: comm-module bridge default, polling fallback if comm-module not live
- [x] CL-2 resolved: MCP-server-liveness polling + reactive detection on spawn/call failure
- [x] CL-3 resolved: soft 1k / hard 5k entries per Director; state-type auto-expires 30 days
- [x] Lower-priority clarifications moved to "Open Questions for Clarify Phase" (OQ-1 through OQ-5)
- [x] Resolved clarifications carry implications references and pivot conditions

## Cross-Feature Consistency

- [ ] References to Feature 49 cite specific FR/NFR/EC IDs (FR-2a, FR-6a, FR-11a, NFR-3, NFR-4, NFR-5, EC-1) — verifiable
- [ ] Behavior Specification flows traceable end-to-end through Feature 49 bus → Feature 50 runtime → back to bus
- [ ] Event types used (`president.*`, `*.lifecycle.*`, `secops.violation.*`) conform to Feature 49 FR-2 namespace pattern
- [ ] President's own publishes are subject to bus enforcement just like any other Director (FR-23, US-8 self-audit)
- [ ] Phase 10 dependency graph honored: this feature unblocks Features 52–57; absorbs original Feature 51 (Department Interface Contract)

## Specific Validation Items for This Feature

### Memory Subsystem
- [ ] Memory access matrix is in `constitution-rules.yaml` (governance, not code)
- [ ] FR-14 enforcement is testable independent of any specific Director (NFR-6 contract)
- [ ] Memory taxonomy (5 types) matches the auto-memory pattern Gary already uses
- [ ] Cross-Director President read access is audit-logged (US-4 acceptance criterion)
- [ ] Pre-write scrubber rejects rather than silently strips (FR-15)

### Director Interface Contract
- [ ] Required sections in markdown enumerated (FR-23: identity, charter, MCP grants, bus namespace, memory protocol, constitutional acknowledgment)
- [ ] Worked example (`president.md`) ships with this feature (FR-24)
- [ ] Validation surfaces failures as `secops.violation.registry_invalid` events (FR-23)
- [ ] Lifecycle events published on add/edit/remove (FR-22)

### Cost Model
- [ ] NFR-7 explicitly states zero new Anthropic API spend
- [ ] Governor MCP still useful (token-equivalent for capacity modeling)
- [ ] Out-of-scope explicitly forbids per-Director API keys
- [ ] Risk section acknowledges OAuth rate-limit shared resource

### Daemon Architecture
- [ ] Each of 4 daemons is single-purpose (bus-watcher, healthcheck-poller, deadline-sweeper, audit-self-checker)
- [ ] OQ-4 explicitly addresses "one container per daemon" recommendation
- [ ] Daemon failure modes are individually addressed (EC-6 bus-watcher, EC-7 comm-module, FR-19 reactive)

## Validation Status

- [ ] Spec reviewed against `sub-agent-architecture.md` — pivot from "departments as containers" to "departments as subagents" is explicit and reasoned
- [ ] Spec reviewed against Feature 49 spec — no conflicting terminology or overlapping scope
- [ ] Spec reviewed against roadmap Phase 10 dependency graph — Feature 50 absorbs Feature 51 (noted explicitly in dependencies)
- [ ] Ready for `/speckit-clarify` — 3 clarifications + 5 open questions to resolve

## Known Gaps (to resolve in clarify/plan)

- Specific MCP tool signatures (live in plan/contracts, not spec)
- Pending-approvals row schema details (live in data-model.md, not spec)
- Exact Postgres role grant statements (live in plan)
- Director markdown linter rules (live in plan or in a separate Director-linter feature)
- Hash chain seed value and bootstrap mechanics (live in plan/data-model.md)
- Operator channel signing key format and rotation procedure (live in plan; security review in plan phase)
