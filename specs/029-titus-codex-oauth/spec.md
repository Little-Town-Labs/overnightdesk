# Feature Specification: Titus Codex OAuth Migration

**Feature Branch**: `agent/codex/titus-codex-oauth`

**Created**: 2026-07-26

**Status**: Approved for implementation and controlled production activation

**Input**: Convert Titus to use the owner's ChatGPT/Codex OAuth subscription,
following the established Walter and Mitchel runtime pattern. Keep Titus's
primary reasoning effort at medium and use Luna at high effort for delegated
work.

## User Scenarios & Testing

### User Story 1 - Use Codex for Titus Reasoning (Priority: P1)

As the owner, I can use Titus through the existing authenticated workspace
while its normal reasoning runs through my Codex subscription.

**Why this priority**: The primary purpose of the change is to replace Titus's
OpenRouter inference route without changing its identity, tools, channels,
authority, or user-facing access.

**Independent Test**: Enroll a Titus-owned Codex OAuth credential, restart only
Titus, and prove from value-free runtime state and a no-tool canary that Titus
uses `openai-codex` with `gpt-5.6-sol` at medium reasoning effort.

**Acceptance Scenarios**:

1. **Given** a valid Titus-owned Codex OAuth credential, **when** Titus starts,
   **then** its primary provider is `openai-codex`, its model is
   `gpt-5.6-sol`, and its reasoning effort is `medium`.
2. **Given** the provider migration is active, **when** the existing Titus
   dashboard, API, and memory health surfaces are checked, **then** all remain
   healthy and no route, identity, volume, channel, tool, or approval boundary
   has changed.
3. **Given** another Hermes runtime has its own Codex OAuth credential,
   **when** Titus is enrolled, **then** no credential file is copied from that
   runtime and the other runtime is not restarted or reconfigured.

---

### User Story 2 - Delegate to Luna at High Effort (Priority: P2)

As the owner, I can ask Titus to delegate bounded work to Luna at high reasoning
effort while keeping normal Titus interactions at medium effort.

**Why this priority**: Delegation should provide a deliberate high-effort lane
without increasing the cost or latency of every primary interaction.

**Independent Test**: Verify the live delegation projection and execute a
bounded no-mutation delegation canary that identifies the configured Luna
model and completes without automatic approval or unbounded child spawning.

**Acceptance Scenarios**:

1. **Given** Titus is running on Codex, **when** it delegates eligible work,
   **then** the child provider is `openai-codex`, the child model is
   `gpt-5.6-luna`, and child reasoning effort is `high`.
2. **Given** delegated work requests a sensitive action, **when** approval is
   required, **then** the existing manual/deny approval policy remains in
   force and subagents are not automatically approved.
3. **Given** a delegation task expands unexpectedly, **when** its configured
   concurrency, depth, iteration, or timeout limit is reached, **then** the
   delegation stops within the configured bound.

---

### User Story 3 - Preserve Memory and Recovery (Priority: P3)

As an operator, I can migrate Titus's interactive inference provider without
breaking memory capture, recall, or rollback.

**Why this priority**: Titus memory uses an independent OpenRouter-backed
processing and embedding path. Coupling that path to the primary model selector
would turn a successful inference migration into a hidden memory outage.

**Independent Test**: Prove that the live process projects Sol for interactive
inference, MiMo for TencentDB memory processing, and the existing Perplexity
embedding model; then perform a memory capture/recall check and validate the
rollback handle without exposing secret values.

**Acceptance Scenarios**:

1. **Given** Titus's primary model changes to Sol, **when** its memory gateway
   initializes, **then** memory processing still uses
   `xiaomi/mimo-v2.5-pro` through OpenRouter and embeddings remain unchanged.
2. **Given** the Codex credential is absent, expired, or rejected, **when**
   production activation is attempted, **then** the cutover fails closed or is
   rolled back without deleting Titus state.
3. **Given** an unhealthy inference, delegation, memory, API, or dashboard
   check, **when** rollback is authorized, **then** the previous provider
   projection can be restored from value-safe backups with a Titus-only
   restart.

### Edge Cases

- OAuth enrollment succeeds but the active provider is not `openai-codex`.
- The OAuth refresh token becomes invalid after an initially healthy start.
- Codex returns a subscription limit or rate-limit response.
- The primary model projection changes while the memory LLM selector is absent.
- The retained OpenRouter credential is unavailable to memory processing or
  embedding initialization.
- Delegation inherits the primary effort instead of its explicit high effort.
- The deploy script restarts Titus before source and Phase projections form one
  compatible transaction.
- A verification command accidentally prints credential material.

## Requirements

### Functional Requirements

- **FR-001**: Titus MUST use provider `openai-codex`, base URL
  `https://chatgpt.com/backend-api/codex`, model `gpt-5.6-sol`, and primary
  reasoning effort `medium`.
- **FR-002**: Titus delegation MUST use provider `openai-codex`, the same Codex
  base URL, model `gpt-5.6-luna`, and reasoning effort `high`.
- **FR-003**: Delegation MUST remain bounded to three concurrent children, one
  spawn level, 30 iterations, and a 600-second child timeout; orchestrator
  support MAY be enabled, but subagent auto-approval MUST remain disabled.
- **FR-004**: Titus MUST receive a fresh OAuth enrollment scoped to its own
  persistent auth file; Walter or Mitchel credential files MUST NOT be copied.
- **FR-005**: The active Titus authentication state MUST report provider
  `openai-codex` and authentication mode `chatgpt` before production
  activation.
- **FR-006**: OAuth tokens, authorization codes, callbacks, and full credential
  documents MUST NOT be stored in Git, Phase, deployment records, command
  output, or test artifacts.
- **FR-007**: Titus's OpenRouter credential MUST be retained only for the
  independent TencentDB memory-processing and embedding path.
- **FR-008**: Memory processing MUST use an explicit
  `MEMORY_TENCENTDB_LLM_MODEL` projection set to
  `xiaomi/mimo-v2.5-pro`, independent of the primary
  `HERMES_DEFAULT_MODEL`.
- **FR-009**: The TencentDB embedding provider, base URL, model
  `perplexity/pplx-embed-v1-4b`, and 1536 dimensions MUST remain unchanged.
- **FR-010**: The migration MUST NOT change Titus identity, memberships,
  routes, named volumes, channels, MCP tools, memory backend, email intake,
  approval policy, or action authority.
- **FR-011**: Production activation MUST restart only Titus and MUST NOT restart
  or reconfigure Walter or Mitchel.
- **FR-012**: The deploy and qualification paths MUST verify the exact
  inference, delegation, memory, OAuth, ownership, permissions, and health
  projections without printing secret values.
- **FR-013**: Activation MUST preserve a tested, value-safe rollback path for
  source, Phase selectors, runtime configuration, and Titus auth state.
- **FR-014**: A normal observation interval MUST detect Codex authentication,
  refresh, rate-limit, provider, delegation, and memory errors before the
  migration is accepted.
- **FR-015**: Production canaries MUST be read-only or no-tool operations and
  MUST NOT send email, mutate business data, or expand agent authority.

### Key Entities

- **Titus inference projection**: Provider, base URL, model, and primary
  reasoning effort used for interactive Hermes requests.
- **Titus delegation projection**: Provider, base URL, model, high-effort
  setting, and execution bounds used by child agents.
- **Titus OAuth credential**: A persistent, Titus-owned Hermes auth record with
  restricted ownership and permissions. Its secret contents are never
  recorded in feature artifacts.
- **Memory provider projection**: The independent OpenRouter-backed memory LLM
  and embedding settings used by the TencentDB memory gateway.
- **Activation evidence**: Value-free checks, timestamps, source revisions,
  health results, canary results, and rollback handles proving the cutover.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Titus completes one controlled restart with zero restarts of
  Walter, Mitchel, or unrelated production workloads.
- **SC-002**: Runtime inspection proves the exact Sol/medium primary and
  Luna/high delegation projections, including every delegation bound.
- **SC-003**: Dashboard, API, and memory health endpoints all return healthy
  results after activation.
- **SC-004**: One no-tool primary canary and one bounded no-mutation delegation
  canary complete successfully through Codex.
- **SC-005**: A memory capture/recall qualification succeeds while the live
  process projects MiMo for memory processing and the existing Perplexity
  embedding model.
- **SC-006**: One normal observation interval ends with zero relevant OAuth,
  refresh, rate-limit, provider, delegation, or memory errors.
- **SC-007**: Credential scans find zero OAuth token, authorization code, or
  callback disclosure in Git changes, logs, and deployment evidence.

## Assumptions

- The owner's ChatGPT plan currently includes Codex access and has sufficient
  shared agentic usage for Titus's expected workload.
- Hermes Agent v0.19.0 continues to support the live
  `openai-codex`/`chatgpt` OAuth flow already used by Walter and Mitchel.
- Titus remains a named, owner-operated production workload; this change does
  not create self-service credential enrollment or customer provisioning.
- OpenRouter remains an approved dependency for Titus memory processing and
  embeddings until a separately specified memory-provider migration.
- The user instruction to proceed is approval for the implementation and
  controlled Titus-only production migration, but not for destructive cleanup,
  credential sharing, or authority expansion.
