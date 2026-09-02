# Feature Specification: Buzz Private Pilot on Aegis

**Feature Branch**: `042-buzz-private-pilot`

**Primary Issue**: [Little-Town-Labs/overnightdesk#249](https://github.com/Little-Town-Labs/overnightdesk/issues/249)

**Created**: 2026-09-01

**Reactivated for planning**: 2026-09-02

**Status**: Issue reopened for planning; implementation and production mutation are not authorized

## Reactivation Boundary

Issue #249 was closed on 2026-09-01 after research tasks T001-T009 and reopened
for planning on 2026-09-02. No Aegis, Phase, tailnet, registry, identity, route,
deployment, or remote Git state was changed. The old implementation tasks
T010-T054 were never executed.

This revision and the reopened Issue reactivate planning, not implementation or
deployment. The design supersedes the dedicated Tailscale-container topology
with a proposed private Nginx listener reached through an exact
host-advertised `/32` subnet route. Current upstream, image, host, route, and
protocol facts must be revalidated before implementation.

## Scope

### MVP

Privately and reversibly qualify one closed Buzz community on `aegis-prod` for
one human owner and one newly created, low-authority canary. The pilot must
prove that:

- only specifically authorized owner devices can reach the private ingress;
- Buzz enforces NIP-42/NIP-98 identity and closed-relay membership;
- the canonical Buzz URL works unchanged through Nginx for both WebSocket and
  signed HTTP traffic;
- stores, identities, secrets, backups, telemetry, and rollback remain
  isolated from existing workloads; and
- existing public Nginx routes and the host Tailscale Serve root remain
  unchanged.

### Non-Goals

- Public DNS, public-internet reachability, Funnel, or unauthenticated access.
- Reusing OvernightDesk `auth_request`; Buzz Desktop does not carry the Better
  Auth session cookie expected by those endpoints.
- A dedicated Buzz Tailscale container, node, hostname, tag, certificate, or
  state directory.
- Moving, replacing, or extending the existing `ob1-mcp` Tailscale Serve root.
- Customer, prospect, payment, outreach, regulated, or production business
  data.
- Reusing an existing human or agent identity, secret, memory, or tool scope.
- Admin UI, Git web UI, workflows, webhooks, large media, multi-community
  hosting, or generalized Hermes integration.
- Publishing a branch, changing Project fields, deploying, or changing routes
  without separate explicit authorization.

## Clarifications

### Session 2026-09-02

- The existing Nginx process may be reused only through a dedicated private
  listener that cannot select Buzz from the public OCI listener, even with a
  forged SNI or `Host` header.
- The exact private listener address is selected only after a current read-only
  host and OCI route/NAT preflight proves that it is unassigned and has no
  public path.
- The host's existing Tailscale node advertises exactly that address as a `/32`.
  Route advertisement/approval and a deny-by-default owner-device grant are
  distinct controls and must both pass.
- `wss://buzz.overnightdesk.com` is the canonical URL used by the relay,
  Desktop, tests, and canary. It has no public A/AAAA record and uses a DNS-01
  certificate.
- Nginx transports NIP-42 WebSocket and NIP-98 HTTP traffic without substituting
  OIDC. A successful upgrade alone is not sufficient protocol proof.
- Nginx, relay, stores, and canary use narrow networks so Nginx cannot reach
  data stores and the canary cannot bypass the canonical ingress.

No remaining clarification materially changes the MVP, architecture, security
boundary, or acceptance tests.

## User Scenarios and Testing

### User Story 1 — Owner Uses a Private Collaboration Space (P1)

An owner on an approved device can reach the canonical hostname, authenticate
with a client-held Nostr identity, and use the closed community. A public
client, an unapproved tailnet device, and an unadmitted Nostr identity cannot
read or write.

**Independent test**: Exercise complete NIP-42 and NIP-98 flows through Nginx,
then repeat from each denied network and identity class.

**Acceptance scenarios**:

1. **Given** an approved owner device and admitted owner identity, **when** the
   client uses the canonical URL, **then** signed WebSocket and HTTP actions
   succeed through Nginx.
2. **Given** a public or unapproved tailnet client, **when** it uses DNS, direct
   IP, SNI, or Host variations, **then** it cannot select or reach Buzz.
3. **Given** an unadmitted Nostr identity, **when** it connects or requests
   content, **then** Buzz denies subscription, read, and write without content
   disclosure.

### User Story 2 — Operator Qualifies and Recovers the Service (P1)

An operator can install the stack disabled, prove private routing and store
isolation, restore a coherent backup into an unrouted disposable environment,
and remove ingress first without affecting existing services.

**Independent test**: Compare pre/post baselines, perform an isolated restore,
enable then disable only the Buzz private listener, and prove Buzz becomes
unreachable while existing Nginx and Serve routes stay healthy.

**Acceptance scenarios**:

1. **Given** an exact disabled candidate, **when** qualification runs, **then**
   hardening, connectivity, capacity, recovery, and safe-evidence checks pass
   before any identity is admitted.
2. **Given** active private ingress, **when** route-first rollback runs, **then**
   Buzz becomes unreachable within five minutes, its data remains preserved,
   and existing services match baseline.

### User Story 3 — Low-Authority Canary Participates Safely (P2)

A new tool-free canary can respond only to the owner in one channel through
the canonical Nginx endpoint. Revocation cancels queued and future activity.

**Independent test**: Pass valid interactions and deny other callers,
channels, tools, direct relay/store access, duplicates, and post-revocation
work.

**Acceptance scenarios**:

1. **Given** the exact owner and channel, **when** the canary receives a valid
   request, **then** it returns one bounded response through canonical Nginx.
2. **Given** another caller/channel or a prohibited action, **when** a request
   arrives, **then** the canary refuses without tools or sensitive telemetry.
3. **Given** revoked canary authority, **when** queued, in-flight, or future
   work exists, **then** it is cancelled or terminated at the approved boundary.

### User Story 4 — Owner Makes an Evidence-Based Decision (P3)

After seven bounded days, the owner can continue, pause, roll back, or propose
a separately scoped expansion using safe evidence without implicitly granting
new authority.

**Independent test**: Review the seven daily evidence records and verify that
one decision is recorded without changing any unapproved authority.

**Acceptance scenario**: **Given** a complete observation window, **when** the
owner records a decision, **then** the live state and documentation match that
decision and no proposed expansion is automatically activated.

### Edge Cases

- The candidate private address is already assigned, routed publicly, selected
  by a wildcard listener, or reachable over IPv6: Gate 0 fails and no address
  is selected.
- The `/32` route works but the source grant does not deny another tailnet
  device: the experiment rolls back and cannot satisfy transport privacy.
- Nginx returns `101` but signed NIP-42 or NIP-98 fails because Host, URL,
  scheme, or headers changed: protocol qualification fails.
- DNS-01 renewal fails while the current certificate is valid: activation is
  blocked until renewal is proven; no HTTP challenge is opened.
- Existing route, Serve, or public-vhost state changes unexpectedly: stop,
  remove only the Buzz delta, and require human review.
- PostgreSQL succeeds but MinIO backup/restore fails: the set is incomplete and
  owner admission remains blocked.
- Redis is empty after recovery: the relay must safely rebuild diagnostic/cache
  state without treating it as authoritative loss.
- The canary resolves a direct relay/store target or canonical DNS bypasses
  Nginx: network qualification fails.
- Rollback cannot prove unreachability or baseline equivalence within five
  minutes: stop progression and preserve state for human diagnosis.

## Functional Requirements

- **FR-001**: Pin and requalify every new runtime image and upstream source by
  immutable ARM64 digest, provenance, SBOM, vulnerability disposition, and
  reproducible startup behavior.
- **FR-002**: Preserve completed research and qualification evidence as
  historical records; do not represent it as current production proof.
- **FR-003**: Publish no Buzz application, health, metrics, database, Redis,
  MinIO, or management port on a public interface.
- **FR-004**: Bind Buzz only to a dedicated private host listener address that
  fresh network evidence proves is unassigned and has no public NAT path.
- **FR-005**: Advertise exactly the selected private address as `/32` through
  the existing Aegis Tailscale node only after explicit approval.
- **FR-006**: Apply a separate deny-by-default Tailscale grant allowing only
  approved owner devices to reach the Buzz listener.
- **FR-007**: Leave the existing host Tailscale identity, advertised-route set,
  Serve root, and `ob1-mcp` handler unchanged except for the approved exact
  `/32` route operation.
- **FR-008**: Leave every existing public Nginx listener and virtual host
  behavior unchanged.
- **FR-009**: Prove public clients cannot select or reach Buzz by IP, SNI, Host,
  IPv4, or IPv6, regardless of public DNS absence.
- **FR-010**: Use `wss://buzz.overnightdesk.com` as the exact canonical relay
  URL across relay configuration, Desktop, canary, tests, and signed events.
- **FR-011**: Provide no public A/AAAA record for the canonical hostname and
  obtain its certificate without opening a public HTTP challenge path.
- **FR-012**: Preserve request path, method, query, Host, WebSocket upgrade,
  NIP-98 `Authorization`, and external HTTPS semantics through Nginx while
  removing unrelated cookies.
- **FR-013**: Do not invoke OvernightDesk `auth_request` or require a platform
  runtime/session for Buzz traffic.
- **FR-014**: Test a complete signed NIP-42 challenge/auth/subscription flow and
  NIP-98 HTTP flow through Nginx under the canonical URL.
- **FR-015**: Use three least-connectivity networks: Nginx+relay ingress,
  relay+stores data, and Nginx+canary egress.
- **FR-016**: Keep PostgreSQL and MinIO authoritative, Redis diagnostic,
  generated Git scratch disposable, and secrets external to Compose/evidence.
- **FR-017**: Create a coherent encrypted PostgreSQL+MinIO backup set and prove
  an isolated restore before owner admission.
- **FR-018**: Keep the owner's private key client-side and out of server secret
  stores, logs, configuration, and evidence.
- **FR-019**: Create a separate canary identity with no tools, one owner, one
  channel, one concurrent job, bounded output/time, deduplication, and explicit
  revocation.
- **FR-020**: Force canary traffic through the canonical Nginx endpoint; deny
  direct relay and store connectivity.
- **FR-021**: Install disabled first; require `nginx -t`, contract success,
  restore proof, rollback proof, safe evidence, and explicit approval at each
  production gate.
- **FR-022**: Activate and roll back with an include/listener change followed
  by an Nginx reload, never a process replacement or unrelated configuration
  rewrite.
- **FR-023**: Roll back route first, prove Buzz unreachable, preserve workload
  state, and compare all existing routes, listeners, and health checks to the
  baseline.
- **FR-024**: Emit content-free logs and metrics for availability, Nginx
  reload, route/grant state, protocol outcome class, recovery, capacity, and
  canary authority denials.
- **FR-025**: Keep combined CPU, memory, PIDs, disk, and connection use within
  an approved measured ceiling on the shared production host.
- **FR-026**: Require deterministic local contracts before matching production
  actions and retain redacted, digest-bound evidence for every gate.
- **FR-027**: Treat Issue/Project updates, route/grant changes, secret creation,
  deployment, admission, and pilot expansion as separate approval-bound
  actions.

### Key Entities

- **Pilot workload**: exact candidate, lifecycle state, limits, approvals, and
  rollback handle.
- **Private ingress route**: selected address, `/32`, advertising node, route
  approval, owner-device grant, and baseline digests.
- **Ingress configuration**: private listener, canonical hostname, certificate
  reference, config digest, public-denial proof, and protocol proof.
- **Community and identity**: one closed community, distinct public identities,
  memberships, and client/external secret custody.
- **Agent authority profile**: the canary's caller/channel/network/tool/resource
  allowlist and revocation state.
- **Recovery set and qualification run**: exact artifacts, safe checks,
  approvals, restore measurements, and gate result.
- **Pilot decision**: evidence-backed bounded outcome that grants no authority
  by itself.

## Success Criteria

- **SC-001**: All local contracts pass for the exact candidate digests and
  rendered topology before any production mutation.
- **SC-002**: Approved owner devices complete NIP-42 and NIP-98 through the
  canonical Nginx endpoint.
- **SC-003**: Public and unapproved tailnet clients have zero successful Buzz
  connections, including forged-IP/SNI/Host attempts.
- **SC-004**: Unadmitted identities have zero successful subscriptions, reads,
  or writes.
- **SC-005**: Nginx can reach only the relay on the Buzz ingress network; the
  relay alone can reach stores; the canary can reach only Nginx.
- **SC-006**: An isolated restore of a coherent current backup passes logical
  assertions with measured RPO/RTO before owner admission.
- **SC-007**: Route-first rollback makes Buzz unreachable within five minutes,
  preserves data, and leaves existing routes/listeners healthy.
- **SC-008**: Owner collaboration actions and restart persistence pass without
  exposing private keys or content.
- **SC-009**: Twenty valid canary interactions pass with zero responses to
  unapproved callers/channels and zero tool or direct-store access.
- **SC-010**: Revocation prevents queued and future canary activity.
- **SC-011**: Resource usage remains inside the approved ceiling under measured
  pilot load.
- **SC-012**: Logs and evidence contain zero secrets, authorization values,
  cookies, private keys, or message bodies.
- **SC-013**: A seven-day observation has no unresolved security, data-loss,
  required-test, or existing-service-health blocker.
- **SC-014**: No user, agent, channel, tool, route, data class, or community is
  added without separately recorded approval.

## Assumptions and Dependencies

- Buzz remains pre-1.0; all source, image, client, and protocol facts are
  revalidated at Gate 0.
- Aegis remains shared production infrastructure; design documentation alone
  authorizes no production or external mutation.
- The current qualified Wolfi relay wrapper is a historical candidate, not an
  automatically approved future runtime.
- The selected private address, certificate method, resource limits, backup
  objectives, and exact grant syntax are frozen only after current evidence.
- Existing secret custody, encrypted off-box backup, monitoring, and deployment
  ledger mechanisms remain available and must be reverified.
