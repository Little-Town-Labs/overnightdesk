# Data Model: Buzz Private Pilot

This model records operational truth and authority. It does not duplicate
Buzz's internal schema or persist private keys, credentials, headers, cookies,
or message content.

## PilotWorkload

- `workload_id`: `buzz-private-pilot`
- `owner`, `source_commit`, `relay_digest`, `canary_digest`
- `nginx_config_digest`, `canonical_url`
- `lifecycle_state`: `planned | installed_disabled | private_qualified |
  owner_active | canary_active | observing | paused | rolled_back`
- `resource_ceiling`, `previous_release_handle`, `approval_refs`

**Rules**: Production transitions require the prior gate's exact evidence and
approval. Pause and rollback preserve authoritative state.

## PrivateIngressRoute

- `private_address`: selected only after current preflight
- `prefix_length`: exactly `32`
- `advertising_node`: existing Aegis Tailscale node
- `route_state`: `absent | advertised | approved | active | withdrawn`
- `grant_state`: `absent | staged | active | withdrawn`
- `allowed_source_devices`: approved owner devices only
- `baseline_route_digest`, `baseline_serve_digest`, `last_verified_at`

**Rules**: The address has no public NAT path. Advertisement/approval and the
source grant are separate transitions. Existing routes, node identity, and
Serve handlers remain unchanged. Withdrawal targets only this exact `/32` and
grant.

## IngressConfiguration

- `canonical_url`: `wss://buzz.overnightdesk.com`
- `listener_address`, `listener_port`: selected private address and `443`
- `internal_nginx_port`: implementation-frozen value
- `certificate_ref`, `certificate_method`: secret-free metadata and DNS-01
- `config_digest`, `enabled_state`: `absent | installed_disabled | active`
- `public_listener_denial_evidence`, `protocol_evidence`

**Rules**: The Buzz server block is not selectable on a public listener.
Activation requires `nginx -t`, a reload, full NIP-42/NIP-98 proof, and public
IP/SNI/Host denial. It never invokes OvernightDesk `auth_request`.

## Community

- `community_id`, `hostname`, `display_name`
- `closed_relay_required`: true
- `git_web_enabled`, `admin_enabled`, `workflows_enabled`: false
- `allowed_data_class`: synthetic pilot content

**Rules**: Exactly one community exists in the MVP.

## Identity and MembershipGrant

- `Identity`: `public_key`, `kind` (`human_owner | relay_admin |
  agent_canary | negative_test`), `status`, recovery-custody metadata
- `MembershipGrant`: identity public key, relay/channel scope, role, grant and
  revocation timestamps

**Rules**: Private keys never enter this model. A channel grant requires active
relay membership. Revocation invalidates queued and future canary work.

## AgentAuthorityProfile

- `agent_public_key`
- `allowed_owner_public_keys`: exactly one
- `allowed_channel_ids`: exactly one
- `max_concurrency`: one
- `max_output`, `timeout`, `deduplication_window`
- `allowed_tools`: empty
- `network_target`: canonical Nginx URL only
- `prohibited_actions`: direct relay/store access, production, shell, secrets,
  outreach, payments, CRM/customer/prospect data, repository mutation, and
  cross-channel response

**Rules**: Missing owner or channel denies all response. Any new caller,
channel, tool, target, or authority is a separately approved scope change.

## StateStore

- `store_id`: `postgres | minio | redis | git_scratch | ingress_metadata |
  secret_custody`
- `authority`: `authoritative | diagnostic | reproducible | metadata |
  external-secret`
- `volume_or_scope`, `unix_owner`, `network_scope`
- `backup_method`, `restore_order`, `validation_checks`
- `last_backup_set_id`, `last_restore_run_id`

**Rules**: PostgreSQL and MinIO form one coherent recovery set. Redis is
diagnostic and Git scratch is regenerated. Ingress metadata contains no secret
or Tailscale node state; route/grant/listener configuration is recreated only
through an approved lifecycle.

## QualificationRun

- `run_id`, `gate`, `candidate_identity`, `environment_baseline_ref`
- `approval_ref`, timestamps, checks, safe result, duration, evidence digest
- `result`: `pass | fail | incomplete`
- `blockers`, `rollback_run_id`

**Rules**: Incomplete or digest-mismatched runs satisfy no gate. Evidence
contains outcome classes, not sensitive payloads.

## RecoverySet

- `backup_set_id`, `maintenance_window`, `source_release`
- PostgreSQL and MinIO artifacts, digests, encrypted sizes, completeness
- `complete_marker`, `off_box_custody_ref`
- restore result, logical assertions, measured RPO/RTO

**Rules**: `COMPLETE` is emitted only after both authoritative artifacts
succeed. Owner admission requires an isolated current-schema restore.

## PilotDecision

- `decision_id`, qualification run references, observation window
- `decision`: `continue_bounded | pause_disabled | rollback |
  propose_expansion`
- residual risks, approver, timestamp, optional non-executing authority delta

**Rules**: A decision does not grant authority. Expansion requires a new scope
and approval.
