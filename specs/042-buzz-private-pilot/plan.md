# Implementation Plan: Buzz Private Pilot on Aegis

**Branch**: `042-buzz-private-pilot` | **Revised**: 2026-09-02 | **Spec**: [spec.md](spec.md)

**Plan status**: Issue #249 reopened for planning on 2026-09-02; no
implementation or production action is authorized.

## Summary

Replace the rejected dedicated Tailscale-container ingress with a private-only
listener in the existing qualified Nginx process. The listener binds to a
freshly verified private Aegis address and is reachable through an exact `/32`
subnet route advertised by the host's existing Tailscale node. A separate
deny-by-default grant admits only approved owner devices.

Nginx terminates DNS-01 TLS for `buzz.overnightdesk.com` and proxies the exact
canonical HTTPS/WSS traffic to the relay. It does not apply OvernightDesk
`auth_request`; Buzz Desktop authenticates through NIP-42/NIP-98 and closed
relay membership. There is no public DNS record or public listener path to the
Buzz virtual host.

Three Docker networks enforce least connectivity:

```text
approved owner device
  -> Tailscale exact /32 route and owner-device grant
  -> private host address:443
  -> existing Nginx process (dedicated private listener)
       -> buzz-ingress -> relay -> buzz-data -> PostgreSQL / Redis / MinIO
       -> buzz-canary  -> canary (canonical URL only)
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
- **GitHub**: Issue #249 is open. Its body and Engineering Delivery project 4
  fields still require explicit synchronization with this revised plan.
- **Workspace**: Existing dedicated worktree and branch; no remote mutation.

## Technical Context

- Docker Compose, Nginx, Bash lifecycle helpers, Python contract tests, and a
  separately supervised canary adapter.
- Existing Aegis host Tailscale node and Nginx image/process; no new Tailscale
  container, identity, state, or certificate automation.
- Immutable ARM64 Buzz relay wrapper, PostgreSQL, Redis, MinIO, and canary
  images, all freshly qualified before use.
- DNS-01 certificate for the canonical hostname and private-only name
  resolution; no public A/AAAA record.
- PostgreSQL and MinIO form the coherent authoritative recovery set. Redis is
  diagnostic/cache state and Git scratch is reproducible.

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
tailnet routing/grants, with NIP-42/NIP-98 as the application boundary.

Upstream issue #6281 also indicates that alternate internal canary targeting
can diverge from the relay URL signed in Buzz events. The canary must use the
same canonical Nginx URL as Desktop, not a direct relay address.

## Architecture Decisions

### Private listener, not merely private DNS

Absence of public DNS is insufficient: a public client can address the known
public IP and supply SNI/Host. Buzz must be absent from every public Nginx
listener. If Nginx remains containerized, its dedicated internal Buzz port is
published only on the selected private host address; public `:443` cannot
select that server block.

The exact address is deliberately not hard-coded in planning. Preflight must
prove it is unassigned, local to the intended interface, absent from public
NAT/route/security-list paths, and safe to withdraw.

### Route and grant are separate controls

The host advertises only the selected address as `/32`. Route approval/injection
makes it reachable; a deny-by-default grant separately limits source devices.
Both are required, and their existing-state baselines are independently
captured and compared. The current Serve root and all pre-existing advertised
routes must remain unchanged.

### Canonical protocol contract

The relay, Desktop, canary, and tests all use
`wss://buzz.overnightdesk.com:443`. Nginx preserves method, path, query, Host,
WebSocket `Upgrade`/`Connection`, NIP-98 `Authorization`, and external HTTPS
semantics. It strips unrelated cookies and performs no URI rewriting.

Acceptance requires complete signed NIP-42 challenge/auth/subscription and
NIP-98 HTTP operations through Nginx. A `101 Switching Protocols` response by
itself is not acceptance.

### Network and state isolation

- `buzz-ingress`: Nginx and relay only.
- `buzz-data`: relay, PostgreSQL, Redis, and MinIO only.
- `buzz-canary`: Nginx and canary only.

No store publishes a host port. Nginx cannot address stores; the canary cannot
address relay or stores directly. Secrets are projected at runtime and never
stored in Compose, Git, logs, or evidence. The owner's private key stays on the
client.

## Delivery Gates

### Gate 0 — Reactivation and current-fact freeze

Read-only work: synchronize the reopened Issue/Project metadata when approved;
refresh upstream/source/client/image facts; inventory live Nginx, Tailscale,
OCI routing, addresses, certificates, backup health, and capacity; select no
private address until evidence passes.

### Gate 1 — Local contracts

Write failing contracts first, then render and test the minimum Nginx/Compose
topology with synthetic identities. Prove public-listener non-selection,
network isolation, canonical NIP-42/NIP-98 flows, safe telemetry, image policy,
and route-first lifecycle ordering without touching Aegis.

### Gate 2 — Production route-coexistence experiment

With explicit production approval and no admitted Buzz identity, advertise and
approve the selected `/32`, apply the exact owner-device grant, exercise the
disabled private listener/protocol probe, then fully withdraw the experiment.
Diff route, grant, Serve, Nginx, and service baselines before and after.

### Gate 3 — Disabled Aegis installation and recovery

Install the isolated stack with ingress disabled. Recheck hardening, capacity,
logs, restart behavior, encrypted coherent backup, disposable restore, and
route-first rollback.

### Gate 4 — Owner-only qualification

Enable the private route/listener, admit only the owner, execute collaboration,
denial, reconnect, restart, and load checks, then leave the canary disabled.

### Gate 5 — Canary qualification

Create a new tool-free canary identity, route it only through canonical Nginx,
admit it to one owner/channel, test bounded and adversarial behavior, and prove
revocation.

### Gate 6 — Seven-day decision

Observe without expanding users, routes, tools, data classes, or authority.
Record one decision: continue bounded, pause disabled, roll back, or propose a
separately scoped expansion.

## Activation and Rollback

Activation is disabled-first:

1. Install the inactive private listener include and stack.
2. Validate rendered Compose and `nginx -t`.
3. Pass recovery and rollback prerequisites.
4. With approval, advertise/approve the exact `/32` and apply the exact grant.
5. Enable only the Buzz private include/listener and reload Nginx.
6. Run canonical positive and negative protocol checks.

Rollback is route-first:

1. Disable the exact Buzz include/listener, run `nginx -t`, and reload.
2. Prove canonical Buzz ingress is unreachable from every test class.
3. With approval, withdraw only the Buzz grant and exact `/32` route.
4. Stop canary and workload while preserving authoritative state.
5. Compare existing Nginx vhosts, Tailscale Serve, routes, containers, and
   health to the signed baseline.

No rollback step restarts Nginx, overwrites unrelated configuration, restores
Tailscale node state, or deletes Buzz data.

## Observability and Evidence

Capture content-free outcome classes and measurements for private reachability,
public denial, route/grant state, Nginx config/reload, NIP-42/NIP-98 success or
failure class, service health, resource ceilings, coherent backup/restore, and
canary authority denials. Evidence binds to exact config/image digests and
contains no headers, cookies, keys, authorization values, or message bodies.

## Project Structure

```text
infra/buzz/
├── compose.yml
├── compose.aegis.yml
├── nginx/
├── canary/
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
without reusing an incompatible authentication contract. No public interface,
schema, tenant boundary, or generalized integration is added. Current
uncertainties are explicit Gate 0 facts rather than hidden assumptions.

## Complexity Tracking

The private listener plus exact `/32` route is the smallest design that retains
tailnet-only transport without the unqualified sidecar image. The three-network
split is justified by concrete reachability requirements; no speculative proxy,
identity abstraction, or multi-community extension is introduced.
