# Gate 0 Current Aegis Inventory

**Captured**: `2026-09-02T17:45:42Z` through `2026-09-02T17:51:07Z`

**Task**: T058

**Result**: complete for the Aegis host baseline; this result does not satisfy
the separate OCI or Tailscale control-plane inspections.

## Method and mutation boundary

The inventory used read-only SSH, Linux, Docker, Nginx, systemd, certificate,
and backup queries on `aegis-prod`. No address, route, listener, container,
network, certificate, DNS record, service, secret, or backup configuration was
created, changed, reloaded, or restarted during T058. A later, separately
approved correction to the existing OCI CLI profile fingerprint is recorded
under T059 in `current-oci.md`; it did not change any cloud resource.

One invocation of `certbot certificates` against Certbot's default path emitted
its normal `Saving debug log` message and may have appended to
`/var/log/letsencrypt/letsencrypt.log`. It found no certificates because Aegis
stores the active Certbot state under `/opt/overnightdesk/certbot/conf`. This
incidental diagnostic-log write changed no certificate, renewal configuration,
listener, or runtime state. Later certificate inspection used filesystem and
OpenSSL reads only.

Evidence intentionally excludes environment values, private keys, certificate
private-key content, request headers, cookies, and application payloads.

## Host and interface

| Fact | Current value |
| --- | --- |
| Host | `aegis-prod` |
| Architecture | `aarch64` |
| Kernel | `6.17.0-1020-oracle` |
| Compute | 4 CPUs; 25,139,560,448 bytes RAM |
| Available memory | 19,611,447,296 bytes |
| Swap | 4,294,963,200 bytes total; unused |
| Root/Docker filesystem | 206,900,281,344 bytes total; 76,987,154,432 bytes available; 63% used |
| Primary OCI interface | `enp0s6`, MAC `02:00:17:01:8a:7a`, MTU 9000 |
| Primary private address | dynamic `10.0.0.234/24` from OCI DHCP |
| OCI gateway | `10.0.0.1` |
| Tailscale interface | `tailscale0`, `100.100.1.21/32`, `fd7a:115c:a1e0::8538:115/128` |

`enp0s6` is managed by Netplan/systemd-networkd from
`/etc/netplan/50-cloud-init.yaml`; the file enables DHCPv4 and matches the
interface MAC. Its baseline SHA-256 is
`072d46c980ab5e788bafcd2405b99ce5ca5313fbcca9e2e821c257a3a93696a1`.
Only `10.0.0.234/24` and link-local IPv6 were present on `enp0s6`. No candidate
Buzz secondary address was selected or assigned.

## Routes and listeners

The main table contains the OCI default route through `10.0.0.1`, connected
`10.0.0.0/24`, OCI metadata routes, and the existing Docker bridge routes. It
contains no Buzz-specific route. The only global IPv6 addresses are the
Tailscale address and link-local interface addresses; there is no public OCI
IPv6 address on the host.

Current relevant TCP listeners:

- `10.0.0.234:80` and `10.0.0.234:443`: Docker proxy for existing Nginx;
- `100.100.1.21:443`: existing Tailscale Serve;
- `100.100.1.21:13005`: existing `ob1-mcp` host binding;
- `0.0.0.0:22` and `[::]:22`: SSH;
- `127.0.0.1:5433` and `127.0.0.1:9090`: existing local-only services; and
- `*:8090`: existing Hermes provisioner process.

No Buzz listener, port binding, container, Docker network, or volume exists.

Post-inspection baseline digests:

| Surface | SHA-256 |
| --- | --- |
| normalized host addresses | `a231d7cbf654e1c2c8fbcf6904bd1d44c21c0b0b3df74194b77fc3503e2c1421` |
| main IPv4/IPv6 routes | `1b4e8127c58cd5000a99138ae76892f5fd4082664a6224e6768d9309489cc247` |
| TCP listener set | `8dcd738cda0fc6a3f5e6d38553079347255cefa3587a98986373f57bc5c9da5b` |

## Docker and service health

Docker uses `overlayfs` on `/var/lib/docker` and reports 4 CPUs and
25,139,560,448 bytes memory. It currently holds 48.22 GB of images, 205.2 MB of
containers, 28.62 GB of local volumes, and 26.09 GB of build cache. No cleanup
was performed.

Nineteen containers are running. Fifteen report healthy. Four have no Docker
health check: `overnightdesk-nginx`, `overnightdesk-ops`, `ob1-mcp`, and
`guardian-db`. No container is unhealthy, restarting, paused, or exited.
Additional content-free checks established:

- both `overnightdesk-ops` health endpoints returned HTTP 200;
- `guardian-db` accepted PostgreSQL connections;
- the existing public Aegis Nginx route returned its expected HTTP 302; and
- the local `ob1-mcp` handler returned HTTP 401, proving the handler responds
  without treating unauthenticated access as success.

The normalized container state/health/restart/port-binding digest is
`8bf3ab90d0747d03bd26ebeecd02a8f97fb6ba9572cd70d76dec9bd7e50dbc4f`.
`overnightdesk-nginx` has five lifetime restarts and
`overnightdesk-communication-module` has one; both have been up for six days
and no current restart loop was observed.

Existing Docker networks are `bridge`, `host`, `none`, internal
`control-tower_control-tower-internal` (`172.18.0.0/16`), empty
`overnightdesk_default` (`172.20.0.0/16`), and
`overnightdesk_overnightdesk` (`172.19.0.0/16`, 19 containers). The planned
`buzz-ingress`, `buzz-data`, and `buzz-agents` networks are absent.

## Nginx

| Fact | Current value |
| --- | --- |
| Container | `overnightdesk-nginx` |
| Configured image reference | mutable `nginx:1.29-alpine` |
| Running image ID/repository digest | `sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de` |
| Image architecture | `arm64` |
| Runtime version | Nginx 1.29.8; OpenSSL 3.5.6 |
| Restart policy | `unless-stopped` |
| Host bindings | `10.0.0.234:80->80`, `10.0.0.234:443->443` |
| Docker network | `overnightdesk_overnightdesk` only |
| Config mounts | host certificate and Nginx config trees mounted read-only |
| Rendered config validation | `nginx -t` successful |
| Rendered config SHA-256 | `a76ee81ecadcec427191b48b368a8020a852857273e07678b7b163518563e4b8` |

The build includes HTTP SSL, HTTP/2, HTTP/3, WebSocket-compatible HTTP proxy,
stream, stream SSL, and SNI-preread support. Existing server blocks listen on
container ports 80/443 and name only existing production hosts. There is no
`buzz.overnightdesk.com` server block or `buzz.conf`.

The managed reload method is a config validation followed by
`docker exec overnightdesk-nginx nginx -s reload`; the existing certificate
renewal unit uses that signal after successful renewal. The reload command was
not exercised during Gate 0 because it changes process state.

## Certificates and renewal

Eleven active certificate lineages exist under
`/opt/overnightdesk/certbot/conf/live`. None includes
`buzz.overnightdesk.com`. Existing renewal files use Let's Encrypt ECDSA
certificates and the `webroot` authenticator. The managed
`overnightdesk-certbot-renew.timer` invokes a Docker Compose Certbot one-shot
and reloads Nginx after success.

The host Certbot installation is 2.9.0 and exposes only the core Python
packages; no DNS provider plugin was found. Therefore the required DNS-01
issuance and automated renewal path is not currently installed or proven.
Selecting such a path belongs to T059/T062 and may introduce a new qualified
dependency and secret scope.

## Backup baseline

`aegis-backup-producer.service` last completed successfully from
`2026-09-01T13:56:35Z` to `2026-09-01T13:57:17Z`:

- `Result=success`, `ExecMainStatus=0`;
- set `set-20260901T135635Z`;
- 64 artifacts;
- 689,390,615 encrypted bytes; and
- terminal `set_complete` event.

The next scheduled timer run is `2026-09-05T06:00:00Z`. This baseline does not
cover future Buzz PostgreSQL or MinIO state.

## Decision

The existing host has no immediate health or capacity blocker for continued
local design work. This is not capacity reservation or deployment approval.
T058 is complete. T059 and T060 now provide the corresponding OCI and accepted
tailnet-policy baselines; candidate selection remains a documentation-only
Gate 0 decision and does not authorize assignment.
