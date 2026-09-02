# Research: Buzz Private Pilot on Aegis

**Original assessment**: 2026-09-01

**Design reconsideration**: 2026-09-02

**Detailed assessment**: [Buzz on Aegis feasibility](../../docs/research/buzz-aegis-feasibility.md)

## Current Decisions

### Requalify immutable ARM64 artifacts

**Decision**: Revalidate and pin the Buzz source, relay wrapper, Desktop/client
behavior, Hermes intake worker, PostgreSQL, Redis, MinIO, initializer, and every other
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
no public NAT path. Under separate production approval, assign that exact
secondary private IP to the approved OCI VNIC and intended host interface and
prove local binding before enabling Nginx or advertising it. If Nginx is
containerized, map its internal Buzz listener port only on that assigned
private host address.

**Rationale**: This removes the unqualified upstream image that blocked the old
plan while retaining the already operated TLS proxy. Listener separation, not
DNS obscurity, prevents public clients from selecting Buzz with a forged SNI or
Host header.

**Rejected**: A Buzz vhost on the public `10.0.0.234:443` listener, reliance on
no public DNS record, direct relay port publication, or bundled Caddy.

### Preserve the tailnet boundary with an exact host route

**Decision**: Have the existing Aegis Tailscale node advertise only the selected
and locally assigned private listener address as `/32`. Accept the existing
tailnet-wide policy for the bounded pilot because the owner controls the five
visible devices. Make Buzz's closed-relay roster—not a second Tailscale grant—
the participant boundary for the owner and three named Hermes identities.
Capture and compare existing VNIC/interface addresses, advertised routes,
compiled policy digest, node identity, and Serve configuration before, during,
and after the experiment.

**Rationale**: The current policy already permits all tailnet devices to all
destinations, all visible devices share the owner's user identity, and grants
are additive. A narrow Buzz grant would add complexity without constraining the
existing broad rule. Tailnet routing still prevents public transport access;
NIP-42/NIP-98 and distinct relay membership determine application access.

**Rejected**: Funnel, a broad subnet route, changing the existing Serve root,
or redesigning/tagging the tailnet before a participant outside the approved
owner-controlled device set exists.

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

### Preserve distinct canonical WebSocket and NIP-98 URLs through the proxy

**Decision**: Use byte-exact `wss://buzz.overnightdesk.com` for every WebSocket
relay consumer and signed relay tag. NIP-98 instead uses the distinct origin
`https://buzz.overnightdesk.com`; Gate 0 freezes each supported literal method
and full URL, including raw path and query, before fixtures are built. Neither
external form includes an explicit default `:443` port. Nginx must preserve
Host, method, raw path, raw query ordering/encoding, WebSocket upgrade, NIP-98
`Authorization`, and the external HTTPS scheme, strip unrelated cookies, and
perform no URI rewrite. Contract tests must complete signed NIP-42 and every
frozen NIP-98 flow through Nginx.

**Rationale**: Buzz's signed event model binds behavior to the relay URL.
Upstream issue #6281 reports that a colocated agent cannot safely use an
alternate internal target when TCP destination, Host, and signed relay tag
diverge. A successful WebSocket upgrade does not prove the signed protocol.

**Rejected**: Direct agent-to-relay access, alternate internal hostnames, or a
transport-only `101` check.

### Split connectivity into three networks

**Decision**:

- `buzz-ingress`: Nginx and relay only.
- `buzz-data`: relay, PostgreSQL, Redis, and MinIO only.
- `buzz-agents`: Nginx and the Walter, Titus, and Mitchel/Trevor intake workers only.

**Rationale**: A single Buzz network would unnecessarily expose stores to
Nginx. Putting an intake worker and relay together would allow an agent to bypass the
canonical ingress contract.

### Admit three named Hermes agents in stages

**Decision**: Give Walter, Titus, and Mitchel/Trevor separate Nostr identities
and read/write membership in one pilot channel. Qualify one selected agent as
the canary, then admit the other two one at a time. Automated responses are
initially triggered only by the owner; bot-authored messages may be read as
context but do not trigger another bot. Each route-specific intake worker
accepts only the exact signed owner and channel, calls the matching authenticated
Hermes Runs API, retains that runtime's existing authority/approval policy, and
is independently revocable.

**Rationale**: Agent participation is the product value being evaluated.
Separate identities preserve attribution and revocation, while owner-only
triggers, signature/channel checks, and the existing human-approval boundary
prevent response loops or a chat message from bypassing production-action
authority.

**Rejected**: A single shared bot key, read-only agents that cannot respond,
simultaneous three-agent admission, bot-to-bot-triggered automation, or mapping
Buzz membership directly to existing Hermes tool authority.

### Keep recovery authority explicit

**Decision**: PostgreSQL and MinIO are the coherent authoritative backup set.
Redis is diagnostic/cache state and Git scratch is reproducible. The old
Tailscale sidecar state is removed from the recovery model; private listener
and route metadata are recreated through an explicitly approved configuration,
not restored as identity state. The existing tailnet policy is not changed by
the Buzz lifecycle.

### Use gated, listener-first rollback control

**Decision**: Install disabled, validate `nginx -t`, reload rather than restart,
and require current local/protocol/recovery proof before owner admission.
Rollback disables the private listener first, proves unreachability, withdraws
the exact route when authorized, removes only the Buzz host-interface and
OCI VNIC secondary-address assignment, preserves workload state, and verifies
all pre-existing OCI, host, Nginx, and Tailscale behavior.

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
  Docker networking, Tailscale route, policy, Serve, capacity, and backup state;
- a safe, unassigned private listener address with no public path plus an exact,
  reversible OCI VNIC and host-interface assignment/removal procedure;
- exact DNS-01 certificate issuance/renewal and private resolution mechanics;
- `/32` route coexistence without changing the existing policy or Serve handler;
- complete Desktop NIP-42 behavior at the exact WebSocket relay URL and NIP-98
  behavior for frozen exact method/full-HTTPS-URL pairs through the proposed
  Nginx configuration; and
- current image/source/client/intake-worker qualification and resource measurements.

Each item is a gate with an executable check, not permission to assume or
deploy.
