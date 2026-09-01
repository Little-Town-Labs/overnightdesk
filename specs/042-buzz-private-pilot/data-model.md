# Data Model: Buzz Private Pilot

This model describes operational truth and authority. It does not duplicate
Buzz's internal database schema or persist private keys.

## PilotWorkload

- `workload_id`: fixed value `buzz-private-pilot`
- `owner`: accountable human
- `source_commit`, `relay_digest`, `ingress_digest`, `adapter_digest`
- `lifecycle_state`: `planned | installed_disabled | private_qualified |
  owner_active | canary_active | observing | paused | rolled_back`
- `route_state`: `absent | enabled | disabled_preserved`
- `resource_ceiling`: CPU, memory, PIDs, disk, connections
- `previous_release_handle`
- `approval_refs`: per-gate approval metadata

**Rules**: State transitions are monotonic except explicit pause/rollback.
Route activation requires current private qualification, recovery evidence,
rollback verification, and approval.

## PrivateIngressIdentity

- `device_name`: fixed value `buzz`
- `fqdn`: fixed value `buzz.tail5c4f73.ts.net`
- `tags`: exactly `tag:buzz-private-pilot`
- `state`: `absent | enrolled_disabled | serve_active | revoked`
- `serve_target`: fixed value `http://127.0.0.1:3000`
- `funnel_enabled`, `ssh_enabled`, `exit_node_enabled`: false
- `state_path`, `credential_scope_ref`, `last_verified_at`

**Rules**: The enrollment credential grants only `auth_keys` for the exact tag.
Node state and credentials never enter evidence. Activation requires the exact
Serve contract and existing host Serve/Nginx baselines to remain unchanged.
Revocation is independent of Buzz application identities.

## Community

- `community_id`, `hostname`, `display_name`
- `closed_relay_required`: true
- `git_web_enabled`, `admin_enabled`, `workflows_enabled`: false
- `allowed_data_class`: synthetic pilot content
- `retention_policy`

**Rules**: Exactly one community exists in MVP. Multi-community changes scope.

## Identity

- `public_key`, `kind`: `human_owner | relay_admin | agent_canary |
  negative_test`
- `status`: `generated | admitted | active | revoked`
- `recovery_custodian`, `created_at`, `revoked_at`
- `secret_reference`: opaque path metadata only

**Rules**: Public keys are unique. Private keys never enter this model,
evidence, Compose, logs, or another identity's process.

## MembershipGrant

- `grant_id`, `identity_public_key`
- `scope_type`: `relay | channel`
- `scope_id`, `role`, `granted_by`, `granted_at`, `revoked_at`

**Rules**: A channel grant requires an active relay grant. Revocation must
invalidate existing and queued canary work. Grants are independently auditable.

## AgentAuthorityProfile

- `agent_public_key`
- `allowed_owner_public_keys`: exactly one in MVP
- `allowed_channel_ids`: exactly one in MVP
- `max_concurrency`: one
- `max_output`, `timeout`, `deduplication_window`
- `allowed_tools`: empty
- `prohibited_actions`: production, shell, secrets, outreach, payments,
  CRM/customer/prospect data, repository mutation, cross-channel response

**Rules**: Missing owner or channel means respond to nobody. Tool addition,
multiple channels, or another caller requires a new approval.

## StateStore

- `store_id`: `postgres | redis | minio | git_scratch | tailscale_state |
  secret_custody`
- `authority`: durable or ephemeral owner
- `volume_or_scope`, `unix_owner`, `network_scope`
- `backup_method`, `restore_order`, `validation_checks`
- `last_backup_set_id`, `last_restore_run_id`

**Rules**: A recovery set is complete only when every authoritative store has
the same maintenance-window marker and all logical validation checks pass.
`git_scratch` is recreated and validated through repository-state rehydration;
it is not an authoritative backup artifact. `tailscale_state` is revocable
device identity state and is recreated through explicit re-enrollment rather
than restored into a second live device.

## QualificationRun

- `run_id`, `gate`, `candidate_identity`, `started_at`, `completed_at`
- `environment_baseline_ref`, `approval_ref`
- `checks[]`: name, safe result, duration, evidence digest
- `result`: `pass | fail | incomplete`
- `blockers[]`, `rollback_run_id`

**Rules**: Incomplete runs never satisfy a gate. Evidence excludes secrets and
message content. Results bind to the exact release and environment.

## RecoverySet

- `backup_set_id`, `maintenance_window`, `source_release`
- `artifacts[]`: store, digest, encrypted bytes, completeness
- `complete_marker`, `off_box_custody_ref`
- `restore_run_id`, `restore_result`, `measured_rpo`, `measured_rto`

**Rules**: A `COMPLETE` marker is emitted only after all artifacts finish.
Owner admission requires a successful isolated restore of the current schema.

## PilotDecision

- `decision_id`, `qualification_run_ids[]`, `observation_window`
- `decision`: `continue_bounded | pause_disabled | rollback |
  propose_expansion`
- `residual_risks[]`, `approved_by`, `decided_at`
- `proposed_authority_delta`: optional and non-executing

**Rules**: A decision never grants authority by itself. Any proposed expansion
becomes a separately scoped approval and tracked change.
