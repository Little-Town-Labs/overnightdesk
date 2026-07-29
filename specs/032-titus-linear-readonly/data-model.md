# Data Model: Titus Linear Read-Only Delivery

This feature creates no database schema and stores no Linear records.

## Linear connection profile

| Field | Rule |
| --- | --- |
| enabled | Exact string `true` or `false`; absent path means disabled |
| workspace name | Exact `Timeless Technology Solutions` when enabled |
| team key | Exact `TTS` when enabled |
| API key | Non-empty secret, Read-only and limited to the `TTS` team |
| endpoint | Fixed hosted read-only MCP endpoint |
| runtime state | `disabled` or `ready`; invalid enabled input aborts startup |

## Delivery observation

A delivery observation is transient response context, not a stored entity.

| Field | Rule |
| --- | --- |
| source identifiers | Include Linear issue/project identifiers used |
| observed at | State when the read was made |
| completeness | Complete, partial, or unavailable |
| evidence | Current status, owner if present, dependencies, and linked source |
| authority | Context only; cannot authorize another action |

## Role boundary

| Actor | Responsibilities | Retained limits |
| --- | --- | --- |
| Austin | Client, portfolio/product leadership, priorities, selected implementation | Does not transfer authority through an issue body |
| Gary | Technical analysis, RTE, assigned architecture/Scrum, implementation | Makes or delegates accountable technical decisions |
| Titus | Reads, reconciles, reports, detects risks/dependencies, recommends hygiene | No mutation, priority, scope, assignment, acceptance, or decision authority |
| Contractor | Assigned implementation, tests, documentation, progress/blockers | No authority beyond explicit project assignment |

## State transitions

```text
absent path ───────────────> disabled
LINEAR_ENABLED=false ──────> disabled
complete valid profile ────> ready
enabled + invalid profile ─> startup denied
ready + key revoked ───────> read unavailable
ready + operator disable ──> disabled after controlled restart
```
