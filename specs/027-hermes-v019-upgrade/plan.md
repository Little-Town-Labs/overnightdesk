# Implementation Plan: Hermes v0.19 Production Upgrade

**Branch**: `agent/codex/feature-027-hermes-v019-upgrade` | **Date**: 2026-07-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/027-hermes-v019-upgrade/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Upgrade the three live Aegis Hermes runtimes from v0.18.0 / v2026.7.1 to
v0.19.0 / v2026.7.20 through immutable upstream intake, a repository-owned
thin derived image, copied-volume staging, and sequential Mitchel → Walter →
Titus cutover. Preserve existing manual dangerous-command approvals despite
v0.19's new smart-approval default, keep config schema 33, retain exact v0.18
rollback handles, and reconcile the platform runbook, current runtime
references, future-tenant provisioner pin, platform standard, and deploy ledger.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Bash 5; Docker 29.6 on Linux ARM64; YAML; Hermes Agent
v0.19.0 on Python 3.13 and Node.js 22

**Primary Dependencies**: `nousresearch/hermes-agent` OCI image, systemd,
Docker named volumes, Phase-injected tenant secrets, Nginx, OvernightDesk
self-hosted OIDC, Open WebUI, and the existing tenant qualification scripts

**Storage**: Existing Docker named volumes (`hermes-agent-data`,
`hermes-mitchel-data`, `hermes-titus-data`) and volume-local YAML/SQLite state;
no schema or database migration

**Testing**: Repository contract script, shell syntax, YAML parse, Docker build
and image inspection, copied-volume staging, Hermes doctor/version/cron,
container/API/auth probes, existing Titus qualification suite, bounded logs,
and scoped identity/restart comparison

**Target Platform**: `aegis-prod`, Oracle Linux/Ubuntu ARM64 Docker host

**Project Type**: Multi-repository production operations and runtime maintenance

**Performance Goals**: Each runtime becomes healthy within its existing
service timeout; no unexplained restart or scheduler delay; v0.19 first-turn
latency improvements remain available without broadening authority

**Constraints**: Sequential cutover; no volume deletion; no secret output; no
production delivery during staging; manual/deny approval policy; existing
2-GiB/1-CPU hardened runtime profile; zero direct dashboard/API host ports;
stop on first unresolved failure

**Scale/Scope**: Three live runtimes, one derived image, three named volumes,
one future-tenant image pin, two repository PRs, and one production ledger

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Data Sacred**: PASS. Named volumes are retained; staging copies are not
  backups; rollback never deletes tenant data.
- **Security and Least Privilege**: PASS with explicit controls. Immutable
  digest, ARM64 child verification, existing cap-drop/no-new-privileges limits,
  secret-free repository source, no secret output, manual approval, cron deny,
  and protected dashboards remain mandatory.
- **Owner Decides**: PASS. The upgrade request authorizes version maintenance,
  not a provider/model, smart-approval, message-send, or tenant-authority change.
- **Simple Over Clever**: PASS. Reuse existing launchers and tenant qualifiers;
  add one focused source-contract checker rather than a new deploy framework.
- **Owner Time Protected**: PASS. The runbook becomes three-runtime complete
  and the derived Dockerfile becomes reproducible from source control.
- **Honesty and Quality**: PASS. Runtime-reported versions, internal status,
  protected-route behavior, cron/MCP/tool checks, scoped logs, and observation
  evidence are required before success.
- **Test First**: PASS. The source contract checker is added and observed
  failing against old references before implementation changes.
- **Constitution image rule**: INHERITED EXCEPTION. Pillar C prohibits custom
  engine images, while the active production standard requires the thin
  `-coder` image for Walter's GitHub CLI. This feature does not expand that
  exception; it makes the already-approved thin build reproducible and keeps
  upstream Hermes immutable beneath it.

## Project Structure

### Documentation (this feature)

```text
specs/027-hermes-v019-upgrade/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
overnightdesk/
├── infra/hermes-coder/
│   ├── Dockerfile
│   └── README.md
├── scripts/qualify-hermes-upgrade-source.sh
├── tenants/hermes-titus/
│   ├── config/config.yaml
│   ├── runtime/{prepare-volume.sh,run-container.sh}
│   └── README.md
├── docker-compose.yml
├── .specify/{feature.json,roadmap.md}
└── specs/027-hermes-v019-upgrade/

overnightdesk-platform-standard/
├── docs/runbooks/hermes-agent-update-protocol.md
└── WHAT/{hermes.yaml,services.yaml}

aegis-prod/
├── /opt/overnightdesk/hermes-coder/
├── /opt/hermes-titus/source/
└── Docker named volumes and retained rollback containers
```

**Structure Decision**: The application repo owns reproducible derived-image
input, current tenant runtime defaults, the future-tenant pin, qualification,
and Spec Kit evidence. The platform-standard repo owns the operational
protocol and live inventory. Aegis receives only exact merged source and
retains runtime data in existing named volumes.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Thin derived `-coder` image despite the app constitution's upstream-only rule | Walter's approved `the_guardian` profile requires GitHub CLI and git identity bootstrap; production already uses this exception | Running the moving upstream tag is non-reproducible, while removing Walter's approved tooling is a separate product/authority change |
