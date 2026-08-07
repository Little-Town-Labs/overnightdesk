# ADR-005: Add a Local-First Hermes Qualification Stage

## Status

Accepted for implementation

## Date

2026-08-07

## Context

OvernightDesk has three named Hermes runtimes—Walter, Titus, and Mitchel—and a
reviewed Aegis update protocol. The protocol begins with Aegis copied-volume
staging, while the repository has no common local runtime qualification
interface. Testing a new Hermes image locally must not expose production
volumes, Phase credentials, or real delivery channels.

## Decision

Add a local-first qualification harness under `infra/hermes-upgrade/`, use the
existing tenant directories as canonical source, and define one profile
contract under each `tenants/hermes-*/qualification/` directory. The harness
will validate a versioned candidate manifest, use synthetic state and
deterministic local stubs, deny undeclared network access, and emit a
value-safe structured report.

The harness has two explicit modes:

- `source`: portable manifest, profile, policy, isolation, and report checks;
- `runtime`: Docker-based candidate startup and stub-boundary checks.

Only a passing runtime report can mark a candidate eligible for the existing
Aegis staging protocol. No local mode can authorize production mutation.

## Alternatives Considered

### Copy Aegis volumes to developer machines

Rejected because it violates data custody and increases the exposure of runtime
history, configuration, and credentials.

### Test only on Aegis

Rejected because feedback is slow and every candidate becomes dependent on
production-adjacent access.

### Build a second agent source hierarchy

Rejected because the existing `tenants/hermes-walter`, `tenants/hermes-titus`,
and `tenants/hermes-mitchel` directories are the canonical workflow sources.

## Consequences

- Developers can run meaningful release checks without Aegis access.
- Docker runtime checks remain separate from portable source checks.
- The local harness requires maintenance when a tenant adds a new external
  boundary or authority-sensitive operation.
- The existing Aegis runbook remains the production authority and must be
  updated to consume the local evidence in a later standards change.
