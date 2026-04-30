# Feature 13: Platform Knowledge Intelligence

**Status:** Draft
**Created:** 2026-04-30
**Feature Branch:** 13-platform-knowledge-intelligence
**Scope:** overnightdesk-ops service (aegis-prod)

---

## Overview

The OvernightDesk platform runs a growing set of services on aegis-prod. Today, platform knowledge
is split across hand-edited YAML files, two separate PostgreSQL databases, live Docker state, and
nginx configuration. Hermes (the platform ops agent) must assemble this picture from multiple
disconnected sources on every query, and searches return unranked substring matches against
serialized YAML.

This feature transforms overnightdesk-ops into an **automated, self-maintaining platform
intelligence layer**: a single fact store that is continuously populated from live infrastructure,
ranked by how recently and how often each fact was confirmed, and queryable through a set of
high-signal MCP tools that Hermes can call to get the full platform picture in one round-trip.

**The goal:** Hermes should be able to open a conversation, call one or two MCP tools, and have an
accurate, confidence-weighted picture of platform health — without manually querying Docker,
Postgres, or nginx separately.

---

## User Stories

### User Story 1: Automated Fact Collection

**As** the platform ops agent (Hermes)
**I want** platform facts to be discovered automatically from live infrastructure on a schedule
**So that** I never have to query Docker, Postgres, or nginx directly to know what is running

**Acceptance Criteria:**
- [ ] Facts about running containers (name, image, status, ports, restart policy, network) are
      discovered and stored without human intervention
- [ ] Facts about database instances (host, tables, row counts, schema drift) are discovered
      and stored without human intervention
- [ ] Facts about nginx routing (paths, upstreams, auth rules, live/pending status) are
      discovered and stored without human intervention
- [ ] Fact collection runs on a schedule with no manual trigger required
- [ ] A fact that existed in the previous collection cycle but is absent in the current one is
      marked stale rather than deleted

**Priority:** High

---

### User Story 2: Trust-Weighted Knowledge

**As** the platform ops agent (Hermes)
**I want** every fact to carry a confidence score based on how many times it has been observed
and how recently it was last confirmed
**So that** I know which facts I can act on autonomously and which I should flag for human review

**Acceptance Criteria:**
- [ ] Every fact has a confidence score derived from observation count and time since last confirmation
- [ ] A fact confirmed in every collection run for 30+ days has a higher confidence rating than one
      seen once last week
- [ ] Facts not confirmed in the most recent collection cycle are marked with a stale indicator
- [ ] The confidence level is returned alongside the fact in all query results
- [ ] Hermes can filter query results to only high-confidence facts when taking autonomous action

**Priority:** High

---

### User Story 3: Unified Full-Text Search

**As** the platform ops agent (Hermes)
**I want** to search all platform knowledge — services, databases, routes, findings, past incidents —
with a single query that returns ranked, relevant results
**So that** I can answer "what do we know about nginx?" in one call rather than five

**Acceptance Criteria:**
- [ ] A single search call queries across all knowledge domains: services, databases, network,
      audit findings, and past incidents
- [ ] Results are ranked by relevance, not returned as unordered lists
- [ ] Partial-word and phrase searches return correct results
      (e.g. "postgres" matches "platform-orchestrator-db")
- [ ] Results include the source domain (service / database / finding / incident) and confidence level
- [ ] Searches with no matches return a clear empty result, not an error

**Priority:** High

---

### User Story 4: Platform Health Summary

**As** the platform ops agent (Hermes)
**I want** a single MCP call that returns a trust-weighted health digest of the entire platform
**So that** I can open any conversation with an accurate situational picture in under a second

**Acceptance Criteria:**
- [ ] The health summary includes: container count and status breakdown, stale fact count,
      open critical/high findings count, and most recent incident date
- [ ] The summary distinguishes between high-confidence facts (observed repeatedly) and
      low-confidence facts (observed once or not recently confirmed)
- [ ] The summary flags any service whose facts have gone stale since the last collection
- [ ] The summary is returned in a format Hermes can read and reason about directly
- [ ] The summary reflects the state as of the most recent completed collection cycle

**Priority:** High

---

### User Story 5: Semantic Incident Recall

**As** the platform ops agent (Hermes)
**I want** to search past incidents using natural language descriptions of what I am observing
**So that** before I touch production I can surface relevant past failures and their fixes

**Acceptance Criteria:**
- [ ] A symptom description (e.g. "container not starting after restart") returns past incidents
      whose recorded symptoms are semantically similar, not just keyword-matching
- [ ] Results include the recorded root cause, fix applied, and learning from past incidents
- [ ] Results are ordered by relevance to the query
- [ ] An empty result set is returned clearly when no relevant incidents exist
- [ ] The search operates on the `symptom`, `root_cause`, and `learning` fields of past incidents

**Priority:** Medium

---

### User Story 6: Fact Lineage Visibility

**As** Gary (platform owner)
**I want** to see where any given fact came from, how many times it has been observed, and when
it was last confirmed
**So that** I can trust automated decisions Hermes makes based on platform facts

**Acceptance Criteria:**
- [ ] Every fact in the store includes: source (Docker / Postgres / nginx / audit), first observed
      date, last confirmed date, and observation count
- [ ] The ops web UI displays fact lineage information alongside each fact
- [ ] Stale facts are visually distinguished from current facts in the web UI
- [ ] Facts can be filtered in the web UI by source, confidence level, or domain

**Priority:** Medium

---

### User Story 7: Collection Cycle Visibility

**As** Gary (platform owner)
**I want** to see when the last collection cycle ran, how many facts were updated, and whether
any errors occurred during collection
**So that** I know whether the knowledge base is fresh or degraded

**Acceptance Criteria:**
- [ ] Each collection cycle produces a run record: start time, end time, facts created,
      facts updated, facts marked stale, errors encountered
- [ ] The ops web UI shows the most recent collection run status prominently
- [ ] If a collection cycle fails or partially fails, the error is recorded and visible
- [ ] Hermes can query collection run history via an MCP tool

**Priority:** Medium

---

## Functional Requirements

**FR-1:** The fact store is the single source of truth for all platform knowledge. Queries for
service, database, network, and routing information resolve through the fact store, not directly
from YAML files or live infrastructure calls.

**FR-2:** Facts are collected from all of the following live infrastructure sources:
- Running containers (name, image, status, ports, restart policy, network membership, volume mounts)
- Postgres instances accessible to the ops service (database names, table names, approximate row counts)
- nginx route configuration (path patterns, upstream targets, auth requirements, active status)
- Audit findings from the COO audit database (check ID, severity, subject, status, first/last seen)

**FR-3:** Each fact is stored with: domain, subject, key, value, source, observation count, first
observed timestamp, last confirmed timestamp, and a derived confidence level (high / medium / low /
stale).

**FR-4:** Collection runs on an automated schedule. The interval is configurable via environment
variable. Manual trigger is available via MCP tool and web UI.

**FR-5:** On each collection run, a fact already in the store is updated (last confirmed, observation
count incremented) rather than duplicated. A fact not seen in the most recent run is marked stale
but not deleted.

**FR-6:** Full-text search queries the fact store across all domains in a single call. Results are
ranked by relevance. Confidence level is included in every result.

**FR-7:** A health summary tool returns a structured digest: container status breakdown, stale fact
count, open findings by severity, most recent incident, and overall confidence posture of the
knowledge base.

**FR-8:** Incident recall operates on the full text of `symptom`, `root_cause`, and `learning`
fields of past incidents. Results are ordered by relevance to the input description.

**FR-9:** Each collection run produces a run record accessible via MCP tool and visible in the
web UI.

**FR-10:** The ops web UI surfaces: fact lineage (source, observation count, confidence), stale
fact indicators, and the most recent collection run status.

**FR-11:** All existing MCP tools (`get_service`, `get_database`, `get_dependencies`, `search`,
`list_open_findings`, `query_learnings`) continue to function without breaking changes. Their
results are sourced from the fact store where applicable.

**FR-12:** The fact store persists across container restarts. Data is not lost on redeploy.

---

## Non-Functional Requirements

**Performance:**
- Health summary MCP call completes in < 500ms
- Full-text search MCP call completes in < 300ms
- Collection cycle completes in < 60 seconds for the current platform scale (~15 services,
  ~10 databases, ~50 routes)
- Fact store queries do not block collection writes

**Reliability:**
- A failure in one collection source (e.g. a Postgres instance is unreachable) does not abort
  the entire cycle — remaining sources are collected and the error is recorded in the run log
- The ops service starts and serves existing fact data even if the collection cycle has not yet
  run after a restart
- Stale facts are served with their staleness indicator rather than dropped on source failure

**Security:**
- The fact store does not record secret values, credentials, or bearer tokens — only structural
  metadata (table names, container names, port numbers, route paths)
- Database connection credentials used for schema introspection are scoped read-only
- The fact store file (if SQLite) is stored on a named, persisted volume — not the container
  ephemeral filesystem

**Operability:**
- Collection can be triggered manually via MCP tool without restarting the service
- The ops web UI requires no additional authentication beyond what the service currently provides
- Errors during collection are logged at the structured log level and visible in the run record

---

## Edge Cases & Error Handling

**EC-1: Source unreachable during collection**
A Docker socket, Postgres instance, or nginx config file is inaccessible when the collection cycle
runs. The cycle records which sources failed, collects from remaining sources, marks previously
collected facts from the failed source as unconfirmed (but not stale until a configurable number
of consecutive missed cycles), and records the partial failure in the run log.

**EC-2: First run — no existing facts**
The fact store is empty on first collection. All discovered facts are written as new with
`observation_count = 1` and `confidence = low`. The health summary returns the correct count
with a note that confidence will increase over subsequent runs.

**EC-3: Fact value changes between runs**
A container's port mapping changes between cycles. The existing fact is updated with the new value,
`last_confirmed` is refreshed, `observation_count` increments, and a change record is written to
the run log. Prior value is not retained in the main fact row but is noted in the run log.

**EC-4: Collection cycle takes longer than the scheduled interval**
The in-progress cycle completes before the next one starts. Concurrent cycles do not run. The next
scheduled run is skipped if the previous has not finished, and this is recorded in the run log.

**EC-5: Very large table / many containers**
The collection target (Postgres DB with hundreds of tables, or many containers) causes the cycle
to approach the 60-second limit. Collection truncates at a configurable per-source limit and
records how many items were skipped in the run log.

**EC-6: Fact store corruption or missing on startup**
The ops service starts with an empty fact store and schedules an immediate collection run.
Existing MCP tools that fall back to YAML continue to function during the first cycle.

---

## Out of Scope

- HRR (Holographic Reduced Representations) — deferred; fact space does not yet justify it
- Fact store replication or multi-node reads
- Automatic remediation of stale or drifted facts — Hermes observes and reports; Gary decides
- Ingesting tenant-level data (conversations, memory, jobs) — platform facts only
- Replacing the `platform_incidents` `log_incident` / `query_learnings` workflow — this feature
  enhances retrieval; write path is unchanged

---

## Success Metrics

- Hermes can produce an accurate platform health summary using ≤ 2 MCP calls
- Collection cycle runs on schedule with no manual intervention for 7 consecutive days
- Full-text search returns relevant results for all tested queries (service name, port number,
  table name, symptom keyword)
- No MCP tool breaking changes — all existing callers continue to work
- Facts from the previous manual YAML files are fully represented in the fact store after
  first collection cycle
