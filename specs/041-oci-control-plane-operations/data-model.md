# Data Model: OCI Control-Plane Operations

The MVP uses immutable JSON evidence rather than a database. Runtime types are
validated at the OCI boundary and sanitized before they cross into evidence,
grouping, or operator output.

## OCI Profile

Non-secret request configuration supplied by a root-owned host config file:

- `tenancy_ocid`
- `user_ocid`
- `fingerprint`
- `region`
- `compartment_ocid`
- `approved_instance_ocid`
- `approved_boot_volume_ocid`
- `secret_ref` (Phase app/environment/path and key name; never the value)
- `limits` (timeouts, page/item ceilings, retry ceiling)

The private key is resolved at runtime and is not a field in this entity's
serialized form.

## Run Envelope

Every command creates an in-memory run envelope and emits a sanitized terminal
record:

- `run_id`: stable-format UUID or equivalent opaque identifier
- `tool_version`
- `mode`: `fixture`, `inventory`, `group`, `preflight`, or future `apply`
- `started_at`, `completed_at`
- `source_compartment_ocid`
- `complete`: boolean; false for interruption, truncation, or validation failure
- `status`: `succeeded`, `failed`, `incomplete`, `denied`, or `unknown`
- `counts`: per-collection totals and unresolved totals
- `request_ids`: OCI request identifiers only
- `error_code`: safe, remediation-oriented classification without secret data

## OCI Evidence Record

The normalized form of a backup or vulnerability response:

- `record_type`: `boot_volume_backup`, `vulnerability_summary`, or
  `vulnerability_detail`
- `source_ocid`
- `source_endpoint`
- `observed_at`
- `lifecycle_state` when supplied
- `severity`, `cve_references`, `host_ocids`
- `package_name`, `installed_version`, `fixed_version`, and `remediation`
  when supplied by the detailed vulnerability response
- `request_id`
- `metadata_complete`
- `unresolved_reason` when required fields are absent or invalid

Unknown third-party fields are discarded from the sanitized record. Required
missing or malformed fields fail the record validation and preserve an
unresolved record rather than silently dropping it.

## Finding Group

Deterministically derived from normalized vulnerability records:

- `group_id`: hash of the canonical update identity and tool schema version
- `identity`: CVE/reference, package, fixed version, and supported remediation
  kind where available
- `finding_ids`
- `source_ids`
- `severity_summary`
- `count`
- `resolved`: boolean
- `unresolved_reason` when not resolved

Canonicalization rules must sort collection fields, normalize absent values,
and use an explicitly versioned identity schema so repeated runs produce the
same IDs.

## Backup Evidence

The preflight-relevant projection of a boot-volume backup:

- `backup_ocid`
- `source_boot_volume_ocid`
- `compartment_ocid`
- `lifecycle_state`
- `time_created`
- `source_type`
- `observed_at`
- `request_id`
- `eligible_for_target`: computed only when source volume, state, and recency
  match the configured target policy

The MVP may report eligibility but cannot use it to authorize a write.

## Maintenance Plan

An exported review artifact, not an execution authorization:

- `plan_id`
- `run_id`
- `target_identity`
- `finding_group_ids`
- `backup_evidence_ids`
- `required_permissions`
- `verification_steps`
- `approval_reference`: absent in the MVP unless supplied by a future approved
  workflow
- `execution_allowed`: always false in the MVP

## Operation Record (Future Phase)

Reserved for the separately approved write phase:

- `operation_id`
- `plan_id`
- `approval_reference`
- exact target OCIDs and operation type
- accepted/request/work-request IDs
- terminal state: `accepted`, `in_progress`, `succeeded`, `failed`, or `unknown`
- rollback reference and post-operation verification status

An ambiguous timeout must produce `unknown` and block automatic retry.
