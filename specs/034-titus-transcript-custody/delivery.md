# Delivery Profile: 034-titus-transcript-custody

## Classification

- Project: `overnightdesk`
- Context: `brownfield`
- Scale: `system`
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
- Project: `home-frosted639-src-overnightdesk-suite-overnightdesk-worktrees-codex-feature-034-titus-transcript-custody`
- Status: `ready`

- Moderate codebase-memory index is ready at 90c238967c2738af3c6cd3d902ac754a75fc9ba0 with 11858 nodes and 20750 edges.
- Architecture/search identified the deployed meeting processor RunOnce, Graph delta client, atomic state, safe health, and handoff as the extension seam.
- Architecture/search identified the existing Titus email SecurityTeam safe_content to authenticated Hermes API path as the trust-boundary precedent.
- Targeted source reads verified meeting-processor config, Graph URL/client, state validation, orchestration, runtime projection, SecurityTeam scan/pipeline/approval behavior, Hermes client, and project-knowledge exclusions.
- Official Microsoft Graph and Hermes documentation verified the transcript content route, WebVTT behavior, stateless chat endpoint, and retained API-server toolset risk.

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| architecture-security-review | T003 | no | codex-luna read-only | none | `python3 /home/frosted639/src/ringer-workflows/scripts/delivery_profile.py validate-report --kind readonly --report report.md` |

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.

## Completed Gates

- Spec Kit consistency analysis: 18 functional requirements, six measurable
  success criteria, 30 tasks, 100 percent inferred build/verification coverage,
  zero Critical/High contradictions, and zero constitution conflicts.
- Prepared package:
  `/tmp/ringer-delivery/overnightdesk-034-titus-transcript-custody/`.
- Read-only architecture/security report:
  `/tmp/ringer-delivery/overnightdesk-034-titus-transcript-custody/readonly/architecture-security-review/report.md`.
- Ringer result: PASS in one attempt. The review froze the dependency-first
  sequence and required deterministic Titus-output rejection for protected
  provider values, Graph routes, and credential-like markers. That requirement
  is now recorded in FR-018, the Titus contract, and T014.

## Implementation and Final Gates

- SecurityTeam PR 3 merged at `4759c3f` and was deployed before the consumer.
  Its authenticated production canary returned `blocked`, no queue ID, and an
  unchanged pending count of zero.
- The refreshed moderate codebase-memory graph contains 12,045 nodes and
  21,444 edges. The traced depth-three path confirms `RunOnce` commits metadata
  before `processOneTranscript`, then follows the bounded Graph content,
  SecurityTeam, Titus, second state commit, handoff, and health boundaries.
- Local qualification passed Go unit/race/vet/build, 14 Python runtime and
  security contracts, shell parsing, source leak checks, the pinned ARM64 image
  build, and non-root/read-only/no-port/no-secret container inspection.
- The final read-only Sol Ringer quality manifest was invoked once and retried
  once. Both attempts stopped during skill intake because the installed
  `code-review-and-quality` skill references absent `security-checklist.md` and
  `performance-checklist.md` files. No report or repository mutation was
  produced, and the one-retry ceiling prevented another automated loop.
- The accountable Sol delta review then checked correctness, architecture,
  custody, security, performance bounds, dependencies, deployment, and
  rollback. It corrected provider-ID path encoding, state/output digest
  verification, case-insensitive protected-output matching, SecurityTeam body
  and response validation, and activation rollback. No Critical or Required
  code finding remains.
