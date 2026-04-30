# Cross-Artifact Analysis Report — Feature 13

**Date:** 2026-04-30
**Branch:** 13-platform-knowledge-intelligence
**Artifacts analyzed:** constitution.md, spec.md, plan.md, tasks.md, data-model.md,
research.md, contracts/mcp-tools.yaml (7 files)

---

## Summary

| Check | Result |
|-------|--------|
| Constitutional compliance | ✅ Compliant |
| Spec → Plan alignment | ✅ All FRs and NFRs addressed (1 clarified gap) |
| Plan → Tasks coverage | ✅ Complete |
| Data model consistency | ✅ Complete |
| API contract coverage | ✅ Fixed during analysis (get_database added) |
| Cross-artifact naming | ✅ Consistent |
| Completeness audit | ✅ All required artifacts present |
| **Ready for implementation** | **✅ Yes** |

**Issues found:** 4
**Fixed inline:** 3 (Medium × 1, Low × 2)
**Observation noted:** 1 (no action required)

---

## Constitutional Compliance

### Principle 1 — Data Sacred
**Status:** ✅ Compliant

Plan explicitly bans secrets from the fact store. Docker collector acceptance criteria
state: "No environment variable values extracted from container inspect." Postgres collector
reads `information_schema` and `pg_stat_user_tables` only — no row data. Security review
gate (Task 3.11) enforces this at code level before production deployment.

### Principle 2 — Security
**Status:** ✅ Compliant

Read-only Postgres credentials, read-only nginx volume mount, SQLite on named volume,
socket proxy over socket mount. Security review task (3.11) is a mandatory quality gate
blocking Phase 4/5. SQL injection: all SQLite queries use `better-sqlite3` prepared
statements (parameterized); plan explicitly specifies this.

### Principle 3 — Ops Agent Acts / Owner Decides
**Status:** ✅ Compliant

No auto-remediation anywhere in the plan. Hermes receives confidence-weighted facts and
reports. Fact staleness is surfaced as information, not acted on automatically. Out-of-scope
list explicitly excludes "automatic remediation."

### Principle 4 — Simple Over Clever
**Status:** ✅ Compliant

HRR explicitly out of scope. Three new production dependencies only (better-sqlite3,
dockerode, node-cron) — each with a single clear responsibility. No new containers.
PostgreSQL native FTS over pgvector. SQLite FTS5 over external search service.

### Principle 7 — Owner's Time
**Status:** ✅ Compliant

Fully automated collection on a cron schedule. Hermes health picture in ≤ 2 MCP calls.
No manual fact curation required after initial YAML bootstrap.

### Test-First Imperative (Constitution Part III)
**Status:** ✅ Compliant

Every implementation task in tasks.md is blocked by a test task. RED step explicitly
specified ("All tests FAIL before implementation" in each test task). 80% coverage
target inherited from constitution.

### Scope note — Constitution applicability
**Status:** ✅ Observation, no action needed

The constitution governs the overnightdesk Next.js frontend. overnightdesk-ops is a
separate service on aegis-prod. The stack constraints (Drizzle, Next.js, Better Auth,
Neon, Vercel) in Principle 4 do not apply to the ops service. All constitutional
*principles* (data sacred, security, TDD, simplicity, owner's time) apply directly
and are honored. The plan correctly ignores stack-specific pillars while following principles.

---

## Spec → Plan Alignment

### FR-1 (Fact store as single source of truth)
**Status:** ✅ Addressed with clarification

Plan Phase 3 migrates `get_service`, `get_database`, and `search` to read from the fact
store with YAML fallback for the empty-store case (EC-6).

**Clarified gap** (fixed in plan.md): `get_dependencies` was not addressed. The function
reads service-to-service topology from `network.yaml` — gRPC, internal RPC, job dispatch.
This topology is not auto-discoverable by any of the four collectors. An intentional
exception note is now documented in plan.md Section 3.2 under FR-11's "where applicable"
clause. This is correct: you can't discover that securityteam calls commmodule over gRPC
by inspecting Docker container metadata.

### FR-2 through FR-12
**Status:** ✅ All addressed

| FR | Plan Coverage |
|----|--------------|
| FR-2 | Phase 2: four collectors (Docker, Postgres, nginx, audit DB) |
| FR-3 | Data model: full fact schema with confidence derivation |
| FR-4 | Phase 2: node-cron scheduler + trigger_collection tool |
| FR-5 | Phase 2: UPSERT logic + markStale function |
| FR-6 | Phase 3: FTS5 search with BM25 ranking |
| FR-7 | Phase 3: get_health_summary tool |
| FR-8 | Phase 3/4: find_similar_incidents + migration 010 |
| FR-9 | Data model: collection_runs table; Phase 2 engine |
| FR-10 | Phase 5: web UI confidence column + run history |
| FR-11 | Phase 3: backward compat; YAML fallback |
| FR-12 | Task 1.3: named volume ops-facts-data |

### Non-Functional Requirements
**Status:** ✅ All addressed

| NFR | Plan Coverage |
|-----|--------------|
| < 500ms health summary | Task 3.3 AC includes performance assertion |
| < 300ms search | Plan performance strategy; FTS5 benchmarks cited |
| < 60s collection | Per-source 10s timeout; Promise.allSettled parallelism |
| Partial failure resilience | Collection engine: allSettled + run log |
| No secrets in facts | Security section + Task 3.11 gate |
| Named volume persistence | Task 1.3 |
| Manual trigger | trigger_collection tool |

### Edge Cases
**Status:** ✅ All 6 addressed

EC-1 (source unreachable) → collection engine allSettled + partial status
EC-2 (first run) → YAML bootstrap + confidence=low
EC-3 (value changes) → upsert updates value + increments count
EC-4 (concurrent cycles) → isCollecting mutex flag
EC-5 (scale limits) → POSTGRES_TABLE_LIMIT (now documented in research.md)
EC-6 (store corruption) → YAML fallback + immediate startup cycle

---

## Plan → Tasks Coverage

All 5 plan phases are fully covered. Every plan section maps to at least one test/implement
task pair. No plan components without tasks.

| Plan Component | Tasks |
|----------------|-------|
| Fact store + FTS5 schema | 1.1, 1.2 |
| Docker Compose changes | 1.3 |
| Docker collector | 2.1, 2.2 |
| nginx collector | 2.3, 2.4 |
| Postgres collector | 2.5, 2.6 |
| Audit collector | 2.7, 2.8 |
| Collection engine + scheduler | 2.9, 2.10 |
| search tool (FTS5) | 3.1, 3.2 |
| get_health_summary | 3.3, 3.4 |
| trigger_collection + get_collection_status | 3.5, 3.6 |
| find_similar_incidents | 3.7, 3.8 |
| get_service + get_database updates | 3.9, 3.10 |
| Security review gate | 3.11 |
| Migration 010 (write) | 4.1 |
| Migration 010 (apply) | 4.2 |
| Web UI updates | 5.1, 5.2 |
| Final acceptance verification | QG-2 |

---

## Data Model Consistency

### Fact schema
**Status:** ✅ Consistent

data-model.md schema matches: plan references, task acceptance criteria, contract
response shapes. Confidence tiers (high/medium/low/stale) consistent across all four
artifacts. UNIQUE constraint `(domain, subject, key)` drives UPSERT in plan and is
referenced correctly in tasks.

### collection_runs schema
**Status:** ✅ Consistent

`sources_attempted`, `sources_failed`, `errors` as JSON text columns matches the
get_collection_status contract response shape (`sources_failed: string[]`).
Task 3.6 correctly notes: "parse sources_failed and errors JSON columns before returning."

### Posture thresholds
**Status:** ✅ Consistent

Plan: `stale_count > 10%` / Tasks 3.3/3.4: `stale_count >= 10%`
Functionally equivalent boundary (resolved at implementation as `>= 10`).

### Migration 010 (PostgreSQL)
**Status:** ✅ Consistent

`GENERATED ALWAYS AS ... STORED` column eliminates trigger maintenance.
Weight assignment (A=symptom, B=root_cause, C=learning, D=fix_applied) consistent
between data-model.md and plan.md migration block.

---

## API Contract Validation

### Issues found and fixed

**Medium — `get_database` contract missing (fixed)**

The api-architect was briefed to design 4 new + 2 updated tools (search, get_service).
`get_database` also receives the `include_confidence` optional input per plan Section 3.2
and tasks 3.9/3.10. The contract was absent.

**Fix applied:** `get_database` contract added to `contracts/mcp-tools.yaml` with the
same pattern as `get_service` — optional `include_confidence` boolean, same confidence
field extensions, backward-compatible.

### Contract completeness post-fix

| Tool | Contract Status |
|------|----------------|
| get_health_summary | ✅ New — defined |
| find_similar_incidents | ✅ New — defined |
| trigger_collection | ✅ New — defined |
| get_collection_status | ✅ New — defined |
| search | ✅ Updated — backward-compat extensions |
| get_service | ✅ Updated — include_confidence |
| get_database | ✅ Updated — include_confidence (added during analysis) |
| get_dependencies | ✅ Unchanged — reads YAML; no contract change needed |
| list_open_findings, query_learnings, log_incident, acknowledge_finding, get_latest_audit_run, get_platform_fr_status, trigger_platform_snapshot, get_platform_snapshot_events | ✅ Unchanged |

---

## Cross-Artifact Naming

**Status:** ✅ Consistent

| Term | Usage |
|------|-------|
| `confidence` | Consistent: spec, plan, data-model, tasks, contracts all use same enum: high/medium/low/stale |
| `domain` | Consistent: service/database/network/finding across all artifacts |
| `source` | Consistent: docker/postgres/nginx/audit-db/yaml-seed across all artifacts |
| `collection_run` | Consistent: plan, data-model, tasks, contracts all use this term |
| `stale` | Consistent: boolean column `is_stale` in DB; exposed as confidence level `stale` in API |
| `posture` | Consistent: healthy/degraded/stale in plan, tasks, and contract |

---

## Fixes Applied During Analysis

| Issue | Severity | Fix |
|-------|----------|-----|
| `get_database` contract missing from mcp-tools.yaml | Medium | Added `get_database` tool entry to contracts file |
| `POSTGRES_TABLE_LIMIT` and 4 other env vars undocumented in research.md | Low | Added env vars table to research.md Dependency Summary |
| Task 4.1 missing engine repo commit step | Low | Added AC: "File committed to overnightdesk-engine repo" |
| `get_dependencies` YAML exception undocumented | Medium | Added intentional-exception note to plan.md Section 3.2 |

---

## Completeness Audit

### Required artifacts
- [x] `.specify/memory/constitution.md`
- [x] `spec.md` — complete, all sections present
- [x] `plan.md` — complete, all phases and security/performance/deployment sections present
- [x] `tasks.md` — 28 tasks, TDD enforced, quality gates present
- [x] `data-model.md` — SQLite schema, Postgres migration, fact domain table
- [x] `contracts/mcp-tools.yaml` — 7 tool contracts (4 new, 3 updated)
- [x] `research.md` — 8 technology decisions documented with rationale and tradeoffs

### Optional artifacts
- [x] `research.md` ✅
- [ ] Architecture diagram — not required; ASCII diagram in plan.md is sufficient at this scale

---

## Ready for Implementation

All critical and high issues resolved. Clean to proceed to `/speckit-implement`.

**Recommended implementation order:**
1. Task 4.1 first (write migration, no dependencies, engine repo commit)
2. Tasks 1.1 → 1.2 → 1.3 (foundation)
3. Tasks 2.1–2.8 in parallel (collectors)
4. Tasks 2.9 → 2.10 (engine)
5. Tasks 3.1–3.10 in parallel pairs, then 3.11
6. Task 4.2 (apply migration)
7. Tasks 5.1 → 5.2 → QG-2
