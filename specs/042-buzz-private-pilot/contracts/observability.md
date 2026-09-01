# Contract: Observability and Evidence

## Signals

- lifecycle, health, restart, digest, readiness, and migration state;
- dedicated Tailscale device online state, expected tag/name, Serve/Funnel
  state, TLS/WSS errors, and unchanged host-listener baseline;
- WebSocket/request count, latency/error totals, membership denials, invalid
  signatures, rate-limit results, and dependency failures;
- database pool, Redis, MinIO, queue/canary, CPU, memory, PID, disk/inode, and
  connection capacity;
- backup/restore set IDs, artifact counts, validation results, and duration;
- canary processed, ignored, failed, duplicate, prohibited, and revoked events.

## Data Safety

Telemetry permits public keys only where operationally required, safe event
IDs, counts, durations, status, and reason codes. It forbids private keys,
secrets, Tailscale OAuth/auth values, node-state contents, authorization
values, cookies, raw URLs with credentials, message
bodies, prompts, model output, attachments, and secret-store responses.

## Alerts and Hard Stops

Readiness loss, restart loops, disk or memory ceiling, database exhaustion,
Redis admission failure, object errors, denial spikes, secret sentinel hits,
unexpected Funnel/route/SSH state, ingress tag/name drift, prohibited canary
actions, or existing Aegis health regression block gate
advancement. Secret leakage, data loss, or cross-scope action triggers immediate
route-first rollback and human decision.
