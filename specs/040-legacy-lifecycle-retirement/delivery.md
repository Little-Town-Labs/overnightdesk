# Delivery Profile: 040-legacy-lifecycle-retirement

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

- Targeted auth-route reads confirmed POST currently dispatches direct email signup to Better Auth.
- Targeted page and dashboard reads confirmed legacy acquisition, billing, wizard, provisioning, restart, and self-delete surfaces remain for the intended RED contracts.

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| t005-t007-limited-frontend-contract-review | T005, T006, T007 | no | codex-luna read-only | none | `npx tsc --noEmit --incremental false`; `git diff --check` |

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.
