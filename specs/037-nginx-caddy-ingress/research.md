# Research: Replacing Aegis Nginx ingress with Caddy

**Status:** research only; no implementation or production authorization

**Origin:** [Issue #164](https://github.com/Little-Town-Labs/overnightdesk/issues/164)

## Scope and current conclusion

Issue #164 asks whether the containerized Nginx ingress on `aegis-prod` can be
replaced by Caddy. It explicitly does not authorize implementation, DNS or
certificate changes, port rebinding, or production mutation.

Provisional recommendation: **do not approve a direct replacement yet.** Caddy
is a credible candidate for a staged qualification, but the current ingress is
a security and availability contract, not merely a TLS/reverse-proxy process.
The go/no-go gate is behavioral equivalence for rate/concurrency controls,
authentication failures, long-lived streams, and the retired hostname's
certificate-less TLS rejection.

## Evidence from the current repository

- `docker-compose.yml:2-38` defines the ingress as `nginx:1.27-alpine`, with
  ports 80/443, read-only Nginx and Certbot mounts, dropped capabilities, and
  a 128 MiB/0.25 CPU limit. The checked-in Compose binding is generic
  (`80:80`, `443:443`); Issue #164's live baseline says the running container is
  pinned to `10.0.0.234:80/443` to preserve the Tailscale listener boundary.
  This source/live difference must be reconciled before design.
- `infra/nginx/walter-hermes.conf:28-84` and
  `infra/nginx/aero-fett.conf:28-64` implement Better Auth tenant
  subrequests, Vercel DNS re-resolution, TLS SNI/Host forwarding, OpenAI API
  routes, streaming timeouts, and redirect-on-unauthorized behavior.
- `infra/nginx/titus-hermes.conf:22-71` separates the Teams webhook from the
  dashboard auth boundary, returns raw 401/403 for the dashboard, forwards
  WebSocket upgrades, rewrites session cookie flags, and allows one-hour
  streams. `infra/nginx/titus-teams.conf:22-37` exposes only the exact webhook
  path and returns 404 elsewhere.
- `infra/nginx/orchestrator-retired.conf:3-19` returns HTTP 404 and uses
  `ssl_reject_handshake on`; the retired host must not receive an application
  certificate or fall through to a default vhost.
- `infra/open-webui/titus/nginx.conf:2-76` and
  `infra/open-webui/walter/nginx.conf:2-76` enforce `300r/m` per-IP request
  limiting with burst 300 and a per-IP concurrent-connection cap of 32, in
  addition to auth, 64 KiB body limits, headers, cookie handling, and
  WebSocket/streaming behavior.
- `infra/open-webui/{titus,walter}/deploy-aegis.sh` and
  `tenants/hermes-titus/scripts/deploy-aegis.sh` install route files under
  `/opt/overnightdesk/nginx/conf.d`, run `nginx -t`, reload Nginx, issue
  Certbot certificates, and retain route-specific rollback files.
- Nginx is also a logical identity provider in
  `src/lib/use-case-identity-templates.ts:78,138,222`,
  `src/lib/dashboard-canonical-context.ts:50`, and
  `src/lib/dashboard-instance-reconciliation.ts:205`. A migration must decide
  whether this binding remains a stable `ingress` concept or changes from
  `nginx` to `caddy`; that is a compatibility decision, not a string-only
  replacement.

## Stock Caddy capability and gap matrix

| Contract | Caddy position | Qualification requirement |
|---|---|---|
| Public HTTPS and HTTP redirect | Strong fit. Caddy automatically obtains and renews certificates and redirects HTTP to HTTPS. | Pin issuer policy and test all current hosts. Do not inherit the default multi-issuer policy without an explicit decision. |
| Reverse proxy, WebSockets, SSE, buffering | Strong fit. `reverse_proxy` supports HTTP proxying, WebSockets, dynamic upstreams, health checks, and streaming flush behavior. | Reproduce the current per-route timeouts, no-buffering behavior, header forwarding, and long-lived sessions. |
| Better Auth forward-auth | Conditional fit. `forward_auth` allows 2xx and copies other upstream responses to the client. | Use per-host routes or the expanded form to preserve Walter/Mitchel redirects versus Titus raw 401/403 behavior. Verify cookies, `X-Original-Host`, SNI, and Vercel rotation. |
| Per-IP request rate limit | Gap in stock Caddy. The documented `http.handlers.rate_limit` is a non-standard module and is not in the standard directive list. | Choose an approved application/edge control, or approve a pinned custom build with its own supply-chain and test policy. |
| Per-IP concurrent connection cap | Gap in stock Caddy's ordinary reverse-proxy contract. Upstream connection limits are not equivalent to a per-client concurrent-connection limit. | Preserve the cap in an approved control plane or keep Nginx. Do not substitute `max_conns_per_host` without proving semantics. |
| Retired hostname TLS rejection | Unproven gap. Caddy must reject `orchestrator.overnightdesk.com` at handshake time without serving a default certificate. | Build a negative SNI/HTTP test before any cutover; failure is a no-go. |
| Reload and rollback | Strong operational fit. Caddy's API reload is zero-downtime and rolls back to the prior config if the new config fails. | Protect the admin API, version the source config, export live config, and test rollback with active WebSockets/SSE. |
| Certificate custody and recovery | Different operating model. Caddy stores certificates and private keys in persistent writable storage; current Nginx reads Certbot custody. | Define backup/restore, permissions, owner, recovery drill, issuer, and transition/rollback custody before cutover. |
| Listener boundary | Feasible but must be explicit. | Preserve `10.0.0.234:80/443` and prove no interference with Tailscale Serve. |

Primary Caddy references: [automatic HTTPS](https://caddyserver.com/docs/automatic-https),
[`forward_auth`](https://caddyserver.com/docs/caddyfile/directives/forward_auth),
[`reverse_proxy`](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[standard directives](https://caddyserver.com/docs/caddyfile/directives),
[rate-limit module status](https://caddyserver.com/docs/modules/http.handlers.rate_limit),
[Caddy API reload behavior](https://caddyserver.com/docs/api), and
[service/reload guidance](https://caddyserver.com/docs/running).

The official docs specifically state that WebSockets close on config reload by
default and can be delayed with `stream_close_delay`; this must be part of the
Titus/Walter qualification rather than treated as an implementation detail.

## Cross-repository impact

- **overnightdesk:** Compose, `infra/nginx`, Open WebUI route templates and
  qualification scripts, Titus/Walter deployment scripts, identity bindings,
  tests, and runbooks.
- **overnightdesk-ops:**
  `src/lib/collectors/nginx.ts` and its tests parse Nginx location blocks and
  write facts with `source: nginx`. Replace this with an implementation-neutral
  ingress contract, or support a bounded dual-reader during transition.
- **overnightdesk-operations-audit:**
  `internal/sources/nginx/nginx.go` and tests parse `location`, `proxy_pass`,
  and `auth_request`. The audit source and evidence schema need a deliberate
  migration path.
- **overnightdesk-platform-standard:** `WHAT/network.yaml`,
  `HOW/networks.md`, `HOW/architecture.md`, deployment docs, identity notes,
  retirement runbooks, and rollback evidence all describe Nginx as the only
  public surface.
- **Control Tower/deployment tooling:** Issue #164 identifies additional
  deployment and rollback consumers; they need an inventory before any
  implementation plan is accepted.

## Safe next research slice

1. Capture a secret-safe live baseline: listener addresses, container image and
   capabilities, all active hostnames, route behavior, current rate/concurrency
   values, Certbot timers, certificate paths/permissions, Tailscale state, and
   current rollback artifacts. Reconcile it with checked-in source.
2. Produce a host-by-host equivalence matrix covering HTTP, HTTPS/SNI, auth
   success/failure, redirect versus raw denial, headers, cookies, body limits,
   WebSockets, SSE, upstream DNS rotation, and retired-host behavior.
3. Build a non-public Caddy candidate using pinned versions and persistent
   storage. Run `caddy validate`/adaptation checks and use ACME staging or
   manually loaded test certificates; do not issue production certificates.
4. Resolve the rate/concurrency decision before writing production Caddy
   configuration. A custom plugin build is a new supply-chain and operational
   boundary; an application move is a behavior/security change; retaining
   Nginx is an acceptable outcome.
5. Test a reversible canary on an alternate listener or isolated address, then
   perform a separately approved short cutover preserving the exact
   `10.0.0.234:80/443` boundary. Keep Nginx stopped but intact, retain the
   Certbot tree, and verify an immediate rollback path before observation.

## Provisional decision

**Research go; migration no-go.** Continue with a bounded qualification
artifact, but do not replace Nginx until every current behavior is either
reproduced and tested or explicitly re-approved as a changed contract. The
rate/concurrency controls and retired-host handshake are current hard gates;
certificate custody, admin API protection, source/live drift, and cross-repo
observability are required design gates.
