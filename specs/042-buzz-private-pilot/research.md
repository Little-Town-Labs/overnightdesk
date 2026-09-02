# Research: Buzz Private Pilot on Aegis

**Original assessment**: 2026-09-01

**Design reconsideration**: 2026-09-02

**Detailed assessment**: [Buzz on Aegis feasibility](../../docs/research/buzz-aegis-feasibility.md)

## Current Decisions

### Requalify immutable ARM64 artifacts

**Decision**: Revalidate and pin the Buzz source, relay wrapper, Desktop/client
behavior, canary adapter, PostgreSQL, Redis, MinIO, initializer, and every other
new runtime image immediately before implementation. Require immutable ARM64
digests, provenance, SBOMs, accepted vulnerability dispositions, explicit
non-root execution, hardening, and reproducible startup.

**Rationale**: Buzz is pre-1.0 and the completed 2026-09-01 evidence is a
historical snapshot. The locally qualified Wolfi relay wrapper may remain the
candidate starting point, but it is not current production authorization.

**Rejected**: Mutable tags, building on Aegis, or treating a previous scan as a
permanent exception.

### Reuse Nginx on a private-only listener

**Decision**: Remove the dedicated Tailscale container from the proposed
topology. Use the existing qualified Nginx process with a Buzz server block
that is selectable only on a dedicated private listener address. Select the
address only after fresh host and OCI evidence proves it is unassigned and has
no public NAT path. If Nginx is containerized, map its internal Buzz listener
port only on that private host address.

**Rationale**: This removes the unqualified upstream image that blocked the old
plan while retaining the already operated TLS proxy. Listener separation, not
DNS obscurity, prevents public clients from selecting Buzz with a forged SNI or
Host header.

**Rejected**: A Buzz vhost on the public `10.0.0.234:443` listener, reliance on
no public DNS record, direct relay port publication, or bundled Caddy.

### Preserve the tailnet boundary with an exact host route and grant

**Decision**: Have the existing Aegis Tailscale node advertise only the selected
private listener address as `/32`. Approve/inject that route separately from a
deny-by-default grant permitting only approved owner devices to reach it.
Capture and compare the existing advertised-route set, grants, node identity,
and Serve configuration before, during, and after the experiment.

**Rationale**: Tailscale documents subnet route advertisement/approval and
access grants as distinct controls. This retains tailnet-gated transport
without adding a new Tailscale image, device, tag-owned state, or MagicDNS
hostname.

**Rejected**: Funnel, a broad subnet route, changing the existing Serve root,
or assuming route approval alone restricts source devices.

### Do not reuse OvernightDesk `auth_request`

**Decision**: Nginx must not invoke `verify-tenant`, `verify-workspace`, or an
equivalent Better Auth session check for Buzz.

**Rationale**: Targeted source reads show `verify-tenant` requires a platform
session and exact instance hostname; dashboard authorization requires a
running platform instance, active dashboard auth, and OIDC client; and
`verify-workspace` is scoped to Open WebUI. Buzz Desktop instead supplies
NIP-42 WebSocket and NIP-98 signed HTTP credentials. The platform subrequest
would reject the intended client before Buzz authentication.

**Rejected**: Creating a fake OvernightDesk runtime/instance to satisfy an
unrelated authorization model.

### Preserve one canonical relay URL through the proxy

**Decision**: Use `wss://buzz.overnightdesk.com` everywhere. Nginx must preserve
Host, method, path, query, WebSocket upgrade, NIP-98 `Authorization`, and the
external HTTPS scheme, strip unrelated cookies, and perform no URI rewrite.
Contract tests must complete signed NIP-42 and NIP-98 flows through Nginx.

**Rationale**: Buzz's signed event model binds behavior to the relay URL.
Upstream issue #6281 reports that a colocated agent cannot safely use an
alternate internal target when TCP destination, Host, and signed relay tag
diverge. A successful WebSocket upgrade does not prove the signed protocol.

**Rejected**: Direct canary-to-relay access, alternate internal hostnames, or a
transport-only `101` check.

### Split connectivity into three networks

**Decision**:

- `buzz-ingress`: Nginx and relay only.
- `buzz-data`: relay, PostgreSQL, Redis, and MinIO only.
- `buzz-canary`: Nginx and canary only.

**Rationale**: A single Buzz network would unnecessarily expose stores to
Nginx. Putting canary and relay together would allow the canary to bypass the
canonical ingress contract.

### Keep recovery authority explicit

**Decision**: PostgreSQL and MinIO are the coherent authoritative backup set.
Redis is diagnostic/cache state and Git scratch is reproducible. The old
Tailscale sidecar state is removed from the recovery model; private listener,
route, and grant metadata are recreated through an explicitly approved
configuration, not restored as identity state.

### Use gated, route-first lifecycle control

**Decision**: Install disabled, validate `nginx -t`, reload rather than restart,
and require current local/protocol/recovery proof before owner admission.
Rollback disables the private listener first, proves unreachability, withdraws
the exact grant/route when authorized, preserves workload state, and verifies
all pre-existing Nginx and Tailscale behavior.

## Current Sources

- [Buzz repository](https://github.com/block/buzz)
- [Buzz security policy](https://github.com/block/buzz/security)
- [Buzz testing and relay URL guidance](https://github.com/block/buzz/blob/main/TESTING.md)
- [Buzz NIP-AA relay-tag behavior](https://github.com/block/buzz/blob/main/docs/nips/NIP-AA.md)
- [Buzz issue #6281](https://github.com/block/buzz/issues/6281)
- [Tailscale subnet routers](https://tailscale.com/docs/features/subnet-routers)
- [Tailscale route injection](https://tailscale.com/docs/reference/route-injection)
- [Tailscale grants syntax](https://tailscale.com/docs/reference/syntax/grants)

These sources guide planning only. Gate 0 must refresh time-sensitive facts.

## Historical Decisions Retained for Audit

The 2026-09-01 plan selected a dedicated tag-owned Tailscale sidecar/device and
MagicDNS hostname. Local work qualified an exact-artifact Wolfi relay wrapper,
but the official Tailscale runtime image failed the vulnerability gate. The
initiative then closed without production mutation. That topology is
superseded, while its evidence remains under `evidence/` and ADR-007.

## Facts Still Requiring Proof

- the current Aegis interface, address, NAT, security-list, Nginx listener,
  Docker networking, Tailscale route, grant, Serve, capacity, and backup state;
- a safe, unassigned private listener address with no public path;
- exact DNS-01 certificate issuance/renewal and private resolution mechanics;
- `/32` route coexistence without changing the existing Serve handler;
- complete Desktop NIP-42 and NIP-98 behavior through the proposed Nginx
  configuration; and
- current image/source/client/canary qualification and resource measurements.

Each item is a gate with an executable check, not permission to assume or
deploy.
