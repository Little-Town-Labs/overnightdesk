# Gate 0 Aegis Baseline

**Captured**: `2026-09-01T16:51:03Z`

**Method**: Read-only SSH inspection of `aegis-prod`. No container, service,
route, file, secret, backup, or production state was changed.

## Host and Runtime

- Hostname: `aegis-prod`
- Architecture: `aarch64`
- Kernel: `6.17.0-1020-oracle`
- Docker Compose: `v5.3.1`
- Memory: 25,139,560,448 bytes total; 19,777,503,232 bytes available; swap
  unused.
- Root/Docker filesystem: 206,900,281,344 bytes total;
  77,012,590,592 bytes available; 63% used.
- Docker storage: 48.22 GB images, 205.1 MB containers, 28.62 GB local
  volumes, and 26.09 GB build cache. Reclaimable data was observed but no
  cleanup was authorized or performed.

## Existing Container Baseline

Nineteen named containers were running. Fifteen reported Docker health as
healthy; four (`overnightdesk-nginx`, `overnightdesk-ops`, `ob1-mcp`, and
`guardian-db`) were running without a Docker health status. No container was
unhealthy, restarting, paused, or exited.

Running names:

- `titus-meeting-processor`
- `hermes-email-intake-walter`, `hermes-email-intake-mitchel`,
  `hermes-email-intake-titus`
- `hermes-walter`, `hermes-mitchel`, `hermes-titus`
- `open-webui-hermes-titus`, `open-webui-hermes-walter`
- `overnightdesk-nginx`, `overnightdesk-ops`,
  `overnightdesk-securityteam`, `overnightdesk-communication-module`
- `control-tower`, `ob1-mcp`, `camofox-browser`
- `guardian-db`, `tenet0-postgres`, `commmodule-db`

This list is the health-regression comparison set for later approved gates.
Checks must account for the four services that lack Docker health checks rather
than incorrectly treating `running` as an application-level health assertion.

## Ingress and Route Baseline

- `overnightdesk-nginx` publishes only
  `10.0.0.234:80 -> 80/tcp` and `10.0.0.234:443 -> 443/tcp`.
- `10.0.0.234/24` belongs to `enp0s6`, the OCI interface. It is not the
  Tailscale address and must not be used as evidence of a private route.
- Tailscale is `100.100.1.21/32`. Tailscale Serve already listens on tailnet
  HTTPS port 443 for `aegis-prod.tail5c4f73.ts.net` and proxies `/` to
  `http://100.100.1.21:13005` (`ob1-mcp`).
- Existing route files were enumerated under
  `/opt/overnightdesk/nginx/conf.d/`.
- `/opt/overnightdesk/nginx/conf.d/buzz.conf` was absent.
- No Buzz container, service, host port, route, or volume existed in the
  observed baseline.

## Backup Baseline

`aegis-backup-producer.service` last completed successfully on 2026-09-01:

- `Result=success`
- `ExecMainStatus=0`
- set ID `set-20260901T135635Z`
- `artifact_count=64`
- `encrypted_bytes=689390615`
- terminal event `set_complete`

The service was inactive/dead after successful completion, as expected for a
one-shot producer. This proves the repaired baseline producer is operating; it
does not cover any future Buzz store. Buzz backup additions and an isolated
restore remain mandatory before owner admission.

## Baseline Decision

Aegis had sufficient observed headroom for the bounded plan and no pre-existing
health blocker. This is not deployment authorization. The Buzz relay candidate
failed Gate 0, and the assumed private ingress seam does not exist in the form
previously documented. The host baseline remains unchanged and no capacity was
reserved.
