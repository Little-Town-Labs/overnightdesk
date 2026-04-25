# Feature 50 — Data Model

Postgres schema for the Tenet-0 Director Runtime. Lives in the existing Feature 49 instance under a dedicated `president` schema. Migration files numbered `050_*.sql` to avoid collision with Feature 49's `001-049_*`.

## Postgres Roles

```sql
-- Migration 050_001_roles.sql
CREATE ROLE president_app NOINHERIT LOGIN PASSWORD <from-phase>;
CREATE ROLE president_audit_owner NOINHERIT LOGIN PASSWORD <from-phase>;
CREATE ROLE secops_app NOINHERIT LOGIN PASSWORD <from-phase>;

CREATE SCHEMA president AUTHORIZATION president_audit_owner;
GRANT USAGE ON SCHEMA president TO president_app, secops_app;

-- Default grants (overridden per-table below)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA president TO president_app;
GRANT SELECT ON ALL TABLES IN SCHEMA president TO secops_app;

-- Append-only enforcement (security strategy §4 + FR-10)
REVOKE UPDATE, DELETE, TRUNCATE ON president.decision_log FROM president_app;
GRANT INSERT, SELECT ON president.decision_log TO president_app;

REVOKE UPDATE, DELETE, TRUNCATE ON president.lifecycle_events FROM president_app;
GRANT INSERT, UPDATE (published_to_bus_at), SELECT ON president.lifecycle_events TO president_app;

REVOKE DELETE, TRUNCATE ON president.director_memory FROM president_app;
GRANT INSERT, UPDATE (superseded_by), SELECT ON president.director_memory TO president_app;

-- president_app has NO grants on Feature 49 schemas (events, audit_log, governor)
-- nor on any tenant tables — President talks to bus through bus-go library with bus_app credential
```

`president_audit_owner` is used only by the manually-invoked migration tool. `president_app` is the runtime role for all 10 binaries. `secops_app` is read-all (preparation for Feature 57).

## Entity Overview

| Entity | Purpose | Lifetime |
|---|---|---|
| `pending_approvals` | Durable queue of in-flight approval requests (FR-7, FR-8, FR-14) | Until resolved or expired |
| `decision_log` | Hash-chained record of every President decision (FR-9, FR-10) | Indefinite, append-only |
| `director_memory` | Per-Director namespaced persistent memory (FR-11–FR-17) | Append-only with supersedes |
| `director_memory_index` | MEMORY.md-shaped index per Director (FR-12) | Rebuilt on every memory write |
| `director_registry` | Roster of registered Directors from `*.lifecycle.registered` events (FR-22) | Until deregistered |
| `mcp_liveness` | Current per-Director per-MCP healthcheck state (FR-18) | Updated on transitions only |
| `lifecycle_events` | Local mirror of President lifecycle transitions (FR-14, EC-2) | Indefinite |
| `operator_nonces` | Replay-defense for operator decisions (security T8) | 24h TTL |
| `bus_watcher_state` | Cursor for `tenet0-bus-watcher` LISTEN/NOTIFY replay | Single row, ever-updated |
| `governor_ledger` | Token-equivalent measurements per Director (NFR-7, OQ-5) | Indefinite |

---

## Table: `president.pending_approvals`

Durable store for in-flight pre-approval requests (FR-7, FR-8, FR-14, EC-2).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | President-internal approval ID |
| `request_event_id` | UUID | NOT NULL UNIQUE | Original `*.approval.requested` bus event ID |
| `target_event_id` | UUID | NOT NULL | Event being approved (Feature 49 FR-11a `approves_event_id`) |
| `requesting_department` | TEXT | NOT NULL CHECK (requesting_department ~ '^[a-z][a-z0-9_]+$') | Director namespace prefix |
| `target_event_type` | TEXT | NOT NULL | e.g. `fin.payment.outbound` |
| `constitutional_rule_id` | TEXT | NOT NULL | Rule from `constitution-rules.yaml` triggering approval |
| `payload` | JSONB | NOT NULL | Sanitized request payload (PII-stripped per security §2) |
| `status` | TEXT | NOT NULL CHECK (status IN ('pending','awaiting_llm','awaiting_operator','decided','expired')) | State machine |
| `awaiting_llm_attempt` | INT | NOT NULL DEFAULT 0 | Retry counter (EC-9) |
| `operator_deadline` | TIMESTAMPTZ | NULL | Set on transition to `awaiting_operator`; default received_at + 10 min |
| `outcome` | TEXT | NULL CHECK (outcome IN ('approved','rejected','deferred',NULL)) | Set on decision |
| `outcome_event_id` | UUID | NULL | The published `president.{approved\|rejected\|deferred}` bus event ID |
| `decision_mode` | TEXT | NULL CHECK (decision_mode IN ('rule','llm',NULL)) | FR-3 path tag |
| `rule_id_used` | TEXT | NULL | Rule path: which rule resolved this |
| `model_id` | TEXT | NULL | LLM path: model identifier for telemetry |
| `confidence` | NUMERIC(3,2) | NULL CHECK (confidence BETWEEN 0 AND 1 OR confidence IS NULL) | LLM path confidence |
| `rationale` | TEXT | NULL CHECK (length(rationale) <= 2000) | FR-12 rationale |
| `received_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | When request hit President |
| `decided_at` | TIMESTAMPTZ | NULL | When status reached `decided` or `expired` |
| `surfaced_at` | TIMESTAMPTZ | NULL | When `president.approval.surface_requested` published |

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE (`request_event_id`) — idempotent re-receipt
- INDEX (`status`, `received_at`) WHERE `status IN ('pending','awaiting_llm','awaiting_operator')` — startup recovery (FR-14)
- INDEX (`operator_deadline`) WHERE `status = 'awaiting_operator'` — deadline-sweeper scan
- INDEX (`requesting_department`, `received_at` DESC) — per-department audit

**State machine:**
```
pending → awaiting_llm → decided
pending → awaiting_operator → decided
pending → awaiting_llm → awaiting_operator → decided
* → expired (operator deadline lapsed)
```

**Crash recovery (FR-14, EC-2):** on Zero session restart or `pending-mcp` restart, rows in `awaiting_llm` are downgraded to `pending` (in-flight LLM output discarded as untrusted). Rows in `awaiting_operator` retain state; deadline still applies.

**Transactional invariant:** `record_decision` mutates `pending_approvals.status` AND inserts `decision_log` row AND publishes outcome bus event, all in one transaction. If any step fails, all roll back.

---

## Table: `president.decision_log`

Hash-chained record of every President decision (FR-9, FR-10, NFR-3, security T7).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | Row ID |
| `outcome_event_id` | UUID | NOT NULL UNIQUE | The bus event published as result |
| `outcome_event_type` | TEXT | NOT NULL | e.g. `president.approved` |
| `causality_root_event_id` | UUID | NULL | Original triggering event |
| `decision_mode` | TEXT | NOT NULL CHECK (decision_mode IN ('rule','llm')) | FR-3 path tag |
| `rule_id_used` | TEXT | NULL | Rule path |
| `model_id` | TEXT | NULL | LLM path |
| `input_tokens` | INT | NULL | LLM path: governor accounting |
| `output_tokens` | INT | NULL | LLM path: governor accounting |
| `confidence` | NUMERIC(3,2) | NULL | LLM path |
| `rationale` | TEXT | NOT NULL CHECK (length(rationale) BETWEEN 1 AND 2000) | FR-12; required non-empty |
| `actor_director` | TEXT | NOT NULL DEFAULT 'president' | Which Director made the decision |
| `prev_hash` | BYTEA | NOT NULL | Hash chain previous-row hash |
| `row_hash` | BYTEA | NOT NULL | `SHA256(prev_hash || canonical_row_bytes)` |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | Insert time |

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE (`outcome_event_id`)
- INDEX (`created_at` DESC)
- INDEX (`outcome_event_type`, `created_at` DESC)
- INDEX (`causality_root_event_id`)

**Append-only enforcement:**
- `president_app` role: `INSERT, SELECT` only (UPDATE/DELETE/TRUNCATE revoked at role grant)
- `BEFORE UPDATE OR DELETE` trigger raises exception `'decision_log is append-only'`

**Hash chain bootstrap:**
- Row 0 seed: `prev_hash = SHA256("tenet0-decision-log-v1" || sha256_of_constitution_v1_md)`
- Recorded in migration `050_006_decision_log.sql` as a fixed initial INSERT

**Hash chain serialization:** writes use `SELECT ... FOR UPDATE` on a sentinel row in `president.decision_log_chain_state` to guarantee monotonic chain even under concurrent writers.

**Self-audit (NFR-3):** every 15 minutes, audit-self-checker validates a random 1,000-row sample; nightly full chain validation. Failures raise `secops.violation.audit_corruption`.

---

## Table: `president.director_memory`

Per-Director namespaced persistent memory (FR-11, FR-13, FR-14, FR-15, FR-16, FR-17, EC-4, EC-5, EC-9).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | Memory entry ID |
| `department` | TEXT | NOT NULL CHECK (department ~ '^[a-z][a-z0-9_]+$') | Director namespace |
| `memory_type` | TEXT | NOT NULL CHECK (memory_type IN ('charter','decision','pattern','state','reference')) | Taxonomy |
| `name` | TEXT | NOT NULL | Short slug for retrieval |
| `description` | TEXT | NULL CHECK (length(description) <= 200) | One-line summary for index |
| `body` | TEXT | NOT NULL CHECK (length(body) <= 10000) | Memory content |
| `source_event_id` | UUID | NULL | Causality: bus event that triggered this memory |
| `superseded_by` | UUID | NULL REFERENCES president.director_memory(id) | Soft-delete via supersedes |
| `visible_to` | TEXT[] | NULL DEFAULT NULL | OQ-3: cross-namespace visibility allowlist |
| `constitution_version` | TEXT | NOT NULL | OQ-2: constitution version at write time |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | Insert time |

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE (`department`, `memory_type`, `name`) WHERE `superseded_by IS NULL` — only one active entry per (dept, type, name)
- INDEX (`department`, `created_at` DESC) — per-Director recent reads
- INDEX (`memory_type`, `department`) — type-scoped scans
- GIN INDEX on `to_tsvector('english', body || ' ' || coalesce(description,''))` — full-text `search_memory`
- INDEX (`source_event_id`) — causality traversal
- PARTIAL INDEX on `(department, created_at)` WHERE `memory_type = 'state' AND superseded_by IS NULL` — 30-day expiry sweep (CL-3)

**Append-only enforcement:**
- `president_app` role: `INSERT, SELECT, UPDATE (superseded_by) ONLY` (DELETE/TRUNCATE revoked)
- `BEFORE UPDATE` trigger enforces only `superseded_by` may be modified, and only from NULL → UUID (cannot be cleared, cannot re-pointed)
- `BEFORE DELETE OR TRUNCATE` trigger raises exception

**Pre-write scrubber (FR-15, security §5):** `tenet0-director-memory-mcp.write_memory` runs the 7-layer scrubber (Unicode NFKC normalize → encoding decode → 5 pattern checks → high-entropy check) before INSERT. Failures publish `secops.violation.memory_pii { department, pattern_category }` — never the actual content.

**Access matrix enforcement (FR-13, FR-14):** every read or write checks the calling Director's namespace against the matrix loaded from `constitution-rules.yaml` at MCP startup. Violations publish `secops.violation.memory_access` and audit-log the attempt.

**State expiry (CL-3):** a maintenance task runs daily, marking `state`-type memories as superseded if their `created_at` is older than 30 days AND no newer (non-superseded) row exists for the same (`department`, `memory_type`, `name`). Charter / decision / pattern / reference persist indefinitely.

**Caps (CL-3, FR-17):** before INSERT, count active (non-superseded) entries for the calling Director:
- ≥1,000: publish `president.memory.cap_warned` (warning, allow write)
- ≥5,000: reject write with `MEMORY_CAP_EXCEEDED`; publish `president.memory.cap_rejected`

---

## Table: `president.director_memory_index`

Per-Director MEMORY.md-shaped index (FR-12). Rebuilt inside the same transaction as memory writes so freshly-spawned Directors see consistent state.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `department` | TEXT | PRIMARY KEY | Director namespace |
| `index_md` | TEXT | NOT NULL | The MEMORY.md text |
| `version` | INT | NOT NULL DEFAULT 1 | Bumped on every rebuild |
| `entry_count_active` | INT | NOT NULL DEFAULT 0 | Active (non-superseded) entries |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | Last rebuild |

**Trigger:** AFTER INSERT OR UPDATE on `director_memory` triggers a debounced rebuild (5-second coalesce per department to absorb burst writes).

---

## Table: `president.director_registry`

Roster of registered Directors (FR-22, US-9). Populated from `*.lifecycle.registered` / `*.lifecycle.deregistered` events.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `department` | TEXT | PRIMARY KEY CHECK (department ~ '^[a-z][a-z0-9_]+$') | Director namespace |
| `markdown_path` | TEXT | NOT NULL | Absolute path to the Director's `.md` file |
| `file_hash` | TEXT | NOT NULL | SHA256 of the markdown file at registration |
| `version` | TEXT | NOT NULL | Director-declared semver |
| `mcp_grants` | TEXT[] | NOT NULL | List of MCP servers the Director may call |
| `bus_namespace` | TEXT | NOT NULL CHECK (bus_namespace = department) | Director's bus namespace prefix (FR-23) |
| `registered_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | First registration time |
| `deregistered_at` | TIMESTAMPTZ | NULL | Set on `*.lifecycle.deregistered` |
| `last_lifecycle_event_id` | UUID | NOT NULL | Most recent lifecycle bus event ID |
| `operator_signature` | BYTEA | NULL | Required for reserved namespaces (`president`, `secops`) |

**Indexes:**
- PRIMARY KEY (`department`)
- INDEX (`deregistered_at`) WHERE `deregistered_at IS NULL` — active-Director scan (healthcheck-poller's source)

**Conflict handling (EC-12, security T6):** lifecycle daemon takes `flock` on `~/.claude-agent-zero/agents/.lifecycle.lock` before scanning. Two markdown files claiming the same namespace → `secops.violation.registry_conflict` raised; both quarantined (no dispatch) until operator resolves.

---

## Table: `president.mcp_liveness`

Current per-Director per-MCP healthcheck state (FR-18, US-6). Holds **state**, not history.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `department` | TEXT | NOT NULL REFERENCES president.director_registry(department) ON DELETE CASCADE | Director |
| `mcp_name` | TEXT | NOT NULL | MCP server name |
| `state` | TEXT | NOT NULL CHECK (state IN ('unknown','healthy','degraded','recovered')) | Current state |
| `consecutive_failures` | INT | NOT NULL DEFAULT 0 | Failure counter |
| `last_poll_at` | TIMESTAMPTZ | NULL | Most recent probe |
| `last_success_at` | TIMESTAMPTZ | NULL | Most recent successful probe |
| `last_state_change_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | Transition timestamp |
| PRIMARY KEY | | (department, mcp_name) | |

**Indexes:**
- PRIMARY KEY (`department`, `mcp_name`)
- INDEX (`state`, `last_state_change_at`) WHERE `state IN ('degraded','unknown')` — operator query

**Lifecycle:** UPSERT on every state transition (NOT every poll, per FR-18). Restart recovery loads this table to reconstruct in-memory state machines.

**Reactive update (FR-19):** when Zero detects a Director's MCP failure mid-spawn, Zero publishes `*.lifecycle.degraded` AND updates this table directly via `mcp_liveness` MCP tool, so the next poll cycle doesn't reverse the state.

---

## Table: `president.lifecycle_events`

Local mirror of President lifecycle transitions (FR-14, EC-2). Used when bus is unreachable at the time of the event.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | Row ID |
| `event_type` | TEXT | NOT NULL | e.g. `president.lifecycle.restarted`, `president.llm.unavailable` |
| `details` | JSONB | NOT NULL DEFAULT '{}'::jsonb | Free-form context |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | Transition time |
| `published_to_bus_at` | TIMESTAMPTZ | NULL | NULL if bus was unreachable; populated on first successful publish |

**Indexes:**
- PRIMARY KEY (`id`)
- INDEX (`created_at` DESC)
- INDEX (`published_to_bus_at`) WHERE `published_to_bus_at IS NULL` — bus-recovery flush queue

**Append-only enforcement:** `president_app` role: `INSERT, UPDATE (published_to_bus_at), SELECT` only.

---

## Table: `president.operator_nonces`

Replay-defense for operator decisions (security T8, FR-25).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `nonce` | TEXT | PRIMARY KEY | Random nonce returned in original notification |
| `approval_id` | UUID | NOT NULL REFERENCES president.pending_approvals(id) | Which approval |
| `issued_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | Generation time |
| `consumed_at` | TIMESTAMPTZ | NULL | When used (set on first valid POST) |
| `consumed_decision` | TEXT | NULL | Decision recorded; replay returns this |
| `expires_at` | TIMESTAMPTZ | NOT NULL | issued_at + 24h |

**Indexes:**
- PRIMARY KEY (`nonce`)
- INDEX (`expires_at`) — TTL sweep
- INDEX (`approval_id`) — operator-may-have-multiple-pending lookup

**TTL sweep:** maintenance task deletes rows where `expires_at < now()`. Idempotency: a `POST /decide` with previously-consumed nonce returns the cached `consumed_decision` with HTTP 200 + `Idempotent-Replay: true` header.

---

## Table: `president.bus_watcher_state`

Single-row table tracking the `tenet0-bus-watcher` daemon's LISTEN/NOTIFY cursor.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INT | PRIMARY KEY DEFAULT 1 CHECK (id = 1) | Single-row constraint |
| `last_acked_event_id` | UUID | NULL | Cursor: last bus event successfully forwarded to comm-module |
| `last_acked_at` | TIMESTAMPTZ | NULL | Cursor timestamp |
| `notifier_mode` | TEXT | NOT NULL DEFAULT 'comm-module' CHECK (notifier_mode IN ('comm-module','polling')) | Active OperatorNotifier |
| `last_mode_change_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | When mode last switched |

**Lifecycle:** populated on first run; updated atomically per successful forward. Crash recovery reads `last_acked_event_id` and resumes from the next event.

---

## Table: `president.governor_ledger`

Token-equivalent measurements per Director spawn (NFR-7, OQ-5).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY DEFAULT gen_random_uuid() | Row ID |
| `director` | TEXT | NOT NULL | Director namespace |
| `event_id` | UUID | NOT NULL | Bus event being decided |
| `tokens_in` | INT | NOT NULL DEFAULT 0 | Estimated input tokens |
| `tokens_out` | INT | NOT NULL DEFAULT 0 | Estimated output tokens |
| `wall_clock_ms` | INT | NOT NULL | Spawn-to-completion latency |
| `mode` | TEXT | NOT NULL CHECK (mode IN ('rule','llm')) | Decision path |
| `recorded_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | Insert time |

**Indexes:**
- PRIMARY KEY (`id`)
- INDEX (`director`, `recorded_at` DESC) — per-Director usage queries
- INDEX (`recorded_at` DESC) — capacity-planning queries

**Note:** measurement-only. **No per-token billing** (NFR-7). Used for capacity modeling, spawn-overhead detection, future Director rate-budget design.

---

## Migration Files

```
tenet-0/internal/store/migrations/
  050_001_roles.sql                      # Postgres roles + president schema
  050_002_pending_approvals.sql
  050_003_decision_log.sql               # incl. append-only trigger + hash chain seed + chain_state sentinel
  050_004_director_memory.sql            # incl. append-only trigger + scrubber-result columns
  050_005_director_memory_index.sql      # incl. AFTER trigger for debounced rebuild
  050_006_director_registry.sql
  050_007_mcp_liveness.sql
  050_008_lifecycle_events.sql
  050_009_operator_nonces.sql
  050_010_bus_watcher_state.sql
  050_011_governor_ledger.sql
  050_012_state_expiry_task.sql          # daily maintenance for 30-day state-type expiry
```

Run via existing `tenet-0/db/migrate.sh` with goose. Migrations are idempotent and roll-forward only.

---

## Constitution Updates

`tenet-0/shared/constitution-rules.yaml` gets two new top-level sections:

```yaml
memory_access_matrix:
  president:
    write: [president]
    read:  [president, ops, tech, finance, s_m, support, secops]
  ops:        { write: [ops],     read: [ops] }
  tech:       { write: [tech],    read: [tech] }
  finance:    { write: [finance], read: [finance] }
  s_m:        { write: [s_m],     read: [s_m] }
  support:    { write: [support], read: [support] }
  secops:
    write: [secops]
    read:  [president, ops, tech, finance, s_m, support, secops]

memory_scrubber:
  version: 1
  layers:
    - { name: unicode_normalize, enabled: true }
    - { name: encoding_decode,   enabled: true, decoders: [base64, rot13, hex] }
    - { name: customer_email,    enabled: true, allowlist: [] }
    - { name: credit_card,       enabled: true, require_context_word: true }
    - { name: anthropic_credential, enabled: true }
    - { name: conversation_transcript, enabled: true, speaker_labels: [Customer, Tenant, User, Client] }
    - { name: high_entropy,      enabled: true, threshold_bits_per_char: 4.5, min_length: 64 }
```

`tenet-0/shared/constitution.md` gets a new section explaining the President-Director-Memory model, Data Sacred boundary on memory, and the amendment process for the matrix.

---

## Relationships

```
director_registry (1) ─── (N) mcp_liveness
                                  │
                                  │ (in-memory state machine; this table holds restart-recoverable state)

pending_approvals ────publishes────► (bus event in bus.events) ────causality────► decision_log
                                                                                       │
                                                                                       │ (cross-checked by NFR-3 self-audit)

director_memory (per-dept partition logical) ────indexed-by────► director_memory_index (per-dept)
                                                                  │
                                                                  │ (loaded on Director spawn)

operator_nonces ────keyed-to────► pending_approvals
                                       │
                                       │ (Ed25519-signed POST consumes nonce, updates outcome, inserts decision_log row, publishes outcome event)

lifecycle_events ────buffer-then-publish────► (bus events in bus.events)

bus_watcher_state (single row) ────cursor-for────► tenet0-bus-watcher daemon

governor_ledger ────measurement-only────► capacity reports (no billing)
```

---

## Storage Estimates (single-operator MVP scale)

| Table | Daily volume | 30-day retention size |
|---|---|---|
| `pending_approvals` | ~50 rows | ~1.5 MB |
| `decision_log` | ~5,000 rows | ~300 MB indefinite |
| `director_memory` | ~100 rows (across all Directors) | bounded by 5k cap × 2KB ≈ 10 MB indefinite |
| `director_memory_index` | small per-dept text blobs | <100 KB |
| `director_registry` | ~10 rows lifetime | trivial |
| `mcp_liveness` | ~50 rows (Director × MCP cells) | trivial |
| `lifecycle_events` | ~10 rows | ~150 KB indefinite |
| `operator_nonces` | ~50 rows (24h TTL) | ~250 KB |
| `bus_watcher_state` | 1 row | trivial |
| `governor_ledger` | ~5,000 rows | ~250 MB indefinite |

Total under 1 GB per month. Safe inside `tenet0-postgres` for years.

---

## References

- Spec: `.specify/specs/50-tenet0-director-runtime/spec.md` — FR-7, FR-9–17, FR-22, FR-25, NFR-3, NFR-5, NFR-6, NFR-9, EC-2, EC-4, EC-5, EC-9, EC-12
- Sibling Feature 49: `.specify/specs/49-event-bus-constitution-governor/spec.md` — FR-2a credentials, NFR-4 audit log integrity
- Research decisions: `.specify/specs/50-tenet0-director-runtime/research.md`
- Security strategy integrated above (Postgres roles, hash chain, scrubber, operator nonces)
- Existing Feature 49 migrations: `tenet-0/db/migrations/`
