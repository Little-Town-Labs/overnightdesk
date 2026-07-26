# Implementation Plan: Titus Codex OAuth Migration

**Branch**: `agent/codex/titus-codex-oauth` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from
`/specs/029-titus-codex-oauth/spec.md`

## Summary

Migrate Titus's interactive Hermes inference from OpenRouter/MiMo to the
owner's ChatGPT/Codex OAuth subscription using Sol at medium effort and bounded
Luna delegation at high effort. First separate the TencentDB memory LLM
selector from `HERMES_DEFAULT_MODEL`, retaining OpenRouter/MiMo and the existing
Perplexity embedding model exclusively for memory. Enroll a fresh Titus-owned
OAuth credential, qualify a copied production volume, then perform one
reversible Titus-only restart with value-free verification and observation.

## Technical Context

**Language/Version**: Bash 5, Python 3.13 inside Hermes Agent v0.19.0, YAML,
TypeScript/Next.js runtime-variable metadata

**Primary Dependencies**: Hermes Agent v0.19.0, Hermes `openai-codex`
authentication provider, ChatGPT Codex backend, Phase Connect Server,
TencentDB memory gateway, OpenRouter memory LLM/embedding APIs, Docker,
systemd, and existing Titus qualification/deploy scripts

**Storage**: Existing `hermes-titus-data` Docker named volume containing
Hermes config/auth/session state; existing TencentDB memory storage; no database
or schema migration

**Testing**: Python projection contracts, Jest variable-catalog contracts,
shell syntax, YAML parse, repository qualification, secret scan, copied-volume
container staging, Hermes auth/config/process inspection, internal health
probes, primary/delegation no-mutation canaries, memory capture/recall, bounded
logs, restart comparison, and rollback rehearsal

**Target Platform**: `aegis-prod`, Linux ARM64 Docker host with the repository's
Hermes v0.19.0 derived image

**Project Type**: Production tenant runtime configuration and operations

**Performance Goals**: Titus becomes healthy within the existing service
timeout; primary interactions remain medium effort; delegated work terminates
within existing child concurrency, depth, iteration, and timeout bounds

**Constraints**: Fresh Titus-scoped OAuth; no token output; no credential
copying; no email or business-data mutation canaries; no identity, membership,
route, volume, tool, channel, approval, or authority change; OpenRouter remains
available to memory only; restart only Titus; stop and roll back on first
unresolved failure

**Scale/Scope**: One tenant runtime, one named volume, one OAuth enrollment,
one primary provider change, one delegation change, one memory-selector split,
one application repository PR, one platform-standard reconciliation, and one
production ledger entry

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Data Sacred**: PASS. The existing Titus volume and TencentDB memory remain
  intact. Staging uses a copy and rollback never deletes data.
- **Security and Least Privilege**: PASS. OAuth stays in Titus's mode-0600 auth
  file, no token or callback enters source/Phase/evidence, OpenRouter remains
  scoped to memory, and approval/authority boundaries do not change.
- **Owner Decides**: PASS. The user explicitly approved the migration and
  selected Luna at high effort. Destructive cleanup and authority expansion
  remain outside that approval.
- **Simple Over Clever**: PASS. Reuse the existing Hermes provider, auth store,
  tenant loader, launcher, qualifier, and deploy scripts. Add one explicit
  memory-model setting instead of a second runtime or proxy.
- **Owner Time Protected**: PASS. Pre-enrollment and copied-volume staging
  happen before the single production restart; only the OAuth authorization
  interaction requires owner participation.
- **Honesty and Quality**: PASS. Acceptance requires live provider/auth/process
  projections, three health surfaces, isolated canaries, memory evidence,
  restart comparison, bounded logs, and a normal observation interval.
- **Test First**: PASS. Projection and variable-contract tests are changed
  first and must fail on the OpenRouter-coupled implementation.
- **Operational Truth**: PASS. Feature artifacts, tenant runbook, deploy
  ledger, and platform standard will reflect the exact live boundary.
- **Post-design re-check**: PASS. No new service, database, credential-sharing
  mechanism, public API, or persistent data type is introduced.

## Architecture and Activation Sequence

1. Add a Phase-backed `MEMORY_TENCENTDB_LLM_MODEL` contract and project it to
   `TDAI_LLM_MODEL`; keep its API key/base URL on OpenRouter.
2. Change `HERMES_DEFAULT_MODEL` semantics to the interactive Codex model and
   project the exact `openai-codex` Sol/medium and Luna/high runtime config.
3. Extend value-free local/deploy checks for OAuth state, file permissions,
   inference/delegation bounds, and the independent memory projection.
4. Stage the source against a copied Titus volume without production delivery
   or business-data mutation.
5. Enroll `openai-codex` through Hermes against Titus's persistent auth file,
   verify `chatgpt` mode, and retain a restricted rollback backup.
6. Synchronize exact reviewed source and Phase selectors as one compatible
   transaction, restart only Titus, and stop on any failed gate.
7. Run internal/public health, primary/delegation, memory, isolation, and log
   checks; observe; then reconcile the standard and deployment ledger.

The transaction order is deliberate: the current loader rejects unknown memory
keys, while the current startup path would feed a changed primary model into the
memory gateway. New compatible source must therefore be staged before the two
Phase selector changes and the single restart.

## Project Structure

### Documentation (this feature)

```text
specs/029-titus-codex-oauth/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/runtime-provider.md
├── quickstart.md
└── tasks.md
```

### Source Code

```text
overnightdesk/
├── tenants/hermes-titus/
│   ├── config/config.yaml
│   ├── runtime/
│   │   ├── load-phase-env.sh
│   │   └── start-with-secrets.sh
│   ├── scripts/
│   │   ├── deploy-aegis.sh
│   │   └── qualify.sh
│   ├── mcp-servers/guarded-agentmail/tests/
│   │   └── test_runtime_projection.py
│   └── README.md
├── src/lib/
│   ├── managed-agent-variable.ts
│   └── __tests__/managed-agent-variable.test.ts
├── .specify/{feature.json,roadmap.md}
└── specs/029-titus-codex-oauth/

overnightdesk-platform-standard/
└── exact current-state and Hermes operations references selected after
    application qualification

aegis-prod/
├── /opt/hermes-titus/source/
├── Phase paths /agents/hermes-titus/{core,memory}
├── hermes-titus-data
└── /etc/systemd/system/hermes-titus.service
```

**Structure Decision**: The application repository owns the Titus runtime
projection, deploy/qualification logic, UI credential description, and feature
evidence. The platform-standard repository records the accepted production
boundary after activation. Aegis retains only exact synchronized source,
secret-provider state, persistent runtime state, and value-safe evidence.

## Complexity Tracking

No constitution violations require an exception.
