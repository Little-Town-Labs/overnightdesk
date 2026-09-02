# Feature Specification: Buzz Private Pilot on Aegis

**Feature Branch**: `042-buzz-private-pilot`

**Primary Issue**: [Little-Town-Labs/overnightdesk#249](https://github.com/Little-Town-Labs/overnightdesk/issues/249)

**Created**: 2026-09-01

**Reactivated for planning**: 2026-09-02

**Status**: Gate 0 evidence collection and simplified design revision in
progress; implementation and production mutation are not authorized

## Reactivation Boundary

Issue #249 was closed on 2026-09-01 after research tasks T001-T009 and reopened
for planning on 2026-09-02. No Aegis, Phase, tailnet, registry, identity, route,
deployment, or remote Git state was changed. The old implementation tasks
T010-T054 were never executed.

This revision and the reopened Issue reactivate planning, not implementation or
deployment. The design supersedes the dedicated Tailscale-container topology
with a proposed private Nginx listener reached through an exact
host-advertised `/32` subnet route. Current upstream, image, host, route, and
protocol facts must be revalidated before implementation. On 2026-09-02 the
owner simplified the transport boundary: the current tailnet-wide access policy
is accepted for this bounded pilot, while Buzz membership becomes the
participant boundary for the owner and three named Hermes agents.

## Scope

### MVP

Privately and reversibly qualify one closed Buzz community on `aegis-prod` for
one human owner and the three named Aegis Hermes agents: Walter, Titus, and
Mitchel/Trevor. The agents are admitted in stages, beginning with one selected
canary. The pilot must prove that:

- only tailnet-connected devices can reach the private ingress, with the
  current tailnet-wide policy accepted as a bounded residual risk;
- Buzz enforces NIP-42/NIP-98 identity and closed-relay membership;
- the owner and each agent use separate, independently revocable Nostr
  identities with read/write messaging membership;
- automated agent responses accept only the exact signed owner in one pilot
  channel and retain each Hermes runtime's existing tool and human-approval
  policy without gaining new authority;
- the canonical Buzz WebSocket URL and each exact NIP-98 HTTPS request URL work
  unchanged through Nginx;
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
- Sharing a human or agent identity, private key, or secret.
- Admin UI, Git web UI, workflows, webhooks, large media, multi-community
  hosting, agents beyond the three named Hermes runtimes, bot-to-bot-triggered
  automation, or new business-action tools.
- Publishing a branch, changing Project fields, deploying, or changing routes
  without separate explicit authorization.

## Clarifications

### Session 2026-09-02

- The existing Nginx process may be reused only through a dedicated private
  listener that cannot select Buzz from the public OCI listener, even with a
  forged SNI or `Host` header.
- The exact private listener address is selected only after a current read-only
  host and OCI route/NAT preflight proves that it is unassigned and has no
  public path. Assigning it as a secondary private IP to the approved OCI VNIC
  and intended host interface is a separate owner-approved production mutation
  that must precede Nginx binding and route advertisement.
- Only after assignment and local-bind proof may the host's existing Tailscale
  node advertise exactly that address as a `/32`. The current broad tailnet
  policy is accepted for this owner-controlled pilot, so no Buzz-specific
  Tailscale policy, grant, tag, or temporary API credential is required.
- `wss://buzz.overnightdesk.com` is the exact WebSocket relay URL used by the
  relay, Desktop, tests, Hermes intake workers, and signed relay tags. NIP-98 uses the distinct
  HTTPS origin `https://buzz.overnightdesk.com` and signs the byte-exact full
  request URL, including its path and query. Neither canonical form includes an
  explicit default `:443` port. Gate 0 freezes the literal supported NIP-98
  method/URL pairs before fixtures or production probes are built.
- Nginx transports NIP-42 WebSocket and NIP-98 HTTP traffic without substituting
  OIDC. A successful upgrade alone is not sufficient protocol proof.
- Nginx, relay, stores, and Hermes intake workers use narrow networks so Nginx
  cannot reach data stores and no worker can bypass the canonical ingress.
- Walter, Titus, and Mitchel/Trevor each receive a distinct Buzz identity and
  route-specific intake worker. They may read and post messages, but each
  worker calls only its exact authenticated Hermes Runs API and does not add
  tool, shell, deployment, outreach, payment, secret, or business-record
  authority. Initially only owner-authored messages trigger responses.

No remaining clarification materially changes the MVP, architecture, security
boundary, or acceptance tests.

## User Scenarios and Testing

### User Story 1 — Owner Uses a Private Collaboration Space (P1)

An owner on a tailnet device can reach the canonical hostname, authenticate
with a client-held Nostr identity, and use the closed community. A public
client cannot reach Buzz. A tailnet device can reach the private listener, but
an unadmitted Nostr identity cannot subscribe, read, or write.

**Independent test**: Exercise complete NIP-42 and NIP-98 flows through Nginx,
then repeat from each denied network and identity class.

**Acceptance scenarios**:

1. **Given** an owner tailnet device and admitted owner identity, **when** the
   client uses the canonical WebSocket and HTTPS request URLs, **then** signed
   WebSocket and HTTP actions succeed through Nginx.
2. **Given** a public client, **when** it uses DNS, direct IP, SNI, or Host
   variations, **then** it cannot select or reach Buzz.
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
2. **Given** active private ingress, **when** listener-first rollback runs,
   **then** Buzz becomes unreachable within five minutes, its data remains
   preserved, the secondary address is removed, and existing services match
   baseline.

### User Story 3 — Named Hermes Agents Participate Safely (P2)

Walter, Titus, and Mitchel/Trevor each use a separate read/write Buzz identity
through the canonical Nginx endpoint. One is qualified first as the canary;
the other two are admitted only after it passes. Automated responses are
owner-triggered in one pilot channel, validated by exact sender and channel,
governed by existing Hermes tool/approval policy, and independently revocable.

**Independent test**: Pass valid interactions and deny other callers,
channels, tools, direct relay/store access, duplicates, and post-revocation
work.

**Acceptance scenarios**:

1. **Given** the exact owner and pilot channel, **when** the selected canary
   receives a valid request, **then** it returns one bounded response through
   canonical Nginx.
2. **Given** another caller/channel or a high-impact action without approval,
   **when** a request arrives, **then** the canary refuses or enters the existing
   human approval path without executing the action or emitting sensitive telemetry.
3. **Given** revoked agent authority, **when** queued, in-flight, or future
   work exists, **then** it is cancelled or terminated at the approved boundary.
4. **Given** the canary passes, **when** the remaining named agents are admitted
   one at a time, **then** each passes the same identity, channel, network,
   sender/channel, authority, deduplication, and revocation checks before
   remaining active.

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
- OCI VNIC assignment, host-interface assignment, or local-bind proof fails or
  assigns a different address: activation stops and removes only the partial
  address delta before any `/32` is advertised.
- The `/32` becomes reachable from outside the tailnet, or the route includes
  more than the selected address: the experiment rolls back.
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
- A Hermes intake worker resolves a direct relay/store target or canonical DNS
  bypasses Nginx: network qualification fails.
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
- **FR-004**: Select a dedicated private listener address only when fresh
  network evidence proves it is unassigned and has no public NAT path; after
  explicit approval, assign that exact secondary private IP to the approved OCI
  VNIC and intended host interface before binding Buzz.
- **FR-005**: Advertise exactly the selected and locally assigned private
  address as `/32` through the existing Aegis Tailscale node only after explicit
  approval and successful local-bind proof.
- **FR-006**: Accept the current tailnet-wide transport policy for this bounded
  pilot without adding a Buzz-specific grant, tag, or Tailscale credential;
  rely on separate Buzz identities and closed-relay membership for participant
  authorization.
- **FR-007**: Leave the existing host Tailscale identity, advertised-route set,
  Serve root, and `ob1-mcp` handler unchanged except for the approved exact
  `/32` route operation.
- **FR-008**: Leave every existing public Nginx listener and virtual host
  behavior unchanged.
- **FR-009**: Prove public clients cannot select or reach Buzz by IP, SNI, Host,
  IPv4, or IPv6, regardless of public DNS behavior.
- **FR-010**: Use `wss://buzz.overnightdesk.com` as the exact canonical
  WebSocket relay URL across relay configuration, Desktop, Hermes intake workers,
  tests, and signed relay tags; use `https://buzz.overnightdesk.com` as the distinct NIP-98
  HTTPS origin, and freeze each supported method plus byte-exact full request
  URL before testing.
- **FR-011**: Treat public DNS as non-authoritative for access: provide a
  private resolution override for the canonical hostname, prove that any
  public wildcard answer cannot select the Buzz listener, and obtain the
  certificate without opening a public HTTP challenge path.
- **FR-012**: Preserve request method, raw path, raw query ordering/encoding,
  Host, WebSocket upgrade, NIP-98 `Authorization`, and external HTTPS semantics
  through Nginx while removing unrelated cookies, so the relay evaluates the
  same byte-exact HTTPS URL the client signed.
- **FR-013**: Do not invoke OvernightDesk `auth_request` or require a platform
  runtime/session for Buzz traffic.
- **FR-014**: Test a complete signed NIP-42 challenge/auth/subscription flow
  under the exact WebSocket relay URL and each qualified NIP-98 HTTP operation
  under its frozen exact method and full HTTPS request URL through Nginx.
- **FR-015**: Use three Buzz least-connectivity networks: Nginx+relay ingress,
  relay+stores data, and Nginx+Hermes-intake egress. Intake workers may also
  join the existing qualified OvernightDesk network only to reach their exact
  authenticated Hermes Runs API route.
- **FR-016**: Keep PostgreSQL and MinIO authoritative, Redis diagnostic,
  generated Git scratch disposable, and secrets external to Compose/evidence.
- **FR-017**: Create a coherent encrypted PostgreSQL+MinIO backup set and prove
  an isolated restore before owner admission.
- **FR-018**: Keep the owner's private key client-side and out of server secret
  stores, logs, configuration, and evidence.
- **FR-019**: Create separate read/write Buzz identities and route-specific
  intake workers for Walter, Titus, and Mitchel/Trevor; qualify one first as a
  canary; allow automated responses only to the exact signed owner in one pilot
  channel; retain each runtime's existing tool/approval policy; add no new tool
  authority; permit one bounded reply only to that same channel; prevent intake
  from satisfying or bypassing human approvals; and enforce one concurrent job
  per agent, bounded output/time, deduplication-only state, and explicit
  per-agent revocation.
- **FR-020**: Force every Hermes intake worker through the canonical Nginx
  endpoint; fail closed on a missing or mismatched named-runtime mapping; deny
  direct relay and store connectivity, cross-runtime credentials, shared keys,
  and bot-to-bot-triggered automation.
- **FR-021**: Install disabled first; require `nginx -t`, contract success,
  restore proof, rollback proof, safe evidence, and explicit approval at each
  production gate.
- **FR-022**: Activate and roll back with an include/listener change followed
  by an Nginx reload, never a process replacement or unrelated configuration
  rewrite.
- **FR-023**: Roll back the listener first, prove Buzz unreachable, withdraw
  only the exact `/32`, remove only the Buzz host-interface and
  OCI VNIC secondary-address assignment, preserve workload state, and compare
  all existing addresses, routes, listeners, and health checks to the baseline.
- **FR-024**: Emit content-free logs and metrics for availability, Nginx
  reload, route state, protocol outcome class, recovery, capacity, and agent
  authority denials.
- **FR-025**: Keep combined CPU, memory, PIDs, disk, and connection use within
  an approved measured ceiling on the shared production host.
- **FR-026**: Require deterministic local contracts before matching production
  actions and retain redacted, digest-bound evidence for every gate.
- **FR-027**: Treat Issue/Project updates, route changes, secret creation,
  deployment, each identity admission, and pilot expansion as separate
  approval-bound actions.

### Key Entities

- **Pilot workload**: exact candidate, lifecycle state, limits, approvals, and
  rollback handle.
- **Private ingress route**: selected address, OCI VNIC and host-interface
  assignment state, `/32`, advertising node, route approval, accepted tailnet
  policy posture, and baseline digests.
- **Ingress configuration**: private listener, canonical hostname, certificate
  reference, config digest, public-denial proof, and protocol proof.
- **Community and identity**: one closed community, distinct public identities,
  memberships, and client/external secret custody.
- **Agent authority profile**: each named Hermes agent's identity, intake route,
  caller/channel/network/tool/resource policy, and revocation state.
- **Recovery set and qualification run**: exact artifacts, safe checks,
  approvals, restore measurements, and gate result.
- **Pilot decision**: evidence-backed bounded outcome that grants no authority
  by itself.

## Success Criteria

- **SC-001**: All local contracts pass for the exact candidate digests and
  rendered topology before any production mutation.
- **SC-002**: An owner tailnet device completes NIP-42 under the exact canonical
  WebSocket URL and NIP-98 under the frozen byte-exact HTTPS request URLs
  through Nginx.
- **SC-003**: Public clients have zero successful Buzz connections, including
  forged-IP/SNI/Host attempts; tailnet transport alone grants no application
  access.
- **SC-004**: Unadmitted identities have zero successful subscriptions, reads,
  or writes.
- **SC-005**: Nginx can reach only the relay on the Buzz ingress network; the
  relay alone can reach stores; each Hermes intake worker can reach Buzz only
  through Nginx and authenticate only to its mapped Hermes runtime.
- **SC-006**: An isolated restore of a coherent current backup passes logical
  assertions with measured RPO/RTO before owner admission.
- **SC-007**: Listener-first rollback makes Buzz unreachable within five
  minutes, removes only the Buzz `/32` and secondary-address assignment,
  preserves data, and leaves existing addresses/routes/listeners healthy.
- **SC-008**: Owner collaboration actions and restart persistence pass without
  exposing private keys or content.
- **SC-009**: Each of the three named Hermes identities passes twenty valid
  interactions with zero responses to unapproved callers/channels, zero new or
  bypassed tool authority, zero cross-runtime authentication, zero bot-triggered
  runs, and zero direct relay/store access.
- **SC-010**: Per-agent revocation prevents queued and future activity without
  revoking the owner or another named agent.
- **SC-011**: Resource usage remains inside the approved ceiling under measured
  pilot load.
- **SC-012**: Logs and evidence contain zero secrets, authorization values,
  cookies, private keys, or message bodies.
- **SC-013**: A seven-day observation has no unresolved security, data-loss,
  required-test, or existing-service-health blocker.
- **SC-014**: No user or agent beyond the owner and three named Hermes agents,
  and no additional channel, tool, route, data class, or community, is added
  without separately recorded approval.

## Assumptions and Dependencies

- Buzz remains pre-1.0; all source, image, client, and protocol facts are
  revalidated at Gate 0.
- Aegis remains shared production infrastructure; design documentation alone
  authorizes no production or external mutation.
- The current qualified Wolfi relay wrapper is a historical candidate, not an
  automatically approved future runtime.
- The selected private address, exact OCI VNIC and host-interface assignment and
  removal procedure, certificate method, literal NIP-98 method/URL pairs,
  resource limits, backup objectives, named-agent intake contract, and
  accepted tailnet-policy posture are frozen only after current evidence.
- Existing secret custody, encrypted off-box backup, monitoring, and deployment
  ledger mechanisms remain available and must be reverified.
