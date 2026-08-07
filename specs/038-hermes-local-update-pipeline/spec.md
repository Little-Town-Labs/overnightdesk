# Feature Specification: Local-First Hermes Update Pipeline

**Feature Branch**: `038-hermes-local-update-pipeline`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User request to extend the existing Hermes update protocol with a
local qualification stage for Walter, Titus, and Mitchel before Aegis staging.

## User Scenarios & Testing

### User Story 1 - Qualify a Hermes candidate locally (Priority: P1)

As the accountable operator, I want to run a proposed Hermes release against
isolated local copies of all three agent profiles so that incompatible updates
are found before any Aegis state is touched.

**Why this priority**: Local qualification is the missing safety gate in the
current update protocol and is the first useful outcome of this feature.

**Independent Test**: Run the local qualification command with a candidate
manifest and synthetic state. It produces a report for Walter, Titus, and
Mitchel, and a deliberately unsafe candidate or missing stub fails before an
agent-capable process starts.

**Acceptance Scenarios**:

1. **Given** a valid candidate manifest and synthetic agent state, **When** the
   operator runs local qualification, **Then** all three agents receive
   isolated workspaces and the report records a result for each agent.
2. **Given** production-looking credentials, Phase paths, or live service
   endpoints in the local environment, **When** qualification starts, **Then**
   it fails closed before starting an agent process and identifies the unsafe
   boundary without printing the value.
3. **Given** a candidate that fails one agent's qualification, **When** the
   local run completes, **Then** the overall result is failed and the report
   identifies the failed agent and gate without authorizing later stages.

### User Story 2 - Verify uniform agent contracts through safe stubs (Priority: P1)

As an operator, I want Walter, Titus, and Mitchel to expose the same
qualification interface while testing their own connector and authority
boundaries through deterministic stubs, so that a passing local result means
the important behavior was exercised rather than only source files being
present.

**Why this priority**: The existing qualification depth is uneven. A common
interface makes the three-runtime fleet reviewable and prevents a runtime from
silently receiving weaker coverage.

**Independent Test**: Run each agent profile against the local stub set and
verify both an allowed read/preflight path and a denied outbound or privileged
path. Remove one required stub and verify that the profile fails closed.

**Acceptance Scenarios**:

1. **Given** the shared local stub network, **When** Walter is qualified,
   **Then** Guardian/GitHub actions remain non-mutating and the expected health
   and tool contracts pass.
2. **Given** the shared local stub network, **When** Mitchel is qualified,
   **Then** Trevor/Agiled/browser boundaries use synthetic data and outbound
   prospect communication remains disabled.
3. **Given** the shared local stub network, **When** Titus is qualified,
   **Then** Teams, Matrix, AgentMail, Control Tower, memory, inference, MCP,
   and dashboard boundaries use local fixtures and no message is delivered to
   a real channel.
4. **Given** any agent profile attempts to contact a non-allowlisted endpoint,
   **When** the local run observes the request, **Then** the request is denied
   and the report records a safe refusal.

### User Story 3 - Promote one tested candidate through the existing playbook (Priority: P2)

As the accountable operator, I want the local result to identify one exact
candidate artifact and preserve machine-readable gate evidence, so that Aegis
staging can consume the same candidate without rebuilding a different image.

**Why this priority**: Local qualification is valuable only if its result can
be trusted as the first stage of the existing reviewed Aegis path.

**Independent Test**: Generate a report from a candidate manifest, verify its
artifact identity and gate results, then validate that the existing Aegis
protocol can reference the same candidate without requiring local production
credentials or local copies of live volumes.

**Acceptance Scenarios**:

1. **Given** a passing local report, **When** the operator inspects its
   candidate identity, **Then** the report includes the upstream release,
   source commit, immutable image references, target architecture, policy
   invariants, and per-agent results.
2. **Given** a failed local report, **When** the operator attempts promotion,
   **Then** promotion is refused and no Aegis command is executed.
3. **Given** a passing local report, **When** the operator begins the next
   stage, **Then** the existing Aegis copied-volume staging and human approval
   gates remain required.

### Edge Cases

- A candidate manifest omits an image digest, target architecture, agent, or
  approval-policy invariant; validation must fail before qualification.
- The local machine is not Linux ARM64; local contract checks may pass, but the
  report must clearly mark Aegis ARM64 staging as still required.
- A stub becomes unavailable or returns malformed data; the affected agent and
  gate must fail rather than silently falling back to a real endpoint.
- Two concurrent local runs use the same agent name; each run must use unique
  state and network resources.
- A qualification process exits unexpectedly; cleanup must not remove named
  production volumes or alter unrelated local containers.
- Test fixtures contain prompt-injection-like text or fake credentials; the
  agent must treat them as untrusted data and the report must redact secrets.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST use the existing `tenants/hermes-walter`,
  `tenants/hermes-titus`, and `tenants/hermes-mitchel` directories as the
  canonical agent workflow source.
- **FR-002**: The system MUST validate a versioned candidate manifest containing
  the upstream release, source commit, immutable upstream image reference,
  target architecture, derived candidate reference, and required approval
  policy.
- **FR-003**: The system MUST create isolated, synthetic local state for each
  agent and MUST NOT copy production volumes or production credentials to the
  local environment.
- **FR-004**: The local run MUST deny external network access by default and
  MUST allow only the declared local stub boundaries.
- **FR-005**: The system MUST fail before agent startup when it detects
  production-looking secrets, Phase paths, production hostnames, or
  non-allowlisted endpoints in the local configuration.
- **FR-006**: Each agent profile MUST expose a consistent qualification
  interface that covers startup, health, configuration policy, relevant tool
  boundaries, refusal behavior, and cleanup.
- **FR-007**: The local harness MUST provide deterministic stubs for the
  connector, inference, MCP, and state boundaries required by each agent
  profile.
- **FR-008**: The system MUST test both permitted preflight/read behavior and
  denied outbound, privileged, or production-delivery behavior for each agent.
- **FR-009**: The system MUST emit structured, value-safe qualification output
  with a correlation identifier, candidate identity, per-agent gates, failures,
  timestamps, and an overall pass/fail decision.
- **FR-010**: A failed local qualification MUST block any promotion command and
  MUST NOT perform Aegis, production, or external delivery actions.
- **FR-011**: A passing local qualification MUST identify the exact candidate
  artifact and MUST preserve the existing Aegis ARM64 staging, human approval,
  rollback, and observation requirements.
- **FR-012**: Documentation MUST define measurable gate thresholds, cleanup
  behavior, evidence retention, and the boundary between local qualification
  and Aegis staging.

### Key Entities

- **Candidate Manifest**: The reviewed identity and policy invariants for one
  Hermes release candidate.
- **Agent Qualification Profile**: The per-agent contract describing synthetic
  state, required stubs, expected tools, allowed operations, denied operations,
  and verification commands.
- **Stub Boundary**: A deterministic local service or fixture that replaces an
  external connector, provider, MCP server, or state dependency during local
  qualification.
- **Qualification Report**: A value-safe record of the candidate, run, gates,
  agent results, refusals, cleanup status, and promotion decision.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An operator can start a complete three-agent local qualification
  from a clean checkout with one documented command and receive a structured
  result within 10 minutes, excluding an initial image download.
- **SC-002**: Every local run produces exactly one result for Walter, Titus, and
  Mitchel, with no profile silently skipped.
- **SC-003**: A local run has zero requests to production endpoints and zero
  outbound delivery attempts; unsafe endpoint or credential fixtures cause a
  deterministic failure.
- **SC-004**: A candidate artifact that passes locally is the same immutable
  artifact identified by the report and referenced by the subsequent Aegis
  staging step.
- **SC-005**: Qualification reports contain no secret values, raw credentials,
  or unredacted sensitive fixture content in sampled output.
- **SC-006**: A missing stub, invalid policy, failed agent gate, or cleanup
  failure causes a failed overall result and a nonzero command exit status.

## Assumptions

- The existing Hermes v0.19-derived image and Aegis update protocol remain the
  current production baseline while this local stage is built.
- Local qualification may run on a non-ARM64 developer machine, but it cannot
  replace the required Aegis ARM64 staging gate.
- The first implementation uses deterministic contract stubs and synthetic
  fixtures; real provider or channel canaries remain in the existing approved
  Aegis path.
- Docker is available for the local medium-sized integration checks; small
  manifest, policy, and redaction tests must remain runnable without Docker.
- Aegis deployment, live-volume copying, upstream release fetching, and
  production credential access are explicitly out of scope for this feature.
