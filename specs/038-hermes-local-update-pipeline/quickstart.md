# Local Qualification Quickstart

This feature adds a local gate only. It does not deploy to Aegis and must not
read production volumes or Phase credentials.

## Source-contract gate

From the repository root:

```bash
infra/hermes-upgrade/local-qualify.sh \
  --candidate releases/hermes/0.19.0-local-2026-08-07.yaml \
  --mode source
```

Expected result:

- one report entry for Walter, Titus, and Mitchel;
- candidate identity and approval policy validated;
- synthetic state and local stub catalog validated;
- production markers and unsafe environment values rejected;
- JSON report written under the run directory or the requested `--report`
  path;
- promotion remains blocked because source mode does not start Hermes.

## Runtime gate

When Docker is available and the candidate image is materialized locally:

```bash
infra/hermes-upgrade/local-qualify.sh \
  --candidate releases/hermes/0.19.0-local-2026-08-07.yaml \
  --mode runtime
```

Runtime mode creates three unique synthetic state directories and an internal
Docker network. Each candidate container runs the profile-aware probe from the
exact image, verifies Hermes version and explicit manual/deny policy, checks
stub health, exercises allowed operations, and verifies denied delivery paths.
The Compose project is removed after the run and never removes unrelated
containers or named volumes.

Missing Docker or image identity is a failed/not-run runtime gate, not a
source-mode pass. The required Aegis ARM64 staging and copied-volume checks
remain mandatory even after a local runtime report is eligible.

## Negative checks

The test suite covers invalid manifests, unsafe environment values, missing
stubs, production marker leakage, missing profile paths, report redaction,
failed agent gates, and cleanup failure. A failure must return a nonzero exit
status and keep promotion blocked.

## Handoff to Aegis

Only a passing runtime report identifies a candidate as eligible for the
existing Aegis process. The operator must still follow the platform-standard
Hermes update protocol, including ARM64 staging, copied-volume qualification,
human approval, sequential rollout, rollback retention, and observation.
