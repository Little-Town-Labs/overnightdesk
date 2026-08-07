# Implementation Plan: Local-First Hermes Update Pipeline

**Branch**: `038-hermes-local-update-pipeline` | **Date**: 2026-08-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/038-hermes-local-update-pipeline/spec.md`

## Summary

Add a local qualification stage ahead of the existing Aegis Hermes update
protocol. The stage validates one versioned candidate manifest, creates
synthetic per-agent state, enforces a no-production/no-egress boundary,
executes uniform Walter/Titus/Mitchel qualification profiles against
deterministic stubs, and emits value-safe evidence. The implementation keeps
the existing tenant directories and Aegis runbook authoritative; it does not
copy live volumes, access Phase, deploy to Aegis, or contact real providers.

## Technical Context

**Language/Version**: Python 3.11+ for manifest validation and orchestration;
POSIX shell for the single local entrypoint; YAML for candidate and profile
manifests; Docker Compose-compatible runtime checks when Docker is available.

**Primary Dependencies**: Python standard library and the repository's existing
PyYAML test/runtime dependency; Docker is optional for source-only checks and
required for real container qualification. No new external service or package
is introduced.

**Storage**: Ephemeral run directory under a caller-selected temporary root;
synthetic fixture files only. No production volumes or credentials are read.

**Testing**: Python `unittest`/existing pytest discovery for pure validation,
redaction, profile coverage, and report contracts; shell syntax checks; optional
Docker medium tests for real Hermes startup and stub-network behavior.

**Target Platform**: Linux developer environments, with source checks portable
to other POSIX environments. Local runtime qualification may run on a
non-ARM64 host but must report that Aegis ARM64 staging remains required.

**Project Type**: Brownfield multi-agent operational qualification harness.

**Performance Goals**: Source qualification completes in under 60 seconds on a
clean checkout; the full local three-agent runtime check completes within 10
minutes excluding image acquisition.

**Constraints**: No Phase access, no production environment files, no live
endpoints, no external delivery, no production volume copies, unique run
resources for concurrent invocations, value-safe structured reports, and no
Aegis mutation in this feature.

**Scale/Scope**: Exactly three Aegis Hermes runtimes—Walter, Titus, and Mitchel—
with one candidate per run and one shared deterministic stub set.

## Constitution Check

*GATE: Pass before Phase 0 research. Re-check after Phase 1 design.*

- **Business data and use-case boundaries**: PASS. Synthetic state is separate
  per named runtime; no production data is copied locally.
- **Least privilege**: PASS. Local execution has no Phase, production endpoint,
  or credential access and denies undeclared network destinations.
- **Agents assist; accountable people decide**: PASS. Local results can block
  promotion but cannot authorize Aegis or outbound business action.
- **Named workloads over dynamic hosting**: PASS. The harness qualifies the
  three existing named runtimes and does not create a hosting control plane.
- **Operational truth**: PASS. Each run emits a correlation ID, candidate
  identity, per-agent results, refusals, and cleanup status.
- **Recoverability before automation**: PASS. The local harness uses ephemeral
  state and leaves named production volumes untouched; Aegis rollback remains
  governed by the existing protocol.
- **Test-first delivery**: PASS. Manifest, isolation, profile, and report
  contracts will have failing tests before implementation.

## Phase 0: Research Decisions

Research is recorded in [research.md](research.md). The existing protocol is
kept as the production authority. The local stage is deliberately split into a
portable source-contract gate and an optional Docker runtime gate so that a
developer can validate release metadata and policy without Docker, while a
candidate cannot be promoted on source checks alone.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) defines candidate, profile, stub, run, gate,
  and report records.
- [contracts/candidate-manifest.md](contracts/candidate-manifest.md) defines
  the candidate input and artifact identity invariants.
- [contracts/qualification-profile.md](contracts/qualification-profile.md)
  defines the common per-agent profile contract.
- [contracts/qualification-report.md](contracts/qualification-report.md)
  defines the value-safe JSON output and promotion decision.
- [quickstart.md](quickstart.md) defines the local source and Docker runtime
  commands, expected outcomes, and stop conditions.

## Architecture Decisions

1. **Keep tenant source canonical**: qualification profiles live under each
   existing `tenants/hermes-*` directory; the shared runner lives under
   `infra/hermes-upgrade/`.
2. **Manifest over hardcoded release constants**: a candidate YAML document is
   the single release identity input. The runner validates it and carries its
   identity into every report.
3. **Source gate before runtime gate**: pure checks are fast and require no
   Docker; runtime checks are explicit and cannot be silently downgraded.
4. **Fail-closed boundary**: production-looking values, Phase paths, and
   undeclared endpoints are rejected before an agent-capable process starts.
5. **Synthetic fixtures over copied state**: local runs use disposable state and
   deterministic stubs; Aegis remains the only place for copied-volume staging.
6. **One report contract**: local output is structured JSON with stable event
   names, a correlation ID, bounded labels, and redacted details.

## Project Structure

```text
infra/hermes-upgrade/
├── local-qualify.sh                 # one documented local entrypoint
├── local_qualify.py                 # manifest, isolation, profile, and report runner
├── candidate.py                      # candidate schema and artifact checks
├── reporting.py                      # value-safe structured report helpers
├── stubs/                            # deterministic local boundary fixtures
│   ├── README.md
│   └── services.yaml
└── tests/
    ├── test_candidate.py
    ├── test_isolation.py
    ├── test_profiles.py
    ├── test_reporting.py
    └── test_runtime_mode.py

releases/hermes/
└── 0.19.0.yaml                       # accepted baseline candidate manifest

tenants/hermes-walter/qualification/profile.yaml
tenants/hermes-titus/qualification/profile.yaml
tenants/hermes-mitchel/qualification/profile.yaml

docs/decisions/005-hermes-local-first-qualification.md
```

The existing platform-standard runbook will be updated separately in its own
repository worktree after the local harness contract is stable. This feature
does not change the Aegis launcher or production runtime.

Runtime mode adds a candidate-container probe over the internal stub network.
Docker-independent tests cover the probe policy, stub operations, Compose
hardening, and cleanup ownership; the full Docker integration test is opt-in
because it requires a locally materialized candidate image.

## Verification Strategy

- Run source qualification with the accepted baseline manifest and assert one
  result for each agent.
- Run negative tests for missing digests, unsafe endpoints, production-looking
  credentials, missing stubs, failed profile gates, report redaction, and
  cleanup failure.
- Run all existing affected Titus and Mitchel contract tests without changing
  their production behavior.
- If Docker is available, run the explicit runtime mode with isolated synthetic
  state and a no-egress stub network. If Docker is unavailable, report the
  runtime gate as not run rather than treating source qualification as a full
  release qualification.
- Validate shell syntax, YAML parsing, JSON report schema, and `git diff --check`.

## Complexity Tracking

No constitution violations or complexity exceptions require justification.
