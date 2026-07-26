# Data Model: Internal Workspace and Orchestrator Retirement

## Internal workspace

| Field | Meaning | Constraint |
| --- | --- | --- |
| hostname | Authenticated workspace entry point | Must resolve to one approved workspace |
| use case | Business purpose | Must be explicit |
| runtime | Named serving runtime | Must not be selected from user-controlled data |
| members | Exact authenticated people | Separate identity per person |

## Workspace membership

| Field | Meaning | Constraint |
| --- | --- | --- |
| person identity | Better Auth subject/account | Unique and authenticated |
| use-case ID | Exact business boundary | Must be active |
| runtime ID | Exact named runtime | Must be active and unambiguous |
| role/status | Authorization and lifecycle | Independently revocable |
| validity | Start/expiry state | Fail closed when absent or expired |

Gary and Austin are separate membership rows for the same Titus use-case and
runtime. Neither row implies access to Walter, Mitchel, or another workspace.

## Retired component

| Field | Meaning | Constraint |
| --- | --- | --- |
| name | Container/service identity | Exact deployed name |
| retired at | Activation timestamp | UTC |
| prior restart policy | Rollback input | Captured before mutation |
| image identifier | Rollback input | Value only; no registry credentials |
| state | Retained/stopped/cleaned | `cleaned` requires separate approval |
| observation end | Earliest cleanup review | 14 days after activation |

## Preserved incident

| Field | Meaning | Constraint |
| --- | --- | --- |
| id | Original incident identifier | Immutable |
| service | Affected service | Non-secret |
| symptom | Observed behavior | No payload or credential values |
| root cause | Confirmed cause | Nullable |
| fix applied | Historical correction | Nullable |
| learning | Reusable operational lesson | Nullable |
| severity | Original severity | Preserved |
| occurred at | Original event time | UTC |

## Retirement evidence bundle

The bundle contains:

- database dump and checksum;
- sanitized incident export and checksum;
- source/live Compose and Nginx configuration;
- container/image/volume inventory and restart policies;
- preflight and post-activation validation output;
- exact rollback procedure.

The bundle never contains Phase tokens, database passwords, bearer tokens,
private keys, cookies, or full container environments.
