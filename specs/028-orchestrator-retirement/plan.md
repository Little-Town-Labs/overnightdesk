# Implementation Plan: Internal Workspace and Orchestrator Retirement

**Branch**: `agent/codex/orchestrator-retirement` | **Date**: 2026-07-25 |
**Spec**: [spec.md](spec.md)

**Input**: Feature specification from
`/specs/028-orchestrator-retirement/spec.md`

## Summary

Retire the unused public platform orchestrator and its Docker socket proxy from
the active Aegis production plane. Before stopping anything, export the three
incident records into secret-free platform knowledge, remove Ops dependencies
on the orchestrator database and Flight Recorder, make the Compose source omit
all three retired services, and add deterministic retirement qualification.
Production activation denies the old hostname, disables automatic restart,
stops the retained containers, and preserves their database, volumes,
configuration, and rollback evidence for a 14-day observation window.

The same change reframes OvernightDesk as an authenticated internal business
workspace. Gary and Austin use Titus through separate platform identities and
exact memberships. Actual Austin membership activation is a separately
auditable identity operation once his account exists; this retirement neither
shares credentials nor invents an identity.

## Technical Context

**Language/Version**: TypeScript on Node.js 22 for OvernightDesk Ops; Go 1.24
for operations-audit; YAML, Markdown, Bash, Docker Compose, and Nginx
configuration for platform source and operations

**Primary Dependencies**: `@modelcontextprotocol/sdk`, `better-sqlite3`,
`js-yaml`, `pg`, Vitest, Docker Compose v2, Docker Engine, Nginx

**Storage**: Static platform-standard YAML for preserved incident knowledge;
existing SQLite Ops fact store and shared operations PostgreSQL remain active;
retired orchestrator PostgreSQL volume remains retained but stopped

**Testing**: Vitest, `go test ./...`, YAML parsing, Docker Compose
configuration rendering, shell qualification, and live negative/health checks

**Target Platform**: Linux/ARM64 on Oracle Cloud (`aegis-prod`) with
containerized services; Vercel-hosted authenticated workspace

**Project Type**: Multi-repository production retirement and documentation
change

**Performance Goals**: No material performance change; active workload health
checks complete within their existing timeouts

**Constraints**: Zero destructive cleanup; no secret values in evidence or
Git; no production mutation before source and rollback evidence qualify; the
retired state must survive Docker/host restart; the stale recorder heartbeat
must be paused rather than deleted during observation; the observation-end
reminder must be one-shot, restart-persistent, and use the existing
communication-module API without logging its API key

**Scale/Scope**: One public hostname, three stopped containers, two retained
named volumes, three incident records, four source repositories, and the named
Walter/Titus/Mitchel business runtimes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Business/use-case boundary**: PASS. The change removes dormant
  customer-hosting authority and makes the internal-workspace direction
  explicit.
- **Least privilege**: PASS. No active service retains Docker socket access or
  the proxy exception.
- **Human approval**: PASS. The owner explicitly approved reversible
  retirement; deletion and Austin membership activation remain separately
  approved operations.
- **Named workloads**: PASS. Existing named runtimes are unchanged and must
  pass post-activation checks.
- **Operational truth**: PASS. PRD, README, standard, audit policy, Ops tools,
  and deployment ledger are synchronized.
- **Recoverability**: PASS. Database dump, incident export, configuration
  inventory, prior restart policies, and rollback commands precede stopping
  components.
- **Test-first delivery**: PASS. Qualification and dependency-removal tests are
  written before active source is changed.

## Project Structure

### Documentation (this feature)

```text
specs/028-orchestrator-retirement/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/retirement-contract.md
└── tasks.md
```

### Source Code

```text
overnightdesk/
├── docker-compose.yml
├── README.md
├── PRD.md
├── infra/orchestrator-retirement/
│   ├── walter-orchestrator-retirement-reminder.sh
│   ├── walter-orchestrator-retirement-reminder.service
│   └── walter-orchestrator-retirement-reminder.timer
├── scripts/qualify-orchestrator-retirement.sh
├── scripts/test-walter-orchestrator-retirement-reminder.py
└── specs/028-orchestrator-retirement/

overnightdesk-ops/
├── src/mcp/server.ts
├── src/mcp/tools/find-similar-incidents.ts
└── src/mcp/tools/*.{test.ts,ts}

overnightdesk-platform-standard/
├── docs/decisions/007-retire-platform-orchestrator.md
├── docs/runbooks/orchestrator-retirement.md
├── WHAT/platform-incidents.yaml
├── WHAT/{services,network,databases,tenant-provisioning}.yaml
└── HOW/{architecture,deployment,aegis-maintenance,tenant-provisioning}.md

overnightdesk-operations-audit/
├── standards/{compliance-requirements,network-requirements}.yaml
├── internal/engines/compliance.go
└── deploy/collect.sh
```

**Structure Decision**: Keep each child repository independent. The parent
platform repo owns active Compose and product direction; Ops owns operator
tools; the platform standard owns durable runtime truth and incident
knowledge; operations-audit owns enforcement policy. The corrective
observation reminder is a bounded host timer because the communication module
already publishes its authenticated gRPC API only on Aegis loopback. Walter
owns the reminder operationally, while systemd supplies the restart-persistent
one-shot schedule and the existing communication module remains the sole
outbound transport.

## Complexity Tracking

No constitution violations require justification.
