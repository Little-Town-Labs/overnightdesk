# Data Model: Titus Codex OAuth Migration

No database schema is introduced. The feature changes five configuration-state
records and their invariants.

## TitusInferenceProjection

| Field | Value | Invariant |
|---|---|---|
| provider | `openai-codex` | Exact; no OpenRouter inference fallback |
| base_url | `https://chatgpt.com/backend-api/codex` | Exact |
| model | `gpt-5.6-sol` | Loaded from `HERMES_DEFAULT_MODEL` |
| reasoning_effort | `medium` | Preserves Titus's pre-migration effort |

## TitusDelegationProjection

| Field | Value | Invariant |
|---|---|---|
| provider | `openai-codex` | Exact |
| base_url | `https://chatgpt.com/backend-api/codex` | Exact |
| model | `gpt-5.6-luna` | Exact |
| reasoning_effort | `high` | Independent of parent effort |
| max_concurrent_children | `3` | Upper bound |
| max_spawn_depth | `1` | Upper bound |
| max_iterations | `30` | Upper bound |
| child_timeout_seconds | `600` | Upper bound |
| orchestrator_enabled | `true` | Enables bounded delegation |
| inherit_mcp_toolsets | `true` | Preserves existing tool context |
| subagent_auto_approve | `false` | Existing approval policy prevails |

## TitusOAuthState

| Field | Constraint |
|---|---|
| owner | Titus runtime UID/GID (`10000:10000`) |
| mode | `0600` |
| active_provider | `openai-codex` |
| auth_mode | `chatgpt` |
| location | Titus persistent Hermes auth store |
| contents | Never logged, committed, copied from another agent, or stored in Phase |

State transitions:

```text
unenrolled -> enrolled/inactive -> enrolled/active -> refreshable
                                      |                |
                                      +--> invalid <---+
```

Production activation requires `enrolled/active` with value-free status proof.
`invalid` requires stop/rollback; it never authorizes credential copying.

## MemoryProviderProjection

| Field | Value | Invariant |
|---|---|---|
| LLM provider/base | OpenRouter / existing base URL | Independent of Codex |
| LLM model | `xiaomi/mimo-v2.5-pro` | From `MEMORY_TENCENTDB_LLM_MODEL` |
| embedding provider/base | Existing OpenRouter projection | Unchanged |
| embedding model | `perplexity/pplx-embed-v1-4b` | Unchanged |
| dimensions | `1536` | Unchanged |
| API credentials | Phase-injected, never output | Value-free verification only |

## ActivationEvidence

| Attribute | Constraint |
|---|---|
| source revision | Exact reviewed Git revision |
| image identity | Existing qualified Hermes v0.19.0 image |
| timestamps | UTC |
| before/after restarts | Titus and unrelated-runtime comparison |
| projections | Non-secret provider/model/effort/bounds only |
| auth | Provider, mode, owner, permissions only |
| health/canaries | Status and bounded diagnostic summaries |
| memory | Capture/recall result without business or sensitive content |
| rollback | Restricted backup handles and restoration result |
| secrets | Never included |
