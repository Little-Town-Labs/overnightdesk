# ADR-007: Run Buzz only as a private, gated Aegis pilot

## Status

Deprecated — research closed without deployment at the owner's direction on
2026-09-01.

## Date

2026-09-01

## Closure

This decision was never activated. No service, secret, route, identity,
database, registry artifact, or other production state was created. The ADR is
retained to preserve the research and decision history, but a future restart
must make a new ingress and deployment decision rather than assuming this ADR
remains approved.

## Context

Buzz could give the owner and agents one shared real-time collaboration space,
but it is a pre-1.0 external system with its own Nostr identities, PostgreSQL,
Redis, object storage, repository state, WebSocket ingress, and agent adapter.
`aegis-prod` is a shared production host for named internal workloads, not a
general hosting plane. A Buzz deployment therefore has to prove isolation,
recoverability, bounded resource use, denial behavior, observability, and
route-first rollback before anyone can depend on it.

The owner authorized proceeding through the plan and authorized adding
minimum Buzz secrets in Phase when a qualified production gate needs them.
That permission does not waive the plan's independent deployment, route,
identity, canary, or expansion gates.

## Decision

Run at most one closed, synthetic-data Buzz pilot using these boundaries:

- Keep reviewed deployment source in `infra/buzz/`; do not vendor or fork the
  upstream Buzz repository for the pilot.
- Install the named Aegis workload under `/opt/overnightdesk/buzz/` with
  root-owned immutable release directories and explicit `current` and
  `previous` handles.
- Use a dedicated, tag-owned Tailscale container/device named `buzz` at
  `buzz.tail5c4f73.ts.net`. Run it in userspace mode, disable Funnel, and have
  the relay share its network namespace so Serve proxies only to relay
  loopback. Publish no Buzz host ports and do not edit the host's OCI-bound
  Nginx or existing Tailscale Serve handler.
- Store only a later-approved OAuth client credential restricted to
  `auth_keys` and `tag:buzz-private-pilot`; keep node state in its own writable
  path and make both credential and device independently revocable.
- Give PostgreSQL, Redis, MinIO, and relay scratch/Git data dedicated volumes
  and an internal network. Do not share an existing database, object store, or
  agent volume.
- Keep the owner's Nostr private key in owner-controlled client recovery
  custody. Never place it in Phase, Compose, an agent, logs, or evidence.
- Use a stable relay key and service credentials from the exact Phase path
  documented in the runbook. Create them only after a candidate passes local
  qualification and the owner approves disabled installation.
- Admit no owner until encrypted backup and isolated restore pass. Admit no
  agent until the owner-only gate passes.
- Use one newly generated, separately supervised, tool-free canary identity.
  Do not reuse Walter, Titus, Trevor, or another production identity.
- Disable the route first during rollback, then stop the canary and Buzz while
  preserving all state. Cleanup is a later, separately approved action.

The initially assessed relay image
`ghcr.io/block/buzz@sha256:aa5180ce58ac367a125a1c079bfde88f8c158daa99e1aa5df86e8814649669f5`
is rejected for production at Gate 0. Its provenance and ARM64 support pass,
but the independent 2026-09-01 scan recorded unresolved Critical and High
runtime findings. It may be used only as a build-stage source of exact relay
artifacts. The promoted Wolfi wrapper freezes its runtime base and package
versions, copies only the exact relay binary and web assets, runs non-root, and
has reproducible digest/SBOM/scan/runtime evidence. Its qualified local manifest
is
`sha256:f98fe0e1cc0e66c547adbe325f93df48fb0c451753983e95abb6b89c97da54a2`.
Registry publication and deployment pinning remain later, separately approved
actions; see
[`gate-0-remediation.md`](../../specs/042-buzz-private-pilot/evidence/gate-0-remediation.md).

The current official Tailscale stable image at index
`sha256:8c42c4574ab066384fcb72f69e086a2ff1dd3652eb6f56856cee34bcf0d2f680`
is also rejected: non-root userspace startup is feasible, but the preliminary
scan recorded 2 Critical and 22 High matches with fixes identified. Gate 0
waits for a fixed immutable upstream image; this pilot will not maintain a
Tailscale source fork.

## Alternatives Considered

### Deploy the upstream Compose bundle directly

Rejected. It publishes a relay host port, uses mutable dependency tags, lacks
Aegis resource and hardening contracts, and does not implement disabled-first
installation or the required backup/restore gate.

### Reuse an existing agent identity or runtime

Rejected. This would mix keys, memory, channel authority, and production tools
before Buzz's access and revocation behavior is qualified.

### Run Buzz as a public or general-purpose relay

Rejected. Public access, customer data, multi-community hosting, workflows,
Git web, and self-service admission are outside the approved internal pilot.

### Create a separate deployment repository immediately

Rejected for the pilot. `infra/buzz/` keeps the named workload beside the
existing Aegis deployment seams. A separate repository becomes reasonable only
if custom Buzz code or an independent release lifecycle emerges.

### Add Buzz under the existing Aegis Tailscale Serve hostname

Rejected. Although a path route could avoid another device, it would couple
Buzz activation and rollback to the existing `ob1-mcp` Serve root and would not
give Buzz an independently revocable tag, certificate name, or node state.

### Maintain a custom Tailscale build

Rejected for the pilot. Waiting for a fixed upstream immutable release keeps
the ingress supply chain reviewable and avoids taking ownership of a security
boundary unrelated to Buzz's product evaluation.

## Consequences

- The pilot remains reversible and cannot become reachable merely because its
  files or secrets exist.
- Phase stores only service secrets; owner identity recovery remains outside
  the server boundary.
- Multi-store recovery and a larger operational footprint are accepted only
  for the duration of the bounded evaluation.
- Both relay and ingress images must pass the same current ARM64 SBOM/scan and
  non-root runtime gate. Neither can be accepted through a configuration
  exception.
- The dedicated hostname will appear in Certificate Transparency, but contains
  no customer, tenant, or secret identifier; network access remains governed by
  the tailnet policy.
- Passing the pilot grants no additional person, agent, community, data class,
  route, workflow, or tool authority.
