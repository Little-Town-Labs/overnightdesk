# Implementation Plan: Buzz Private Pilot on Aegis

**Branch**: `042-buzz-private-pilot` | **Revised**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Plan status**: Gate 0 image and object-store evidence is active; no
implementation or production action is authorized.

## Summary

Replace the rejected dedicated Tailscale-container ingress with a private-only
listener in the existing qualified Nginx process. The listener binds to a
freshly verified secondary private address only after that exact address is
assigned to the approved OCI VNIC and intended Aegis host interface. It is then
reachable through an exact `/32` subnet route advertised by the host's existing
Tailscale node. The pilot accepts the current tailnet-wide transport policy;
Buzz's closed-relay membership admits only the owner and three separately
identified Hermes agents.

Nginx terminates DNS-01 TLS for `buzz.overnightdesk.com` and proxies the exact
canonical HTTPS/WSS traffic to the relay. It does not apply OvernightDesk
`auth_request`; Buzz Desktop and the Hermes intake workers authenticate through
NIP-42/NIP-98 and closed-relay membership. Public wildcard DNS may resolve the
hostname to Aegis, but only private resolution reaches the dedicated listener
and the public listener cannot select the Buzz virtual host.

The existing Nginx container is not recreated and receives no new Docker port
publication. Nginx listens on a fixed `buzz-ingress` bridge address at internal
port `8443`; the host's existing `systemd-socket-proxyd` forwards raw TCP from
the selected private `:443` address. Starting and stopping that socket controls
external reachability. Intake workers reach the same canonical TLS virtual host
at Nginx's fixed `buzz-agents:443` endpoint. Neither endpoint is exposed on the
shared/public network, and Nginx configuration remains reload-only.

Three Buzz-specific Docker networks enforce least connectivity:

```text
owner-controlled tailnet device
  -> Tailscale exact /32 route under the existing tailnet policy
  -> private host address:443
  -> systemd raw-TCP socket proxy
  -> existing Nginx process (fixed buzz-ingress address:8443)
       -> relay -> buzz-data -> PostgreSQL / Redis / qualified S3 store

Walter / Titus / Mitchel intake workers
  -> buzz-agents -> canonical Nginx address:443 -> relay
  -> buzz-agents -> fixed Nginx egress broker
       -> existing network -> exact named Hermes capabilities/runs/status API
```

The old sidecar evidence remains historical. Every upstream/image/host fact is
revalidated before build work, and production proceeds only through explicit,
reversible gates.

## Delivery Classification

- **Context**: Brownfield
- **Scale**: System
- **Risk**: Production and security-boundary sensitive
- **Accountability**: Sol owns architecture, integration, production mutation,
  and final quality. Production-related delegated work is read-only only.
- **GitHub**: Issue #249 is open and its ADR-008 scope and Engineering Delivery
  project 4 fields were synchronized before PR #250 merged.
- **Workspace**: Feature artifacts use dedicated worktrees; Git publication and
  production mutation remain separate authorization boundaries.

## Technical Context

- Docker Compose, Nginx, Bash lifecycle helpers, Python contract tests, and
  three separately supervised route-specific Hermes intake workers, plus
  hardened systemd socket/proxy units using the host's existing systemd binary.
- Existing Aegis host Tailscale node and Nginx image/process; no new Tailscale
  container, identity, state, or certificate automation.
- Existing OCI VNIC plus an approval-bound secondary private IP and matching
  host-interface assignment; no new public IP or public NAT path.
- Immutable ARM64 Buzz relay wrapper, PostgreSQL, Redis, selected S3-compatible
  object store and initializer, and Hermes intake images, all freshly qualified
  before use.
- DNS-01 certificate for the canonical hostname and private resolution
  overrides; public wildcard resolution is not an access-control boundary.
- PostgreSQL and the selected qualified object store form the coherent
  authoritative recovery set. Redis is diagnostic/cache state and Git scratch
  is reproducible.

## Source and Brownfield Findings

Targeted repository reads confirm the existing authorization seam cannot be
reused for Buzz:

- `verify-tenant` requires a Better Auth session and exact platform hostname.
- dashboard authorization resolves a running platform instance, enabled
  dashboard auth, OIDC client, and canonical runtime/use-case.
- `verify-workspace` is scoped to Open WebUI deployments.

Buzz Desktop provides neither the platform session cookie nor that runtime
model. Creating a fake instance would couple an external Nostr protocol to an
unrelated authorization contract. The transport boundary therefore remains
the tailnet-routed `/32`, with NIP-42/NIP-98 membership as the participant
boundary.

The accepted AgentMail intake pattern proves that one route-configured worker
can call an exact authenticated Hermes `/v1/runs` endpoint while preserving
Hermes tools, memory, model routing, and human approval policy. Buzz reuses only
that narrow routing pattern—not AgentMail's dirty/clean database path—because
automated Buzz responses accept only the exact signed owner and pilot channel.
One worker per named runtime enforces exact runtime mapping, idempotency, and no
authority to approve a Hermes action.

Upstream issue #6281 also indicates that alternate internal agent targeting
can diverge from the relay URL signed in Buzz events. Every intake worker must use the
same canonical Nginx URL as Desktop, not a direct relay address.

Gate 0 image and upstream review also confirms that object-store compatibility
is an application contract, not a vendor label. The historical MinIO/`mc`
images fail the new-deployment maintenance and image gates. Garage v2.3.0 lacks
conditional writes and object-version APIs used by Buzz. Open Buzz issues
document conditional-write failures on GCS and Ceph and range-read failure on
R2; no open issue establishes a supported no-S3 mode. ADR-009 therefore keeps
S3 storage required, rejects probe-disable as a correctness waiver, and names
RustFS only as the next candidate for complete disposable qualification.
The staged acceptance contract is
[`contracts/object-store.md`](contracts/object-store.md): T057 admits only a
provisional candidate from current image and documented-capability evidence;
T070 and T081 must prove the exact Buzz operations before final selection.

## Architecture Decisions

### Private listener, not merely private DNS

Absence of public DNS is insufficient: a public client can address the known
public IP and supply SNI/Host. Buzz must be absent from every public Nginx
listener. Docker host-port publications are immutable for the life of the
container, so the shared Nginx container receives no new publication and is not
recreated. Instead, Nginx joins `buzz-ingress` at a fixed bridge address and
listens there on `8443`. It also serves the same canonical TLS virtual host on
its fixed `buzz-agents` address at `443` for intake workers. A hardened systemd
socket bound only to the selected private host address at `443` invokes
`systemd-socket-proxyd` to forward raw TCP to the `buzz-ingress` endpoint. This
preserves TLS/SNI bytes, makes public
`:443` unable to select Buzz, and gives ingress an independently stoppable host
listener.

The exact address is deliberately not hard-coded in planning. Preflight must
prove it is unassigned, valid for the intended VNIC/interface, absent from
public NAT/route/security-list paths, and safe to remove. Gate 2 must assign
that exact secondary private IP to the approved OCI VNIC and intended host
interface, verify the resulting local address and bind, and only then enable
the listener or advertise the route. Assignment and removal commands, resource
identifiers, both fixed Nginx bridge listener addresses, systemd unit contents,
pre-state, and post-state are frozen before execution.

### Tailnet reachability and Buzz membership are separate controls

The host advertises only the selected, locally assigned address as `/32`. Route
approval/injection makes it reachable from the current tailnet. The pilot
explicitly accepts that all owner-controlled tailnet devices can reach the
listener under the existing broad policy; no Buzz-specific policy, grant, tag,
or Tailscale API credential is introduced. Separate Buzz identities and
closed-relay membership determine who can subscribe, read, or write. The
current Serve root, policy, and all pre-existing addresses and routes remain
unchanged.

### Canonical protocol contract

The relay, Desktop, Hermes intake workers, tests, and signed relay tags all use the
byte-exact WebSocket relay URL `wss://buzz.overnightdesk.com`. NIP-98 instead uses the
HTTPS origin `https://buzz.overnightdesk.com`; each supported operation freezes
an exact method and full URL where `NIP98_FULL_URL` equals
`NIP98_HTTPS_ORIGIN + RAW_REQUEST_TARGET`. `RAW_REQUEST_TARGET` begins with the
absolute path and includes the exact `?` plus raw query when present. Neither
external URL form includes an explicit default `:443` port. The Gate 0 manifest
records literal method/URL pairs, not templates, before fixtures are
implemented.

Nginx preserves method, raw path, raw query ordering/encoding, Host, WebSocket
`Upgrade`/`Connection`, NIP-98 `Authorization`, and external HTTPS semantics.
It strips unrelated cookies and performs no URI rewriting.

Acceptance requires complete signed NIP-42 challenge/auth/subscription and
NIP-98 HTTP operations through Nginx. A `101 Switching Protocols` response by
itself is not acceptance.

### Network and state isolation

- `buzz-ingress`: internal bridge with Nginx and relay only.
- `buzz-data`: internal bridge with relay, PostgreSQL, Redis, and the selected
  qualified object store only.
- `buzz-agents`: internal bridge with Nginx and the three Hermes intake workers
  only; Nginx owns the `buzz.overnightdesk.com` network alias.

No store publishes a host port. Nginx cannot address stores; no Hermes intake
worker can address relay, stores, the shared production network, or unrelated
services directly. Nginx is already attached to the production network and
acts as a fixed-target egress broker: named routes expose only Hermes
capabilities, run submission, and run status; forward the runtime-bound bearer
credential to one fixed upstream; and deny all other methods, paths, redirects,
variable upstreams, and cross-runtime credentials. Run-status paths accept only
IDs matching `^run_[0-9a-f]{32}$`; query strings and approval-response paths are
denied. Each worker has a unique
Nostr identity, is initially owner-triggered in one channel, and cannot approve
or widen the runtime's existing tool policy. Secrets are projected at runtime
and never stored in Compose, Git, logs, or evidence. The owner's private key
stays on the client.

## Delivery Gates

### Gate 0 — Reactivation and current-fact freeze

Read-only work: synchronize the reopened Issue/Project metadata when approved;
refresh upstream/source/client/image facts; inventory live Nginx, Tailscale,
OCI routing, addresses, certificates, backup health, and capacity; select no
private address until evidence passes.

### Gate 1 — Local contracts

Write failing contracts first, then render and test the minimum Nginx/Compose
topology with synthetic identities. Prove public-listener non-selection,
network isolation, canonical NIP-42/NIP-98 flows, per-agent identity and
owner-trigger policy, safe telemetry, image policy, and socket-first rollback
ordering without touching Aegis.

### Gate 2 — Production route-coexistence experiment

With explicit production approval and no admitted Buzz identity, assign the
selected secondary private IP to the approved OCI VNIC and intended host
interface, prove local bind and public denial, advertise and approve the exact
`/32`, reload the validated internal Nginx listener, start the exact private
systemd socket, exercise the protocol probe under the unchanged tailnet-wide
policy, then stop the socket first and fully withdraw the experiment. Diff
VNIC, interface, route, policy digest, Serve, Nginx container identity, systemd
listener, and service baselines before and after.

### Gate 3 — Disabled Aegis installation and recovery

Install the isolated stack with ingress disabled. Recheck hardening, capacity,
logs, restart behavior, encrypted coherent backup, disposable restore, and
socket-first rollback.

### Gate 4 — Owner-only qualification

After the Gate 2 experiment and Gate 3 rollback rehearsal have removed the
secondary address, repeat the approved VNIC/host-interface assignment and exact
local-bind/public-denial proof. Then enable only its private route/listener,
admit only the owner, execute collaboration, denial, reconnect, restart, and
load checks, and leave all Hermes intake workers disabled.

### Gate 5 — First Hermes canary qualification

Select one of Walter, Titus, or Mitchel/Trevor; create its distinct read/write
Buzz identity; route its intake only through canonical Nginx to the mapped
Hermes Runs API; admit it to the owner and pilot channel; test
bounded, owner-triggered behavior plus existing tool/approval enforcement; and
prove that revocation rejects unsubmitted/future work and suppresses late
results without claiming cancellation of an already-submitted Hermes run.

### Gate 6 — Remaining Hermes agents

Create distinct identities for the remaining two named Hermes agents and admit
them one at a time only after the canary passes. Each must pass the same
identity, network, trigger, authority, deduplication, and revocation
contract.

### Gate 7 — Seven-day decision

Observe without expanding beyond the owner, three named agents, one pilot
channel, current route, or existing Hermes authority. Record one
decision: continue bounded, pause disabled, roll back, or propose a separately
scoped expansion.

## Activation and Rollback

Activation is disabled-first:

1. Install the inactive private Nginx include, disabled systemd socket/proxy
   units, and stack.
2. Validate rendered Compose and `nginx -t`.
3. Pass recovery and rollback prerequisites.
4. With approval, assign the exact secondary private IP to the approved OCI
   VNIC and intended host interface; prove the exact local address, bind, and
   absence of a public path.
5. Advertise/approve the exact `/32` without changing the tailnet policy.
6. Enable the internal Buzz include/listener and reload Nginx without
   recreating its container.
7. Start only the Buzz private systemd socket proxy.
8. Run canonical positive and negative protocol checks.

Rollback is socket-first:

1. Stop the exact Buzz systemd socket proxy.
2. Prove canonical Buzz ingress is unreachable from every test class.
3. Remove the exact Buzz include/listener, run `nginx -t`, and reload without
   recreating Nginx.
4. With approval, withdraw only the exact Buzz `/32` route.
5. Confirm no listener or route uses the Buzz address, then remove only its host
   interface and OCI VNIC secondary-address assignments.
6. Stop Hermes intake workers and workload while preserving authoritative state.
7. Compare existing OCI VNIC addresses, host interfaces, Nginx vhosts and
   container identity, Tailscale Serve, routes, systemd listeners, containers,
   and health to the signed baseline.

No rollback step restarts Nginx, overwrites unrelated configuration, restores
Tailscale node state, or deletes Buzz data.

## Observability and Evidence

Capture content-free outcome classes and measurements for private reachability,
public denial, route/policy state, Nginx config/reload, NIP-42/NIP-98 success or
failure class, service health, resource ceilings, coherent backup/restore, and
per-agent authority denials. Evidence binds to exact config/image digests and
contains no headers, cookies, keys, authorization values, or message bodies.

## Project Structure

```text
infra/buzz/
├── compose.yml
├── compose.aegis.yml
├── nginx/
├── agents/
├── systemd/
├── tests/
├── backup-buzz.sh
├── restore-rehearsal.sh
├── deploy-aegis.sh
└── rollback.sh

specs/042-buzz-private-pilot/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
├── evidence/
├── quickstart.md
└── tasks.md

docs/
├── decisions/008-buzz-private-nginx-ingress.md
└── runbooks/buzz-private-pilot.md
```

`infra/buzz/` owns the named workload and its deterministic lifecycle. The
existing shared Nginx deployment remains the ingress-process owner; Buzz adds
only a separately validated include/listener and narrowly scoped Docker network
attachments. Durable decision, execution, and evidence truth stays in the
listed ADR, runbook, Spec Kit artifacts, and later approval-bound deployment
records.

## Constitution Check

The plan is fail-closed, approval-bound, least-connectivity, identity-separated,
recoverable, observable, and reversible. It reuses a qualified ingress process
without reusing an incompatible authentication contract. The owner-approved
scope adds only three named Hermes participants, each with a distinct identity
and route-specific intake boundary. No public interface, schema, customer tenant,
or generalized agent integration is added.

## Complexity Tracking

The private systemd socket plus exact `/32` route is the smallest design that
retains tailnet-only transport without the unqualified sidecar image or a
shared-Nginx container recreation. Accepting the current tailnet policy avoids
a second authorization system; Buzz membership owns participant access. The
three-network split and fixed Nginx Hermes egress broker are justified by
concrete reachability requirements, and the staged canary prevents simultaneous
rollout to all three agents.
