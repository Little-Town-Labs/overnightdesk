# Delivery Profile: 046-eve-practice-agent

## Classification

- Project: `overnightdesk`
- Context: `greenfield`
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

- Policy: `after-initial-architecture`
- Project: `overnightdesk`
- Status: `ready`

- Canonical overnightdesk graph contains 13789 nodes and confirms tenants, infra, and src as existing architectural boundaries.
- Targeted README.md and package.json reads confirm experiments/ is a new isolated boundary and root Node/AI SDK versions are incompatible with eve 0.51.1.

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| setup-readiness-review | T001, T002 | no | codex-luna read-only | none | `test -f specs/046-eve-practice-agent/plan.md test -f specs/046-eve-practice-agent/tasks.md` |

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.
