# Feature Specification: Buzz Private Pilot on Aegis

**Feature Branch**: `042-buzz-private-pilot`

**Primary Issue**: [`Little-Town-Labs/overnightdesk#249`](https://github.com/Little-Town-Labs/overnightdesk/issues/249)

**Created**: 2026-09-01

**Status**: Closed without deployment on 2026-09-01 at the owner's direction

**Input**: User description: "Plan how to deploy and test Buzz on aegis-prod for the owner and agents to use."

## Scope

## Closure

This research initiative is closed and is not active delivery work. Issue #249
was closed as not planned. Tasks T001 through T009 record completed research
and local qualification only; T010 through T054 were not executed and are not
scheduled. No Aegis, Phase, tailnet, registry, identity, route, or remote Git
state was changed.

Restarting this initiative requires an explicit owner decision, revalidation of
the then-current upstream and host facts, and a newly approved ingress
architecture. Neither the Tailscale topology described here nor the discussed
Nginx/OIDC alternative is implicitly approved for a future attempt.

## Clarifications

### Session 2026-09-01

- Q: Which private ingress and image-remediation path should Gate 0 use? → A:
  Use a dedicated tailnet-only Tailscale device and a local hardened wrapper
  experiment; do not mutate Aegis, Phase, Tailscale, GitHub, or remote Git.

### MVP

The MVP is a private, reversible qualification of one closed Buzz community on
`aegis-prod`. It serves one owner account and one newly created, low-authority
agent canary. It proves infrastructure isolation, identity and membership
denial, core collaboration behavior, persistence, backup and restore, resource
bounds, observability, and route-first rollback before any existing production
agent or additional person is admitted.

### Non-Goals

- Public-internet or unauthenticated access.
- Customer, client, prospect, payment, outreach, or regulated data.
- Reusing a Walter, Titus, Trevor, or other existing agent identity or secret.
- Giving the canary deployment, shell, secret, payment, outreach, CRM, or
  production-lifecycle authority.
- Replacing Hermes, Open WebUI, OvernightDesk authentication, or an existing
  workspace.
- Migrating existing conversations, memory, channels, or business records.
- Multi-community hosting, general relay hosting, or customer self-service.
- Enabling Buzz's admin dashboard, Git web interface, workflow automation,
  webhooks, or large-media use during the pilot.
- Solving generalized Hermes-to-Buzz integration before the isolated canary has
  passed qualification.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owner Uses a Private Collaboration Space (Priority: P1)

As the owner, I can enter a closed Buzz community with my own identity and use
its core collaboration features without exposing the service or content to
unapproved people.

**Why this priority**: The pilot has no value unless the human collaboration
experience works and the access boundary fails closed.

**Independent Test**: From an approved private-network client, admit the owner,
exercise the agreed core message flows, and prove that an unadmitted identity
cannot connect, read, or write.

**Acceptance Scenarios**:

1. **Given** a healthy relay with no admitted members, **when** the owner presents an approved identity and completes admission, **then** only that identity can enter the pilot community.
2. **Given** the owner is admitted, **when** the owner sends, edits, deletes, reacts to, threads, and searches test messages, **then** each action has the expected visible result.
3. **Given** an unadmitted identity, **when** it attempts to connect, subscribe, read, or publish, **then** every attempt is denied without revealing community content.
4. **Given** a planned restart, **when** the stack returns healthy, **then** the owner's membership, channels, and test messages remain available.

---

### User Story 2 - Operator Qualifies and Recovers the Service (Priority: P1)

As the accountable operator, I can install and qualify Buzz privately, observe
its health and resource use, restore its state in isolation, and disable it
quickly without disturbing existing Aegis services.

**Why this priority**: A new multi-store collaboration service is acceptable on
the shared production plane only when its health, capacity, recovery, and
rollback behavior are proven before users depend on it.

**Independent Test**: Install a disabled-first candidate with no active route,
run deterministic private checks, capture a coherent backup, restore it into a
disposable isolated environment, then disable the route and stack while
confirming the existing production baseline remains healthy.

**Acceptance Scenarios**:

1. **Given** reviewed deployment source and an approved release candidate, **when** it is installed, **then** no Buzz service publishes a host port and no user-facing route is active.
2. **Given** the private stack is running, **when** qualification inspects identities, privileges, mounts, networks, secrets, resource limits, and dependency health, **then** every approved boundary passes before ingress can be enabled.
3. **Given** representative pilot data, **when** a coherent backup and isolated restore drill complete, **then** membership, channels, messages, attachments, and repository-backed state satisfy the documented recovery checks.
4. **Given** a rollback decision, **when** rollback is invoked, **then** ingress is disabled first, the canary is stopped, Buzz is stopped with state preserved, and existing Aegis services remain healthy.

---

### User Story 3 - Low-Authority Agent Participates Safely (Priority: P2)

As the owner, I can invite one dedicated evaluation agent that reads and replies
only inside an approved test channel and cannot perform unrelated business or
production actions.

**Why this priority**: Agent participation is the main differentiator under
evaluation, but it must not precede human and infrastructure qualification.

**Independent Test**: Admit a new canary identity, allow it to respond only to
the owner in one test channel, exercise normal and adversarial messages, then
revoke it and prove it loses access.

**Acceptance Scenarios**:

1. **Given** a distinct canary identity and an owner-only allowlist, **when** the owner addresses the canary in the approved channel, **then** it can read context and post a bounded reply in the correct thread.
2. **Given** a message from an unapproved member or another channel, **when** the canary observes it, **then** it does not respond or invoke work.
3. **Given** content that requests secrets, tools, production mutation, outreach, payments, or data access, **when** the canary processes it, **then** it refuses or ignores the request and no prohibited action occurs.
4. **Given** the canary's membership or key is revoked, **when** it reconnects or publishes, **then** access is denied and the denial is visible to the operator without leaking the private key.
5. **Given** a canary process restart, **when** it resumes, **then** it does not duplicate replies and remains within its channel, member, concurrency, and resource limits.

---

### User Story 4 - Owner Makes an Evidence-Based Expansion Decision (Priority: P3)

As the owner, I receive a concise qualification record that identifies what
passed, what failed, residual risks, resource cost, rollback status, and the
exact authority requested before deciding whether to admit more people or
agents.

**Why this priority**: Pilot completion is a decision point, not automatic
permission to widen production access or agent authority.

**Independent Test**: Review the pilot evidence after the observation window
and verify that no additional identity, route, agent, or capability can be
enabled without a new explicit approval.

**Acceptance Scenarios**:

1. **Given** completed qualification and observation, **when** the report is generated, **then** it includes release identity, tests, security denials, recovery evidence, resource measurements, incidents, residual risks, and rollback instructions.
2. **Given** one or more hard gates failed, **when** the pilot concludes, **then** expansion is blocked and the service is left disabled or rolled back with state preserved.
3. **Given** all hard gates passed, **when** the owner considers expansion, **then** each new person, existing agent runtime, business-data class, or authority grant is presented as a separate approval rather than being enabled automatically.

### Edge Cases

- A client or canary loses connectivity while publishing and retries the same event.
- The relay is healthy while Postgres, Redis, object storage, or repository-backed state is degraded.
- A backup captures the stores at incompatible points in time.
- A membership change races with an existing client session or queued canary reply.
- The private key, authorization material, message content, or test sentinel is accidentally offered to logs or evidence output.
- A malformed or very large event, attachment, search, or WebSocket session attempts to exhaust shared host capacity.
- The selected image is unavailable, changes architecture support, or fails vulnerability/provenance checks.
- TLS or WebSocket proxy configuration is valid syntactically but routes to the wrong upstream or becomes reachable outside the approved private network.
- Rollback is requested while a backup, restore, upload, or canary response is in flight.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The pilot MUST represent one named internal business workload with an accountable owner, deterministic source, approved release identity, deployment procedure, and rollback handle.
- **FR-002**: The pilot MUST start with one closed community, one owner identity, one private test channel, and no active agent identity.
- **FR-003**: The service MUST be reachable only through a dedicated,
  tag-owned Tailscale device named `buzz` using Tailscale Serve HTTPS/WSS at
  `buzz.tail5c4f73.ts.net`; the device MUST use its own persistent identity,
  MUST NOT enable Funnel, and MUST NOT displace or modify the existing
  `aegis-prod.tail5c4f73.ts.net` Serve handler. Data services and management
  surfaces MUST remain unrouted and publish no host ports.
- **FR-004**: Admission, community membership, and channel membership MUST be explicit, independently revocable, and tested for both authorized use and denial.
- **FR-005**: Human and agent identities MUST use separate keypairs; identities, private keys, recovery material, service credentials, or sessions MUST NOT be shared.
- **FR-006**: The owner MUST be able to perform connection, send, edit, delete, reaction, thread, search, reconnect, and restart-persistence qualification using synthetic test content.
- **FR-007**: The deployment MUST use isolated state boundaries for relational records, ephemeral coordination, object data, and repository scratch, MUST document what each store owns, and MUST treat PostgreSQL/object storage rather than disposable local Git scratch as authoritative for repository-backed state.
- **FR-008**: The deployment MUST enforce an approved non-root user, dropped capabilities, no-new-privileges, no Docker socket, read-only filesystems where supported, explicit writable paths, private dependency networking, and bounded CPU, memory, process, connection, event-size, and upload limits.
- **FR-009**: Secrets MUST be delivered from the approved secret boundary to only the consuming service and MUST NOT appear in source, images, container metadata, logs, qualification evidence, or general agent memory. A later ingress approval MAY add one OAuth client credential limited to `auth_keys` and `tag:buzz-private-pilot`; it MUST be independently revocable and MUST NOT grant general tailnet administration.
- **FR-010**: The deployment MUST expose internal liveness, readiness, dependency, capacity, and error evidence sufficient to distinguish relay, database, coordination, object-store, repository-state, ingress, and canary failures.
- **FR-011**: Logs and evidence MUST use safe correlation identifiers and MUST prove with sentinel tests that private keys, authorization values, cookies, message content, and secret-bearing query data are not emitted.
- **FR-012**: The pilot MUST add all Buzz-owned authoritative durable stores and the minimum non-secret configuration metadata to the encrypted off-box backup boundary; disposable cache/scratch state MUST be recreated rather than treated as authoritative backup data.
- **FR-013**: Before human use, the operator MUST complete a coherent backup and isolated restore drill that validates membership, channels, messages, object data, and repository-backed state without exposing a public route.
- **FR-014**: Ingress activation MUST be a separate, explicit step that requires passing private qualification, current backup evidence, a tested rollback command, a validated Tailscale Serve configuration with Funnel disabled, an approved tag/access policy, and human approval.
- **FR-015**: The canary MUST be a newly generated low-authority identity admitted only after the owner and infrastructure gates pass.
- **FR-016**: The canary MUST run through a separately supervised adapter with an owner allowlist, one-channel scope, bounded concurrency, bounded output, duplicate-event protection, and no production or business-action tools.
- **FR-017**: The canary MUST treat all message content and model output as untrusted and MUST fail closed on requests for secrets, shell execution, production mutation, outreach, payments, customer/prospect data, or other prohibited authority.
- **FR-018**: Revoking the canary's membership or key MUST prevent subsequent connect, read, publish, and queued-response activity without requiring service-wide downtime.
- **FR-019**: Rollback MUST stop or revoke the dedicated Buzz tailnet ingress first without altering the existing Aegis Serve handler, stop the canary adapter, stop the Buzz stack without deleting state, restore the previous source/configuration handle if needed, and verify the existing Aegis service baseline.
- **FR-020**: The pilot MUST retain a minimum seven-day observation window after owner-and-canary qualification unless the owner explicitly records a different decision.
- **FR-021**: Additional people, existing agents, communities, routes, data classes, workflows, webhooks, management surfaces, or authority grants MUST require separate explicit approval and MUST NOT be enabled by pilot completion alone.
- **FR-022**: Every production mutation task MUST be explicitly marked as owner-approved and executed by the accountable lead; delegated production work is read-only only.
- **FR-023**: The implementation MUST provide deterministic configuration, security-contract, private-qualification, negative-access, backup/restore, rollback, and post-change health checks before the pilot is considered ready.
- **FR-024**: The pilot MUST produce a durable qualification record and deployment-ledger entry that identify the release, approvals, checks, resource results, backup/restore evidence, incidents, residual risks, and final decision without recording secrets or message content.
- **FR-025**: Every runtime image, including the relay and Tailscale ingress,
  MUST use an immutable ARM64 digest, run under an explicit non-root UID/GID,
  have a current SBOM and vulnerability result, and fail Gate 0 when an
  undisposed Critical or High finding remains. A wrapper MUST copy only exact
  upstream artifacts, freeze every runtime package input, and pass integration
  checks before it can become a candidate.

### Key Entities

- **Pilot Workload**: The named Buzz deployment, approved release, lifecycle state, resource envelope, owner, ingress status, and rollback handle.
- **Community**: The single closed collaboration boundary and its policy; it contains explicitly admitted members and channels.
- **Identity**: A person or agent public identity, type, lifecycle state, recovery custody, and membership relationships. Private key material is never part of this entity's durable evidence.
- **Membership Grant**: An auditable, revocable relationship between an identity and the community or channel.
- **Agent Authority Profile**: The canary's allowed members, channel, response behavior, resource bounds, and explicit prohibited capabilities.
- **State Store**: A durable or ephemeral state boundary, its owner, backup method, restore order, recovery objective, and validation checks.
- **Qualification Run**: An immutable record of candidate identity, environment baseline, executed checks, safe evidence, result, and approver.
- **Pilot Decision**: The owner's recorded continue, expand, pause, or rollback decision and any separately approved next authority.
- **Private Ingress Identity**: The dedicated `buzz` Tailscale device, its
  `tag:buzz-private-pilot` authority, persistent node state, Serve-only route,
  credential lifecycle, and independent revocation state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Before ingress activation, 100% of private qualification checks pass, zero Buzz services publish a host port, Funnel is disabled, and the existing Aegis Serve configuration is byte-for-byte unchanged.
- **SC-002**: The admitted owner completes all defined core collaboration actions successfully, while an unadmitted identity succeeds in zero connection, read, or write attempts.
- **SC-003**: After a planned stack restart, 100% of the synthetic membership, channel, message, attachment, and repository-state recovery assertions pass.
- **SC-004**: An encrypted backup and isolated restore rehearsal complete successfully before the canary is admitted, with every documented state store validated.
- **SC-005**: Route-first rollback makes the dedicated Buzz tailnet identity unreachable to pilot clients within five minutes, leaves the existing Aegis Serve handler unchanged, and leaves all pre-existing Aegis health checks passing.
- **SC-006**: The canary responds to at least 20 owner-authored test requests in the approved channel with zero replies to unapproved identities or channels, zero duplicate replies, and zero prohibited tool or business actions.
- **SC-007**: Canary revocation prevents 100% of subsequent connection, read, publish, and queued-response attempts.
- **SC-008**: Under the bounded pilot load of one admitted owner, one canary, five channels, and 10,000 synthetic small messages, 95% of message send-to-visible confirmations complete within two seconds and no existing Aegis workload breaches its established health threshold.
- **SC-009**: The complete Buzz workload remains within an approved envelope no greater than 2 CPU cores, 4 GiB memory, and 10 GiB initial durable-disk growth during qualification; exceeding any bound blocks expansion pending a new capacity decision.
- **SC-010**: Sentinel and evidence scans find zero private keys, service secrets, authorization values, cookies, or message bodies in application logs and qualification artifacts.
- **SC-011**: The owner-and-canary pilot completes a seven-day observation window with zero unresolved security, data-loss, required-test, or existing-service health blockers.
- **SC-012**: Pilot completion enables zero additional users, agents, communities, routes, data classes, or tools without a separately recorded approval.

## Assumptions

- Buzz remains a pre-1.0 dependency and the pilot pins one immutable ARM64 release candidate rather than following a mutable tag.
- `aegis-prod` remains a shared internal production host, so all deployment and identity changes require explicit human approval even when the test content is synthetic.
- The private route uses a dedicated userspace-networking Tailscale container
  named `buzz`, sharing the relay network namespace so Serve can proxy only to
  relay loopback. This avoids the OCI-bound Nginx and the occupied host
  Tailscale Serve listener. Buzz's bundled Caddy is not operated in parallel.
- The `buzz.tail5c4f73.ts.net` certificate name is acceptable for Certificate
  Transparency publication because it contains no tenant, customer, or secret
  identifier; reachability remains tailnet-restricted.
- The resolved Aegis backup incident is not reopened by this feature. This feature adds Buzz-specific coverage and proves its own isolated restore path.
- The first agent is an isolated evaluation process with no relationship to existing Hermes memory, identities, conversations, or tools.
- The Phase paths, exact resource limits below the stated ceiling, recovery objectives, and observation schedule can be finalized during implementation preflight without changing approved scope.
- GitHub Issue, Project, branch publication, pull request, and production deployment lifecycle changes occur only after the user explicitly authorizes those external-state actions.

## Dependencies

- Owner approval for a new named workload, a private route, new identity and secret scopes, backup changes, each production phase, and any later expansion.
- A reviewed ARM64 Buzz release candidate and reproducible adapter build for the canary.
- A qualified immutable Tailscale sidecar image, an owner-approved
  `tag:buzz-private-pilot` access policy, and a least-privilege OAuth client
  restricted to `auth_keys` for that tag, plus existing secret custody,
  encrypted backup producer, off-box backup set, monitoring, and
  deployment-ledger mechanisms.
- Client-side custody and recovery for the owner's Buzz/Nostr identity.
