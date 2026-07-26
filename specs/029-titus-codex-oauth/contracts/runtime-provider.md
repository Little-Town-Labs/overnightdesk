# Runtime Provider Contract

## Phase input

`/agents/hermes-titus/core` MUST contain:

- `HERMES_DEFAULT_MODEL=gpt-5.6-sol`
- the existing non-provider Titus core keys
- `OPENROUTER_API_KEY`, retained solely for memory processing and embeddings

`/agents/hermes-titus/memory` MUST contain:

- `MEMORY_TENCENTDB_LLM_MODEL=xiaomi/mimo-v2.5-pro`
- the existing TencentDB settings
- the existing OpenRouter embedding provider/base/model settings
- `MEMORY_TENCENTDB_EMBEDDING_MODEL=perplexity/pplx-embed-v1-4b`
- `MEMORY_TENCENTDB_EMBEDDING_DIMENSIONS=1536`

Both loaders MUST fail closed on missing, extra, or incorrect selector keys.
Neither Phase document contains Codex OAuth material.

## Process projection

Hermes PID 1 MUST receive:

```text
HERMES_INFERENCE_MODEL=gpt-5.6-sol
```

The memory gateway MUST receive:

```text
TDAI_LLM_MODEL=xiaomi/mimo-v2.5-pro
TDAI_LLM_BASE_URL=https://openrouter.ai/api/v1
TDAI_EMBEDDING_MODEL=perplexity/pplx-embed-v1-4b
TDAI_EMBEDDING_DIMENSIONS=1536
```

`TDAI_LLM_API_KEY` and the embedding key are required but MUST only be verified
for presence; their values MUST never be printed.

## Hermes configuration

```yaml
model:
  default: gpt-5.6-sol
  provider: openai-codex
  base_url: https://chatgpt.com/backend-api/codex

agent:
  reasoning_effort: medium

delegation:
  provider: openai-codex
  base_url: https://chatgpt.com/backend-api/codex
  model: gpt-5.6-luna
  reasoning_effort: high
  orchestrator_enabled: true
  max_concurrent_children: 3
  max_iterations: 30
  max_spawn_depth: 1
  child_timeout_seconds: 600
  inherit_mcp_toolsets: true
  subagent_auto_approve: false
```

The deployment scripts may render `model.default` from Phase but MUST assert
the exact final value.

## Auth contract

- File: Titus volume-local Hermes `auth.json`
- Owner/group: `10000:10000`
- Mode: `0600`
- Active provider: `openai-codex`
- Provider auth mode: `chatgpt`
- Enrollment: fresh Hermes OAuth authorization against Titus's own volume
- Forbidden: copying another runtime's file, printing the document, storing it
  in Git/Phase/logs, or accepting inactive/ambiguous provider state

## Activation and rollback

Activation order:

1. Test and review source.
2. Stage against a copied Titus volume.
3. Back up current Titus source/config/auth and value-safe Phase selectors.
4. Enroll and verify Titus OAuth.
5. Synchronize compatible source.
6. Update the two exact Phase model selectors.
7. Restart only `hermes-titus`.
8. Verify projections, auth metadata, health, canaries, memory, isolation, and
   bounded logs.

Any failed gate stops the activation. Rollback restores the previous source and
selector projection plus the prior restricted auth/config state when needed,
then restarts only Titus. Rollback does not delete a volume, credential record,
message, or memory.
