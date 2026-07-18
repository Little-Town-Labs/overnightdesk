# Implementation Plan: Hermes Runtime Identity

**Branch**: `019-hermes-runtime-identity` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/019-hermes-runtime-identity/spec.md`

## Summary

Model Hermes runtimes by use case and primary memory boundary, then migrate the
active Aegis platform runtime from the generic `hermes-agent` identity to
`hermes-walter`. Keep the existing container and named volume intact by using
Docker's in-place container rename, update every active consumer to the new DNS
name, and migrate the protected AgentMail route additively from `agent` to
`walter` while retaining the old route and state as rollback artifacts.

## Technical Context

**Language/Version**: Bash 5; TypeScript/Node 24 in SecurityTeam and Ops; Go in provisioner and audit; YAML/Markdown platform contracts

**Primary Dependencies**: Docker Engine 29.6.0, systemd 255, Phase CLI 2.1.0, Nginx 1.27, jq, SSH/rsync

**Storage**: Existing `hermes-agent-data` named volume (1.8 GB, 23,664 files); separate AgentMail intake state volume; Open Brain/Trevor/Titus memory services remain unchanged

**Testing**: Shell contract assertions; SecurityTeam unit tests; Go unit tests; YAML parsing; live Docker DNS, Nginx, OIDC, Hermes Runs, intake, memory, cron, and audit checks

**Target Platform**: `aegis-prod` Ubuntu ARM64 production VM

**Project Type**: Multi-repository identity and production-routing migration

**Performance Goals**: Complete the active-name cutover inside a 15-minute rollback objective; preserve the existing 60-second AgentMail polling cadence

**Constraints**: No state deletion; no concurrent old/new writers; no secret or memory-body output; public hostname and stable tenant record remain unchanged; Phase app/service-account boundaries remain unchanged

**Scale/Scope**: Four conceptual runtimes, three active Aegis runtimes, one off-host runtime, one container rename, one intake route migration, six owning repositories

## Constitution Check

*GATE: Passed before research and re-checked after design with one production activation condition.*

- **Customer data is sacred**: PASS. The live named volume remains mounted in
  place; the plan does not copy, delete, or inspect conversation content.
- **Security and secrets**: CONDITIONAL PASS. Inventory found pre-existing
  credential material in runtime memory/backup artifacts. Values are excluded
  from evidence. Production activation is gated on an owner-approved rotation
  and remediation decision; source work may proceed first.
- **Owner decides**: PASS. The user authorized the next migration slice. Secret
  rotation, old-artifact deletion, and inbox replacement remain separately
  gated actions.
- **Simple over clever**: PASS. Docker supports an in-place container rename;
  retaining the existing named volume avoids a risky state copy and secretful
  container recreation.
- **Interfaces stay compatible**: PASS. The protected `walter` route is added
  before the old `agent` route is disabled. Stable `tenant-0`, public hostname,
  AgentMail address, and Phase app identities remain compatibility surfaces.
- **Test-first and observable**: PASS. Exact route/DNS assertions fail before
  implementation; every production state change has a health and rollback gate.

## Project Structure

### Documentation (this feature)

```text
specs/019-hermes-runtime-identity/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── runtime-identity-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
overnightdesk/
├── infra/hermes/
├── infra/nginx/
├── tenants/hermes-walter/
└── tenants/hermes-titus/email-poller/

overnightdesk-securityteam/
├── src/pipeline/agentmail-route-policy.ts
└── test/pipeline/

overnightdesk-engine/
├── internal/hermes/dashboard_oidc_test.go
└── deploy/hermes-provisioner.env.example

overnightdesk-ops/
└── services/ and src/mcp/

overnightdesk-operations-audit/
├── deploy/
├── internal/config/
└── standards/

overnightdesk-platform-standard/
├── WHAT/
├── HOW/
└── docs/decisions/
```

**Structure Decision**: Keep behavior in each owning repository and use one
feature branch/worktree per repository because the suite is intentionally not a
monorepo. The already-created parent worktree is the Aegis coordination and
Spec Kit source; sibling worktrees carry SecurityTeam, engine, Ops, audit, and
standard changes. Production activation remains sequential even when source
preparation is independent.

## Delivery Phases

1. **Identity contract**: Land the runtime/persona/human/memory model and
   Walter's source-owned default persona.
2. **Additive consumers**: Teach intake, SecurityTeam, OIDC tests, Ops, and
   audit about `hermes-walter` while retaining old route compatibility.
3. **Phase preparation**: Copy the 14-key `agent` intake path to `walter` and
   compare key count/fingerprint without outputting values.
4. **Aegis cutover**: Stop Agent intake, rename the running platform container,
   update Nginx and OIDC mapping, start Walter intake with preserved state, and
   verify each surface before advancing.
5. **Closeout**: Update standards, Ops knowledge, audit expectations, PRs, and
   `deploys.log`; retain `agent` route, old intake state, and legacy volume name
   for rollback/compatibility.

## Complexity Tracking

No constitution violations require exceptions. The security condition is an
activation gate, not an accepted violation.
