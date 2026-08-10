# Data Model: Retired Orchestrator Cleanup

## Cleanup manifest

| Field | Meaning |
|---|---|
| `approved_by` | Accountable owner approval source |
| `observation_ended_at` | Required end timestamp `2026-08-09T01:33:03Z` |
| `evidence_directory` | Protected evidence bundle consumed for verification |
| `container_targets` | Exact three stopped container names |
| `volume_targets` | Exact two exclusive volume names |
| `image_targets` | Exact image references with no active consumers |
| `scheduler_targets` | Reminder units and retired heartbeat identifiers |
| `runtime_path_targets` | Exact stale production paths |
| `retained_boundaries` | Deny vhost, incident catalog, and durable records |
| `result` | Secret-free deletion and verification outcome |

## Retained boundaries

- **Retired-host deny boundary**: explicit HTTP 404 and TLS handshake rejection
  for `orchestrator.overnightdesk.com`.
- **Incident knowledge boundary**: three sanitized records in the platform
  standard catalog, served through static Ops search.
- **Cleanup record boundary**: the Feature 038 spec, platform-standard runbook
  and ADR, and deployment ledger entry.

## State transitions

```text
retained-and-observed
  -> preflight-verified
  -> cleanup-in-progress
  -> cleaned-and-verified
```

There is no automatic rollback transition after `cleaned-and-verified`; any
restoration requires a new owner-approved feature and fresh qualification.
