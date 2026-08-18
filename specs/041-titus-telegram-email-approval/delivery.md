# Delivery Profile: 041-titus-telegram-email-approval

## Classification

- Project: `overnightdesk`
- Context: `brownfield`
- Scale: `feature`
- Risk: `sensitive`
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

- search_graph: guarded-agentmail.server._elicit_owner_approval
- get_code_snippet: guarded-agentmail.service.GuardedEmailService.send_approved_email
- targeted source: tenants/hermes-titus/config/config.yaml
- targeted source: tenants/hermes-titus/runtime/prepare-volume.sh
- Aegis read-only: pinned adapter send_exec_approval and tools.approval gateway resolver

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| readonly-contract-review | T001, T002, T003 | no | codex-luna read-only | none | `python -m pytest tenants/hermes-titus/mcp-servers/guarded-agentmail/tests tenants/hermes-titus/tests/test_telegram_email_approval_contract.py python -m compileall -q tenants/hermes-titus/plugins/approvals Report contract gaps without editing implementation paths` |

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.
