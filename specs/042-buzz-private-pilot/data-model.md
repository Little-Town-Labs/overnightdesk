# Data Model: Buzz Private Pilot

This model records operational truth and authority. It does not duplicate
Buzz's internal schema or persist private keys, credentials, headers, cookies,
or message content.

## PilotWorkload

- `workload_id`: `buzz-private-pilot`
- `owner`, `source_commit`, `relay_digest`, `intake_worker_digests`
- `nginx_config_digest`, `websocket_relay_url`, `nip98_https_origin`,
  `nip98_operation_manifest_digest`
- `lifecycle_state`: `planned | installed_disabled | private_qualified |
  owner_active | canary_active | agents_active | observing | paused |
  rolled_back`
- `resource_ceiling`, `previous_release_handle`, `approval_refs`

**Rules**: Production transitions require the prior gate's exact evidence and
approval. Pause and rollback preserve authoritative state.

## PrivateIngressRoute

- `private_address`: selected only after current preflight
- `oci_vnic_id`, `host_interface`: frozen non-secret resource identifiers
- `address_state`: `unassigned | vnic_assigned | host_assigned | active |
  removed`
- `prefix_length`: exactly `32`
- `advertising_node`: existing Aegis Tailscale node
- `route_state`: `absent | advertised | approved | active | withdrawn`
- `tailnet_policy_mode`: `existing_tailnet_wide`
- `tailnet_policy_digest`: captured compiled-policy baseline
- `allowed_transport_sources`: current owner-controlled tailnet devices
- `baseline_vnic_digest`, `baseline_interface_digest`, `baseline_route_digest`,
  `baseline_serve_digest`, `last_verified_at`

**Rules**: The address has no public NAT path. With explicit approval, the
exact secondary private IP is assigned to the frozen OCI VNIC and intended host
interface and passes local-bind proof before advertisement or listener
activation. Address assignment and advertisement/approval are separate
transitions. Socket-first rollback withdraws only this `/32`, then removes
only this address assignment. Existing addresses, routes, tailnet policy, node
identity, and Serve handlers remain unchanged.

## IngressConfiguration

- `websocket_relay_url`: exact `wss://buzz.overnightdesk.com`
- `nip98_https_origin`: exact `https://buzz.overnightdesk.com`
- `nip98_operations`: frozen exact method and full HTTPS request URL pairs,
  including raw path and query
- `listener_address`, `listener_port`: selected private address and `443`
- `nginx_bridge_address`, `internal_nginx_port`: fixed `buzz-ingress` target and
  `8443`
- `nginx_agent_address`, `internal_agent_tls_port`: fixed `buzz-agents` target
  and `443` for canonical intake-worker traffic
- `socket_unit`, `proxy_unit`, `proxy_binary`: exact hardened systemd unit
  references and existing `systemd-socket-proxyd`
- `certificate_ref`, `certificate_method`: secret-free metadata and DNS-01
- `config_digest`, `socket_unit_digest`, `enabled_state`:
  `absent | installed_disabled | nginx_ready | socket_active`
- `public_listener_denial_evidence`, `protocol_evidence`

**Rules**: Neither external URL form includes an explicit default `:443` port.
The Buzz server block is not selectable on a public listener. The shared Nginx
container receives no new Docker publication and is never recreated for Buzz.
Its only Buzz listeners are the fixed `buzz-ingress:8443` and
`buzz-agents:443` endpoints.
Activation requires `nginx -t`, a reload, starting the exact private socket,
NIP-42 proof under the exact WebSocket URL, NIP-98 proof for every frozen
method/full-URL pair, and public IP/SNI/Host denial. It never invokes
OvernightDesk `auth_request`.

## Community

- `community_id`, `hostname`, `display_name`
- `closed_relay_required`: true
- `git_web_enabled`, `admin_enabled`, `workflows_enabled`: false
- `allowed_data_class`: synthetic pilot content

**Rules**: Exactly one community exists in the MVP.

## Identity and MembershipGrant

- `Identity`: `public_key`, `kind` (`human_owner | relay_admin |
  hermes_walter | hermes_titus | hermes_mitchel | negative_test`), `status`,
  recovery-custody metadata
- `MembershipGrant`: identity public key, relay/channel scope, role, grant and
  revocation timestamps

**Rules**: Private keys never enter this model. Each Hermes identity is unique,
read/write, and independently revocable. A channel grant requires active relay
membership. Revocation invalidates queued work not yet submitted and future
work for only that agent and suppresses any late result publication.

## AgentAuthorityProfile

- `agent_public_key`
- `runtime_id`: `hermes-walter | hermes-titus | hermes-mitchel`
- `allowed_owner_public_keys`: exactly one
- `allowed_channel_ids`: exactly one
- `allowed_trigger_public_keys`: owner only
- `max_concurrency`: one
- `max_output`, `timeout`, `deduplication_window`
- `hermes_api_route`, `runtime_api_token_ref`
- `egress_broker_route`: one fixed Nginx route for capabilities, submission,
  and status only
- `existing_authority_policy_ref`: mapped runtime's current tool and human-
  approval policy
- `network_targets`: canonical Nginx and its fixed-target egress broker only
- `prohibited_actions`: shared-production-network attachment, direct
  relay/store/unrelated-service access, cross-runtime credentials, approval
  bypass, authority expansion, and cross-channel response
- `revocation_state`: active, revoked-before-submission, or
  revoked-after-submission-result-suppressed

**Rules**: Missing owner, channel, or exact agent identity denies all response.
Bot-authored messages do not trigger another agent. Exact owner signature and
channel checks precede Hermes. Existing tools retain their current approval rules;
any new caller, agent, channel, tool, target, or authority is a separately
approved scope change. Revocation does not claim to cancel an already-submitted
Hermes run; it prevents new submissions and suppresses late result publication.

## StateStore

- `store_id`: `postgres | object_store | redis | git_scratch |
  ingress_metadata | secret_custody`
- `authority`: `authoritative | diagnostic | reproducible | metadata |
  external-secret`
- `volume_or_scope`, `unix_owner`, `network_scope`
- `backup_method`, `restore_order`, `validation_checks`
- `last_backup_set_id`, `last_restore_run_id`

**Rules**: PostgreSQL and the ADR-009-selected, conformance-qualified object
store form one coherent recovery set. Redis is diagnostic and Git scratch is
regenerated. Ingress metadata contains no secret or Tailscale node state;
route/listener configuration is recreated only through an approved lifecycle.

## QualificationRun

- `run_id`, `gate`, `candidate_identity`, `environment_baseline_ref`
- `approval_ref`, timestamps, checks, safe result, duration, evidence digest
- `result`: `pass | fail | incomplete`
- `blockers`, `rollback_run_id`

**Rules**: Incomplete or digest-mismatched runs satisfy no gate. Evidence
contains outcome classes, not sensitive payloads.

## RecoverySet

- `backup_set_id`, `maintenance_window`, `source_release`
- PostgreSQL and qualified-object-store artifacts, digests, encrypted sizes,
  completeness
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
