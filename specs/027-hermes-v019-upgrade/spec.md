# Feature Specification: Hermes v0.19 Production Upgrade

**Feature Branch**: `agent/codex/feature-027-hermes-v019-upgrade`

**Created**: 2026-07-24

**Status**: In Progress

**Input**: User description: "Update the Hermes agent upgrade playbook and run it to update the agents to the most recent version."

## User Scenarios & Testing

### User Story 1 - Review a Release Safely (Priority: P1)

As the platform owner, I want every upstream Hermes release assessed against
the actual OvernightDesk runtimes before production changes begin so an image
tag, new default, or packaging change cannot silently broaden agent authority
or break a tenant.

**Why this priority**: A wrong upstream digest or changed security default can
affect all live agents before service-level checks expose the mistake.

**Independent Test**: Review the recorded upstream release, exact multi-
architecture digest, ARM64 manifest, current runtime state, security-default
comparison, and updated runbook without pulling or starting a production
candidate.

**Acceptance Scenarios**:

1. **Given** a newer upstream release exists, **When** release intake completes,
   **Then** the exact release tag, runtime version, index digest, ARM64 child
   digest, packaging behavior, config schema, security-default changes, and
   affected OvernightDesk surfaces are recorded.
2. **Given** a new upstream default would change dangerous-command handling,
   **When** the release is staged, **Then** each tenant retains its prior
   explicit approval mode and cron denial policy unless the owner separately
   authorizes a policy change.
3. **Given** Titus is a live Hermes runtime, **When** the runbook is reviewed,
   **Then** Titus appears in staging, rollout, rollback, qualification, and
   acceptance steps alongside Walter and Mitchel.

---

### User Story 2 - Upgrade All Live Agents Without State Loss (Priority: P2)

As the platform owner, I want Walter, Titus, and Mitchel upgraded through
isolated staging and sequential production cutovers so their volumes,
credentials, routes, schedules, tools, models, and authentication boundaries
remain intact.

**Why this priority**: The upgrade has value only when all three live agents
run the accepted release and continue their existing work safely.

**Independent Test**: Stage copied tenant volumes with production delivery
disabled, qualify the derived image, then upgrade one runtime at a time while
proving the other runtime identities and state remain unchanged.

**Acceptance Scenarios**:

1. **Given** the accepted upstream digest, **When** the derived image is built,
   **Then** its base pin, ARM64 compatibility, embedded runtime version, GitHub
   CLI support, and hardened launcher compatibility are verified before
   production use.
2. **Given** copied staging volumes, **When** v0.19.0 starts in isolation,
   **Then** gateway, dashboard, cron, configuration, MCP registry, skills,
   model/provider, memory, and tenant-specific qualification checks pass
   without production message delivery or live-volume mutation.
3. **Given** three healthy v0.18.0 runtimes, **When** the cutover runs
   sequentially, **Then** Mitchel, Walter, and Titus each reach v0.19.0 while
   named volumes, container-private ports, authentication, schedules, tools,
   and unrelated container identities are preserved.
4. **Given** any cutover or qualification failure, **When** rollback is
   invoked, **Then** only the affected runtime returns to the retained v0.18.0
   image and exact prior launcher/config snapshot without deleting its volume.

---

### User Story 3 - Leave a Reproducible Upgrade Record (Priority: P3)

As a future operator, I want repository-owned image inputs, exact runtime
references, production evidence, and rollback instructions synchronized so
the next upgrade starts from truth rather than reverse-engineering the host.

**Why this priority**: A successful one-time upgrade is insufficient if the
next operator cannot reproduce or audit it.

**Independent Test**: Compare the merged source, production image inputs,
runtime image references, platform standard, and deployment ledger against the
exact live candidate after the observation window.

**Acceptance Scenarios**:

1. **Given** the rollout succeeds, **When** documentation is reconciled,
   **Then** all current non-historical image references identify v0.19.0 and
   the exact accepted upstream/derived digests.
2. **Given** the provisioner creates future tenants, **When** its live
   configuration is inspected, **Then** it uses the exact accepted v0.19.0
   digest rather than an older or floating tag.
3. **Given** production qualification completes, **When** an operator reviews
   the deployment ledger, **Then** it identifies the merged sources, image
   digests, runtime order, rollback handles, preserved state, health evidence,
   and any owner-only acceptance still pending.

### Edge Cases

- The GitHub release tag, runtime-reported version, Docker index digest, and
  ARM64 child digest may differ in shape and must not be conflated.
- A pulled `latest` tag may move between release intake and build; the build
  must use the recorded immutable digest and reverify it.
- Config schema version may remain unchanged while effective defaults change.
- A copied live volume may change during snapshot and is staging input, not a
  production backup.
- Staging must not compete with live Telegram, Discord, Matrix, AgentMail, or
  cron delivery.
- Titus is systemd-managed and uses a repository-owned launcher; Walter and
  Mitchel use standalone retained-container rollback handles.
- A runtime may be healthy while its dashboard, cron ticker, MCP registry, or
  protected public route is broken.
- A partial rollout must leave already-qualified runtimes healthy and retain
  independent rollback handles for every changed runtime.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST identify the latest non-prerelease upstream
  Hermes release from the official source and record its immutable release and
  image identities.
- **FR-002**: The release assessment MUST cover upstream packaging, config
  schema, gateway, dashboard, auth, cron, MCP, skills, browser tooling,
  delivery, model/provider, approval, and security changes relevant to
  OvernightDesk.
- **FR-003**: The runbook MUST cover Walter, Titus, and Mitchel consistently
  across intake, staging, production rollout, rollback, qualification, and
  documentation.
- **FR-004**: The upgrade MUST preserve the current dangerous-command policy:
  manual approval for interactive/gateway work and denial for unattended cron
  commands, unless separately owner-authorized.
- **FR-005**: The accepted upstream base MUST be digest-pinned and its ARM64
  child manifest MUST be verified before building the derived image.
- **FR-006**: The derived image build input MUST be repository-owned,
  reproducible, and contain no credentials.
- **FR-007**: Staging MUST use copied tenant state, prevent production channel
  competition or delivery, and leave live volumes unchanged.
- **FR-008**: Staging MUST qualify runtime version, config version, doctor,
  gateway, dashboard, cron, MCP, model/provider, memory, skills, and applicable
  tenant-specific contracts before production cutover.
- **FR-009**: Production cutover MUST be sequential and stop on the first
  unresolved failure.
- **FR-010**: Every affected runtime MUST retain a known v0.18.0 rollback image,
  exact pre-cutover configuration/launcher snapshot, and named volume.
- **FR-011**: Production rollback MUST affect only the failed runtime and MUST
  never delete or recreate a named data volume.
- **FR-012**: Post-cutover verification MUST prove all three runtime versions,
  gateway/dashboard health, authentication-required state, cron function,
  private port posture, current providers/models, tenant-specific tools, and
  unrelated-container preservation.
- **FR-013**: Future-tenant provisioning MUST use the accepted immutable
  v0.19.0 upstream digest after the orchestrator is safely refreshed.
- **FR-014**: The platform standard and current non-historical repository
  references MUST match the exact live upstream and derived image identities.
- **FR-015**: Every production mutation and rollback attempt MUST be appended
  to the suite deployment ledger without secrets or personal message content.
- **FR-016**: The workflow MUST preserve existing OIDC/Basic dashboard
  providers, Nginx authorization, Phase boundaries, volumes, schedules, model
  policy, email safeguards, and cross-tenant isolation.

### Key Entities

- **Upstream Release**: Official tag, runtime version, release date, source
  commit, OCI index digest, ARM64 manifest digest, and reviewed change set.
- **Derived Image**: Repository-owned Dockerfile, immutable upstream base,
  local tag, image ID/digest, build time, and added operator tooling.
- **Runtime Candidate**: One staged or live Walter, Titus, or Mitchel instance
  with its volume, launcher, approval policy, auth provider, schedules, tools,
  model/provider, and health evidence.
- **Rollback Handle**: Retained prior image/container or launcher/config
  snapshot capable of restoring one runtime without volume deletion.
- **Qualification Record**: Value-free evidence for versions, health,
  security posture, tenant contracts, unchanged dependencies, and observation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All three live Aegis Hermes runtimes report v0.19.0 and a running
  gateway after sequential cutover.
- **SC-002**: All three dashboards respond internally, report authentication
  required, and publish zero direct host ports.
- **SC-003**: Each runtime retains its pre-upgrade manual/deny approval policy,
  named volume, provider/model boundary, and tenant-specific tool contract.
- **SC-004**: Every unrelated scoped production container retains its exact
  preflight identity, start time, and restart count throughout each isolated
  cutover, except an explicitly documented dependent restart.
- **SC-005**: Staging, production qualification, syntax/data validation, and
  bounded error-log checks complete with zero unresolved critical findings.
- **SC-006**: The live provisioner, repository source, platform standard, and
  deployment ledger identify the same accepted immutable v0.19.0 base.
- **SC-007**: A rollback handle for every upgraded runtime is verified present
  through the observation window, and no named volume is deleted.

## Assumptions

- "The agents" means the three live Aegis runtimes: Walter, Titus, and Mitchel.
- v0.19.0 / v2026.7.20 is the latest official non-prerelease at intake time.
- Existing model/provider choices are out of scope and remain unchanged.
- Smart approvals are not enabled by this upgrade; that requires a separate
  owner decision.
- No production email, outreach, CRM mutation, or channel test message is
  authorized solely by the upgrade request.
- Historical completed feature documents retain their recorded old versions;
  only current operational references are reconciled.
