# ADR-006: Isolate the Eve Practice Agent

## Status

Accepted for local experimentation

## Date

2026-09-04

## Context

The owner wants a small Eve agent to learn the framework and exercise a ChatGPT subscription-backed model before considering any change to the named Hermes runtimes. Current Eve requires Node.js 24 and AI SDK 7, while the root OvernightDesk application retains a different compatibility range. Eve also supplies shell, file, web, and self-delegation tools by default, and its `chatgpt()` model relies on local Codex authentication that Eve does not deploy.

Putting this work under `tenants/` or `infra/` would imply runtime or deployment authority it does not have. Reusing a normal or named-runtime Codex home would blur credential ownership.

## Decision

Create a separate npm application at `experiments/eve-practice-agent/` with pinned dependencies and a Node.js 24 engine requirement.

The root agent uses Eve's `chatgpt()` helper for explicitly invoked live sessions and `mockModel()` for provider-free verification. All Eve default tools are removed with `disableTool()` sentinels. The app defines no business integrations, database, schedules, skills, authored channels, or subagents.

Every live authentication or development command goes through one allowlisted wrapper. It requires `EVE_PRACTICE_CODEX_HOME` to resolve to an absolute location outside the repository, passes it to Codex as `CODEX_HOME`, and never reads credential content. Symlink resolution prevents an apparently external directory from placing credentials inside the repository.

This decision authorizes local practice only. It does not authorize an Aegis or Vercel deployment, an OvernightDesk integration, an OpenRouter fallback, or replacement of Hermes, Titus, or Walter.

## Alternatives Considered

### Add Eve to the root Next.js package

Rejected because the current Node.js and AI SDK requirements differ and the experiment does not need application integration.

### Place the agent under a tenant directory

Rejected because tenant directories are canonical deploy sources for named Hermes workflows; this agent is neither a tenant nor an approved runtime.

### Reuse the operator's default Codex login

Rejected because the experiment needs an explicit credential identity and removal boundary that cannot silently inherit unrelated configuration.

### Select a Gateway or direct API-key model

Rejected for this increment because the purpose is to exercise Eve's ChatGPT subscription adapter. A deployable provider path is a separate architecture and security decision.

## Consequences

- Contributors can compile and evaluate the agent without credentials or model usage.
- Live practice requires a dedicated Codex login and deliberate environment setup.
- The disable sentinel files are part of the security boundary and must track changes to Eve's default tool set when upgrading.
- Eve-managed local session artifacts may contain prompts and responses and remain untracked; operators must avoid sensitive input.
- Any deployment or connection to OvernightDesk requires a new approved feature, threat review, runtime design, rollout, and rollback plan.
