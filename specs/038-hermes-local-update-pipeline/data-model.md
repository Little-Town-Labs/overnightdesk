# Data Model: Local-First Hermes Update Pipeline

## Candidate Manifest

One reviewed release candidate. It is immutable input to a run.

| Field | Required | Rule |
|---|---:|---|
| `schema_version` | yes | Supported schema integer |
| `candidate_id` | yes | Stable release identifier |
| `upstream.tag` | yes | Non-empty release tag |
| `upstream.version` | yes | Hermes runtime version |
| `upstream.source_commit` | yes | Full source commit identifier |
| `upstream.oci_index` | yes | Immutable OCI reference containing a digest |
| `upstream.arm64_child` | yes | Linux ARM64 child digest |
| `derived.reference` | yes | Derived OvernightDesk image reference |
| `derived.architecture` | yes | Explicit target architecture |
| `policy.approvals_mode` | yes | Must remain `manual` |
| `policy.cron_mode` | yes | Must remain `deny` |
| `agents` | yes | Exactly Walter, Titus, and Mitchel |

## Agent Qualification Profile

One per named runtime. Profiles describe source paths and test boundaries, not
credentials.

| Field | Rule |
|---|---|
| `agent` | One of `walter`, `titus`, `mitchel` |
| `source` | Existing canonical tenant directory |
| `state.mode` | Must be `synthetic` for local runs |
| `required_paths` | Source files or directories that must exist |
| `required_stubs` | Names present in the shared stub catalog |
| `allowed_operations` | Safe read/preflight behaviors to verify |
| `denied_operations` | Outbound, privileged, or production actions to refuse |
| `production_markers` | Values that must never occur in local configuration |

## Stub Boundary

A deterministic local replacement for one external boundary.

| Field | Rule |
|---|---|
| `name` | Stable bounded label |
| `protocol` | `http`, `mcp`, `file`, or `process` |
| `endpoint` | Local-only endpoint or fixture identifier |
| `mode` | `deterministic` |
| `delivery` | Must be `disabled` for local qualification |

## Qualification Run and Report

The report is append-only output for one invocation.

```text
run_id
candidate_id
mode: source | runtime
host_architecture
started_at / finished_at
gates[]
agents[]
cleanup
overall_status: passed | failed | not_run
promotion: blocked | eligible_for_aegis_staging
```

Each gate includes `name`, `status`, `duration_ms`, and a safe `reason_code`.
Agent results include exactly one entry for every named runtime, even when a
profile fails or a runtime gate is unavailable.

## State Transitions

```text
manifest-invalid → failed
manifest-valid → source-running
source-running → source-passed | failed
source-passed → runtime-running | runtime-not-run
runtime-running → runtime-passed | failed
source/runtime-passed → eligible-for-aegis-staging
any-failure → blocked
```
