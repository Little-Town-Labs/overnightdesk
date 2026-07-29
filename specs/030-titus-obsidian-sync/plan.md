# Implementation Plan: Titus Obsidian Headless Sync

**Branch**: `agent/codex/feature-030-titus-obsidian-sync` | **Date**:
2026-07-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from
`/specs/030-titus-obsidian-sync/spec.md`

## Summary

Add the official Obsidian Headless client as a hardened, disabled-by-default
sidecar for Titus. Move only `/opt/data/project-briefs` into a dedicated
knowledge volume shared with the sidecar, retain Obsidian credentials and sync
state in a second sidecar-only volume, and load the account token through a
strict Phase projection. Extend the weekly encrypted backup to cover the
knowledge volume while explicitly excluding and quiescing sync state. Preserve
the original briefs as rollback state and keep Titus available when sync is
stopped or unavailable.

## Technical Context

**Language/Version**: Bash 5 host/runtime scripts; Node.js 22 upstream runtime;
Python 3 backup contract tests; Markdown and YAML operational artifacts

**Primary Dependencies**: `obsidian-headless@0.0.13` with npm integrity
`sha512-biu7K0njASixXkV/foG+gmVWiU75oWGxOPrLWeQheYozeIQfImp72VGdKxwkU0kCXrh24js4zbuArCexcXfi2w==`;
official Node `22-bookworm-slim` OCI index
`sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3`;
Docker, systemd, Phase CLI, existing Aegis encrypted-backup producer

**Storage**: `titus-project-knowledge-data` for Markdown/attachments;
`titus-obsidian-sync-state` for the mode-0600 client config, derived E2EE key,
SQLite state database, and protected sync log; original briefs retained in
`hermes-titus-data`

**Testing**: Shell syntax and contract qualification, container build and
healthcheck, fake-state runtime tests, deterministic migration manifest
comparison, Python backup tests, JSON/YAML parsing, secret scan, and a later
owner-authorized two-direction Obsidian Sync canary

**Target Platform**: `aegis-prod`, Linux ARM64 Docker host; source also
qualifies on the local Linux development architecture through the pinned
multi-platform OCI index

**Project Type**: External synchronization sidecar and production operations

**Performance Goals**: Normal note changes converge within five minutes;
sidecar limited to 0.5 CPU, 512 MiB memory, and 128 processes; Titus startup
does not wait for remote sync

**Constraints**: Open-beta proprietary/unlicensed npm package; no source
vendoring; no public port; no Docker socket; no secret in Docker metadata;
no note reorganization; no silent conflict merge; no activation without
backup and owner gates; no deletion during rollout

**Scale/Scope**: One Titus project knowledge vault, one remote Obsidian Sync
vault, two new named volumes, one sidecar container/unit, one strict Phase
path, one backup dataset, three repository branches, and no web UI change

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

- **Business Data and Use-Case Boundaries**: PASS. Only durable TTS project
  background is shared. Task state, code, standards, attachments, secrets, and
  other runtime memories retain their existing authorities.
- **Least Privilege**: PASS. The sidecar receives only its runtime token,
  vault, and private state. It has no public port, Docker socket, added
  capability, or Titus state mount.
- **Accountable Decision**: PASS. The owner approved the external Obsidian
  sidecar. Account enrollment, remote vault selection, and production
  activation remain separate explicit gates.
- **Named Workloads**: PASS. One deterministic container and one systemd unit
  replace ad hoc sync commands.
- **Current Business**: PASS. The design improves an already-used Titus project
  brief workflow rather than creating a hypothetical hosting surface.
- **Operational Truth**: PASS. Spec artifacts, tenant runbook, platform
  contract, backup configuration, and deployment ledger gates are included.
- **Recoverability**: PASS. Migration is copy-then-compare, the original data
  remains mounted behind a marker-controlled cutover, backup coverage precedes
  acceptance, and rollback preserves both volumes.
- **Workspace Quality**: PASS. Desktop Obsidian and Titus use the same Markdown
  without changing user authentication or workspace membership.
- **Test First**: PASS. Runtime and backup contract tests are added and shown
  failing before their implementations.
- **Go Preference Exception**: PASS. This is a thin supervisor around an
  upstream Node-only client. Reimplementing the proprietary sync protocol in
  Go would be riskier and unsupported.
- **Post-design re-check**: PASS. The stored derived E2EE key is confined to a
  dedicated non-backed-up state volume; the account token is mounted through a
  runtime file rather than exposed in Docker configuration; settings sync and
  silent merging are disabled.

## Architecture and Lifecycle

```text
Desktop Obsidian
       ⇅ E2E Obsidian Sync
obsidian-sync-titus container
       ├── /vault  ⇄ titus-project-knowledge-data
       └── /state  ⇄ titus-obsidian-sync-state
                         (not mounted in Titus or backup)
hermes-titus container
       └── /opt/data/project-briefs ⇄ titus-project-knowledge-data
```

1. Qualify and build the pinned sidecar image.
2. Install the sidecar unit disabled and create both volumes.
3. Copy existing briefs from `hermes-titus-data` to the knowledge volume and
   compare sorted SHA-256 manifests. Bind that proof to the current volume with
   a root-owned local baseline marker, and retain the original.
4. Interactively initialize the remote vault using the Phase-backed account
   token and a privately prompted E2EE password.
5. Enforce bidirectional mode, conflict copies, no configuration sync, and the
   exact device name.
6. Run a one-shot sync and a non-production/local qualification before any
   Titus mount change.
7. Add the knowledge dataset to the encrypted backup, quiesce the sidecar
   around backup, and complete a restore drill.
8. Create the root-only cutover marker, restart only Titus with the dedicated
   mount, enable the sidecar, and run two-direction and conflict canaries.
9. Observe, record production evidence, and only then consider cleanup in a
   separate approval.

## Project Structure

### Documentation

```text
specs/030-titus-obsidian-sync/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/runtime-sidecar.md
├── quickstart.md
└── tasks.md
```

### Source

```text
overnightdesk/
├── tenants/hermes-titus/
│   ├── obsidian-sync/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   └── bin/{entrypoint.sh,healthcheck.sh}
│   ├── runtime/
│   │   ├── load-obsidian-sync-env.sh
│   │   ├── prepare-obsidian-sync.sh
│   │   ├── run-obsidian-sync.sh
│   │   ├── stop-obsidian-sync.sh
│   │   ├── obsidian-sync-titus.service
│   │   └── run-container.sh
│   ├── scripts/{deploy-aegis.sh,qualify.sh}
│   └── README.md
└── specs/030-titus-obsidian-sync/

overnightdesk-ops/
└── scripts/aegis-backup/
    ├── config.production.json
    ├── aegis-backup-producer.service
    ├── quiesce-titus-obsidian-sync.sh
    ├── test_producer.py
    └── README.md

overnightdesk-platform-standard/
├── WHAT/{hermes.yaml,secrets.yaml,services.yaml}
├── HOW/{aegis-backup.md,titus-project-knowledge.md}
├── docs/decisions/012-titus-project-knowledge-vault.md
└── specs/004-titus-obsidian-sync/
```

**Structure Decision**: The application repository owns the container, volume
mount, Phase loader, lifecycle scripts, and Feature 030 evidence. The ops
repository owns backup consistency and inclusion. The platform-standard
repository records accepted boundaries and the activation/restore runbook. The
standard uses ADR 012 because ADR 011 is reserved by the already-accepted but
not yet published Linear work-management change; publication must preserve
that ordering.

## Complexity Tracking

No constitution violations require an exception.
