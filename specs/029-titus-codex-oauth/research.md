# Research: Titus Codex OAuth Migration

## Decision 1: Use Hermes's native `openai-codex` provider

**Decision**: Configure Titus's primary model as `gpt-5.6-sol` through
`openai-codex` at `https://chatgpt.com/backend-api/codex`, retaining Titus's
current medium primary reasoning effort.

**Rationale**: Live Walter and Mitchel runtimes on the same Hermes v0.19.0
image already use the native provider and report `chatgpt` auth mode. OpenAI's
current Codex model guidance identifies Sol as the frontier coding-agent model,
and the user's ChatGPT plan is the intended billing boundary.

**Alternatives considered**:

- Keep MiMo through OpenRouter: rejected because it does not satisfy the
  requested subscription migration.
- Route ChatGPT credentials through a custom proxy: rejected because Hermes
  already supplies the provider and auth lifecycle.
- Copy Walter or Mitchel's `auth.json`: rejected because credentials and trust
  state belong to each durable agent boundary.

**Sources**:

- <https://developers.openai.com/codex/models/>
- <https://help.openai.com/en/articles/11369540-codex-in-chatgpt>
- Live `hermes auth add --help`, `hermes auth status`, and value-free
  Walter/Mitchel config inspection on 2026-07-26

## Decision 2: Use Luna at high effort for bounded delegation

**Decision**: Configure delegation as `openai-codex` /
`gpt-5.6-luna` / `high`, with three concurrent children, one spawn level, 30
iterations, a 600-second child timeout, orchestrator support enabled, inherited
MCP toolsets, and subagent auto-approval disabled.

**Rationale**: The user selected Luna/high explicitly. The bounds match the
already operating Walter pattern and constrain cost, time, and authority while
keeping primary Titus interactions at medium effort.

**Alternatives considered**:

- Luna at medium effort: rejected by the explicit user selection.
- Sol for both parent and child: rejected because it ignores the requested
  delegation lane and may consume more subscription capacity.
- Unbounded delegation: rejected for security, reliability, and shared-plan
  usage control.

## Decision 3: Decouple memory processing before cutover

**Decision**: Add `MEMORY_TENCENTDB_LLM_MODEL=xiaomi/mimo-v2.5-pro` to the
memory Phase projection and map it to `TDAI_LLM_MODEL`. Continue using
OpenRouter for the memory LLM API key/base URL and the existing Perplexity
embedding model.

**Rationale**: Titus's current startup script assigns
`TDAI_LLM_MODEL=$HERMES_DEFAULT_MODEL`. Changing that selector directly to Sol
would send an OpenAI Codex model identifier to an OpenRouter-backed standalone
memory adapter. Live installed TencentDB gateway source confirms that
`TDAI_LLM_MODEL`, `TDAI_LLM_BASE_URL`, and `TDAI_LLM_API_KEY` form an
independent processing client.

**Alternatives considered**:

- Reuse Sol for memory processing: rejected because the Codex subscription
  auth flow is not the memory adapter's OpenAI-compatible API credential.
- Migrate embeddings and memory LLM to Codex simultaneously: rejected as an
  unnecessary scope expansion with no established embedding contract.
- Keep the coupling and rely on fallback behavior: rejected because memory
  health must be deterministic and observable.

## Decision 4: Enroll fresh Titus-scoped OAuth state

**Decision**: Run Hermes's no-browser OAuth enrollment against Titus's own
persistent volume, require active provider `openai-codex` and auth mode
`chatgpt`, and preserve mode 0600 / runtime ownership.

**Rationale**: A durable agent boundary includes credential and trust state.
Fresh enrollment avoids cross-agent file copying while still authorizing the
same owner's subscription.

**Alternatives considered**:

- Store OAuth in Phase: rejected because the interactive OAuth lifecycle and
  refresh state belong in Hermes's protected auth store.
- Inject access tokens as environment variables: rejected because refresh,
  rotation, and accidental-output risks increase.

## Decision 5: Use a one-restart, fail-closed activation

**Decision**: Complete tests, copied-volume staging, source synchronization,
OAuth enrollment, and value-safe backups before changing compatible Phase
selectors and restarting only Titus once. Roll back immediately on any failed
projection, health, canary, memory, isolation, or log gate.

**Rationale**: The existing loader's exact allowlist and the coupled startup
path make partial activation unsafe. A single compatible transaction minimizes
downtime and avoids affecting Walter, Mitchel, or unrelated workloads.

**Alternatives considered**:

- Restart once per configuration change: rejected because intermediate states
  are knowingly incompatible.
- Change Phase before source: rejected because the current loader rejects the
  new memory key.
- Broad `docker compose` restart: rejected because only Titus is in scope.

## Subscription and operational caveat

ChatGPT Codex usage draws from the plan's shared agentic usage pool. Rate-limit
or plan-exhaustion signals are therefore an operational condition, not proof of
a bad configuration. The observation and rollback gates distinguish those
responses from invalid OAuth, refresh, provider, delegation, and memory errors.
