# Data Model: Phase App Consolidation

## Phase App

- `id`: immutable UUID used to prove identity across rename
- `name`: case-sensitive current selector
- `use_case`: TTS or OvernightDesk
- `environment_id`: immutable Production environment UUID
- `state`: source, prepared target, active target, retained rollback

Transitions:

```text
source -> prepared target -> active target -> observed
source -------------------------------------> retained rollback
```

Deletion is not a transition in this feature.

## Secret Path

- `app_id`
- `environment_id`
- `path`
- `key_count`
- `canonical_fingerprint`: SHA-256 of sorted compact JSON
- `source_preserved`: boolean

Validation requires equal source/destination app-independent payloads, exact
expected counts, non-empty string values, and no emitted values.

## Consumer

- `name`: email-fetch, hermes-titus, intake-titus, intake-agent, intake-mitchel
- `target_app`
- `environment`: Production
- `path_set`: one or more exact paths
- `service_account_identity`
- `loader_source`
- `live_selector`
- `health_evidence`
- `rollback_selector`

## Access Grant

- `service_account_identity`
- `app_id`
- `environment_id`
- `role`
- `verified_at`

A consumer cannot activate until its grant can perform a real value-suppressed
export for every required path.

## Service Account Identity

- `timeless-tech-solutions`: Control Tower, Hermes Titus, and Titus intake
- `overnightdesk`: OvernightDesk platform consumers, Agent and Mitchel intake,
  and email-fetch
- `platform-cli-cloud`: retained only as an inactive rollback credential during
  observation

Consumer-owned token files may contain separate tokens for one identity. Token
file count does not change the two-identity trust model.

## Cutover Evidence

- source/destination counts and fingerprints
- source preservation checks
- source-control commit and PR identifiers
- systemd/container health results
- app metadata before and after rename
- deployment log record
- standards repository commit

Evidence explicitly excludes secret values and value fragments.
