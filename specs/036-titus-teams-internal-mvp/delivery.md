# Delivery Profile: 036-titus-teams-internal-mvp

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
- Project: `home-frosted639-src-overnightdesk-suite-overnightdesk`
- Status: `ready`

- index_status: 12,697 nodes and 23,765 edges at canonical main checkout
- search_code: tenants/hermes-titus/README.md and runtime/load-phase-env.sh contain Teams allowlist surfaces
- search_code: meeting processor and meeting filer graph/custody/state/titus surfaces identified under tenants/hermes-titus/
- targeted reads verified the existing Titus runtime, Phase loader, Teams boundary, and separate meeting-processing identity

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| final-graph-review | T039 | no | codex-luna read-only | none | `python3 -c 'from pathlib import Path; assert Path("specs/036-titus-teams-internal-mvp/research.md").exists()' git diff --check` |

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.
