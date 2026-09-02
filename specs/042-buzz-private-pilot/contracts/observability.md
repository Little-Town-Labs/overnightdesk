# Contract: Safe Observability and Evidence

## Required signals

- service availability and restart count;
- CPU, memory, PIDs, disk, connections, and store health;
- Nginx config/container/network digest, validation result, reload result,
  fixed internal-listener state, unchanged Docker publications, and systemd
  socket/proxy state;
- OCI VNIC and host-interface secondary-address assignment state plus baseline
  digests;
- `/32` advertisement/approval and unchanged tailnet-policy digest;
- digests proving existing routes and Tailscale Serve remained unchanged;
- public/forged-SNI and unadmitted-identity denial counts;
- NIP-42 and NIP-98 outcome classes, safe operation ID, latency, and reconnect
  result without signed full URLs or query values;
- backup completeness, encrypted artifact sizes, restore result, RPO/RTO;
- per-agent allow/deny/deduplicate/revoke/late-result-suppression outcome
  classes plus shared-network, unrelated-service, and broker-route denials.

## Forbidden telemetry

Do not record private keys, secrets, authorization values, cookies, signed
events, complete URLs containing sensitive values, message bodies, prompts,
responses, attachment content, or raw database/object-store records.

## Evidence rules

- Evidence is bound to source, image, rendered Compose, Nginx config/container,
  systemd socket/proxy, VNIC/interface assignment, route, policy, and baseline
  digests.
- Failure categories distinguish transport denial, TLS/hostname, WebSocket,
  NIP-42, NIP-98, membership, upstream, recovery, and authority failures
  without capturing payloads.
- Every production run names its gate and approval reference.
- Sentinel scans fail the gate on any forbidden value.
- Rollback evidence proves Buzz unreachable, the Buzz secondary address
  removed, and existing OCI VNIC/host-interface addresses, Docker publications,
  Nginx container/vhosts, systemd listeners, Tailscale Serve, routes,
  containers, backup jobs, and health checks unchanged.
