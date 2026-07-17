# Implementation Plan: Hermes Titus Runtime

**Branch**: `013-hermes-titus-runtime` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-hermes-titus-runtime/spec.md`

## Summary

Provision Titus as a hardened, systemd-managed container derived from the pinned OvernightDesk Hermes image. A root-owned launcher resolves scoped Phase values into a temporary in-memory environment file, starts the unprivileged container on the OvernightDesk network, and never places credential values in Docker metadata or persistent storage. Titus receives a dedicated named volume, the official TencentDB Agent Memory Hermes provider with local SQLite/vector storage, an AgentMail MCP declaration that inherits process credentials, and the existing Control Tower skill. The native Hermes Microsoft Teams adapter is installed but remains disabled until the TTS app credentials and explicit user allow-list replace Phase placeholders.

## Technical Context

**Language/Version**: POSIX shell and Bash 5 for lifecycle scripts; Python 3.13 for Hermes; Node.js 22.22 for TencentDB Agent Memory

**Primary Dependencies**: `overnightdesk/hermes-agent:0.18.0-coder`, `@tencentdb-agent-memory/memory-tencentdb@0.3.6`, `microsoft-teams-apps==2.0.13.4`, `aiohttp==3.14.1`, Phase CLI 2.1.0, Docker 29.6, systemd

**Storage**: Dedicated Docker named volume `hermes-titus-data`; TencentDB local SQLite/sqlite-vec data under `/opt/data/memory-tencentdb/data`

**Testing**: Shell contract qualification, staged ARM64 dependency imports, local gateway health, synthetic memory capture/search, live Control Tower session, container hardening inspection

**Target Platform**: Oracle Linux host `aegis-prod`, Linux ARM64 container, private `overnightdesk_overnightdesk` Docker network

**Project Type**: Tenant runtime source plus production lifecycle automation

**Performance Goals**: Healthy core runtime within 90 seconds; Phase loading bounded to 30 seconds; internal health probes complete within 5 seconds

**Constraints**: No secret values in Docker inspect, image history, repository, deployment log, or named volume; no public dashboard/API ports; Teams disabled while placeholders remain; no cross-tenant volume mounts

**Scale/Scope**: One Titus tenant, one Control Tower caller identity, one local memory gateway, one future TTS Teams bot connection

## Constitution Check

- **Customer data isolation**: PASS — Titus has a unique container and named volume; no platform or peer-tenant filesystem access.
- **Secrets management**: PASS — Phase is the source of record, the existing service credential remains host-only, and downstream values are materialized only under `/run`.
- **Least privilege**: PASS — the container is unprivileged, capability-free, network-scoped, and Control Tower authority remains token-bound.
- **Human approval**: PASS — the user explicitly authorized the production install; Teams remains inactive until credentials and allow-list are supplied.
- **Simple over clever**: PASS — one container, one volume, one service, and the upstream Hermes/provider integration surfaces are reused.
- **Test-first imperative**: PASS — the runtime contract qualification is written and observed failing before deployment assets are implemented.
- **Operational visibility**: PASS — systemd, Docker health, memory health, and Control Tower session checks provide bounded status evidence.

Post-design recheck: PASS. No constitution exceptions are required.

## Project Structure

### Documentation

```text
specs/013-hermes-titus-runtime/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/runtime.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
tenants/hermes-titus/
├── README.md
├── config/
│   └── config.yaml
├── runtime/
│   ├── hermes-titus.service
│   ├── load-phase-env.sh
│   ├── prepare-volume.sh
│   └── start-with-secrets.sh
├── scripts/
│   ├── deploy-aegis.sh
│   └── qualify.sh
└── skills/
    └── control-tower-azure-ops/
```

**Structure Decision**: Keep all Titus-specific workflow, configuration, qualification, and lifecycle source under `tenants/hermes-titus/`, matching the repository's tenant ownership rule. Shared Hermes startup remains under `infra/hermes/` and is copied into Titus's volume during preparation.

## Complexity Tracking

No constitution violations require justification.
