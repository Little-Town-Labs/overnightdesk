# Contract: Ingress and Runtime

## Required

- A dedicated tag-owned Tailscale device named `buzz` terminates TLS/WSS for
  exactly `buzz.tail5c4f73.ts.net` without modifying the existing OCI Nginx or
  host Tailscale Serve listeners.
- The ingress runs in userspace mode under an explicit non-root UID/GID, keeps
  node state and its LocalAPI socket only in approved writable paths, mounts
  Serve configuration as a directory, and enables no Funnel, subnet route,
  exit node, Tailscale SSH, or host networking capability.
- The relay uses `network_mode: service:tailscale`, binds only to loopback in
  the shared namespace, and publishes no host port.
- PostgreSQL, Redis, MinIO, health, metrics, Git web, admin, and workflow hooks
  are not externally routed.
- Relay and dependencies run as approved non-root users where image support
  allows, with capability drop, no-new-privileges, PID/resource limits, private
  networks, explicit writable paths, and no Docker socket.
- Relay, ingress, and dependency images use immutable ARM64 digests. The relay
  wrapper copies exact upstream artifacts, freezes every runtime package input,
  and records its result digest. Root-owned deployment source retains a
  previous-release handle.
- The selected private ingress applies bounded WebSocket connections,
  request/body size, timeouts, and rate controls without breaking normal
  signed traffic.

## Gate

`enable-route` MUST fail unless `verify-private`, current recovery evidence,
the Tailscale Serve configuration validator, Funnel absence, expected device
tag/name, route absence, existing-listener regression checks, and approval all
pass. Any activation failure must stop the dedicated ingress device and restore
route absence without editing the host Serve configuration.

## Verification

Inspect rendered Compose and live container user, digest, ports, mounts,
capabilities, security options, shared network namespace, limits, health,
Tailscale state/socket paths, Serve/Funnel status, device tags, and secret
metadata. From approved and unapproved network paths prove exact reachability
and denial. Compare the host Nginx and Tailscale Serve baselines before and
after every route lifecycle action.
