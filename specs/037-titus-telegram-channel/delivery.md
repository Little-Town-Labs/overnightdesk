# Delivery Profile: 037-titus-telegram-channel

## Classification

- Project: `overnightdesk`
- Context: `brownfield`
- Scale: `feature`
- Risk: `production`
- Mode: `readonly-delegation`
- Spec Kit required: `yes`
- Mutation owner: `sol-lead`

## Model Routing

- Planning and orchestration: `codex-sol`
- Implementation: `lead-only`
- Final quality gate: `codex-sol`
- Automated remediation ceiling: one Luna remediation and one Sol delta review

## Codebase Graph

- Policy: `required-before-planning`
- Project: `overnightdesk`
- Status: `ready`

- Indexed 13075 nodes and 26114 edges for the isolated brownfield worktree after the Telegram changes.
- Targeted graph search found the loader, startup script, config, Telegram contract tests, runtime projection tests, and runbook paths.
- Live read-only inspection verified the pinned Hermes Telegram adapter uses allow_from for DMs and group_allow_from for group/forum/channel sender scope.

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| telegram-quality-review | T024, T025 | no | codex-luna read-only | none | `git diff --check bash -n tenants/hermes-titus/runtime/load-phase-env.sh tenants/hermes-titus/runtime/start-with-secrets.sh PYTHONPATH=tenants/hermes-titus/tests:tenants/hermes-titus/mcp-servers/guarded-agentmail pytest tenants/hermes-titus/tests/test_telegram_runtime_contract.py tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_runtime_projection.py -q` |

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.
