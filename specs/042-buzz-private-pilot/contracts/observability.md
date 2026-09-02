# Contract: Safe Observability and Evidence

## Required signals

- service availability and restart count;
- CPU, memory, PIDs, disk, connections, and store health;
- Nginx config digest, validation result, reload result, and private-listener
  state;
- `/32` advertisement/approval and source-grant state without credentials;
- digests proving existing routes and Tailscale Serve remained unchanged;
- public/forged-SNI/unapproved-device denial counts;
- NIP-42 and NIP-98 outcome classes, latency, and reconnect result;
- backup completeness, encrypted artifact sizes, restore result, RPO/RTO;
- canary allow/deny/deduplicate/revoke outcome classes.

## Forbidden telemetry

Do not record private keys, secrets, authorization values, cookies, signed
events, complete URLs containing sensitive values, message bodies, prompts,
responses, attachment content, or raw database/object-store records.

## Evidence rules

- Evidence is bound to source, image, rendered Compose, Nginx config, route,
  grant, and baseline digests.
- Failure categories distinguish transport denial, TLS/hostname, WebSocket,
  NIP-42, NIP-98, membership, upstream, recovery, and authority failures
  without capturing payloads.
- Every production run names its gate and approval reference.
- Sentinel scans fail the gate on any forbidden value.
- Rollback evidence proves Buzz unreachable and existing Nginx vhosts,
  Tailscale Serve, routes, containers, backup jobs, and health checks unchanged.
