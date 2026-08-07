# Research: Local-First Hermes Update Pipeline

## Decision: Extend the existing Aegis update protocol with a local gate

**Decision**: Keep `docs/runbooks/hermes-agent-update-protocol.md` as the
production rollout authority and add a local qualification stage before its
copied-volume Aegis staging step.

**Rationale**: The protocol already protects immutable image identity, policy
invariants, staged rollout, rollback handles, and production evidence. Replacing
it would duplicate authority and risk diverging from the established rollback
path.

**Evidence**: The current protocol starts staging with copied named volumes and
explicitly prohibits production delivery during staging. The current repository
does not define local Hermes services in `docker-compose.yml`, so a separate
local harness is needed.

**Alternatives considered**:

- Copy live volumes to developer machines: rejected because it increases data
  exposure and violates the runtime custody boundary.
- Add a second generic agent hierarchy: rejected because
  `tenants/hermes-walter`, `tenants/hermes-titus`, and `tenants/hermes-mitchel`
  are already the canonical workflow sources.
- Make Aegis the only test environment: rejected because it delays feedback and
  makes every candidate depend on production-adjacent access.

## Decision: Use a candidate manifest instead of release constants

**Decision**: Store one candidate identity document per release under
`releases/hermes/` and pass it to the local runner.

**Rationale**: The existing source qualifier hardcodes the v0.19 release, image
identities, and a dated standard key. A manifest separates release data from
verification logic and makes report identity reproducible.

**Alternatives considered**:

- Rewrite the verifier for every release: rejected because it makes the test
  logic itself part of the release mutation.
- Resolve `latest` at runtime: rejected because mutable tags are not sufficient
  release identity.

## Decision: Split source and runtime qualification

**Decision**: Provide a portable source-contract mode and an explicit Docker
  runtime mode. The source mode never claims that an agent process started.

**Rationale**: Docker is not available in every developer environment and the
  local host may not be ARM64. Fast manifest, profile, security, and report
  checks are still useful, while real runtime qualification remains a named
  gate that must not silently downgrade.

## Decision: Synthetic fixtures and deny-by-default boundaries

**Decision**: Local runs use disposable per-agent state and deterministic stub
  services. Production-looking credentials, Phase paths, production hostnames,
  and undeclared endpoints cause a pre-start failure.

**Rationale**: Procedural instructions to remove credentials are weaker than a
  check that refuses to run. This follows the constitution's least-privilege,
  business-data custody, and agent-authority principles.

## Decision: Value-safe structured evidence

**Decision**: Emit one JSON report per run with a correlation ID, candidate
  identity, stable gate names, bounded agent labels, refusal codes, and cleanup
  status. Raw environment values, tokens, prompt content, and fixture bodies are
  excluded.

**Rationale**: Operators need to know what passed, what failed, and whether the
  candidate can advance without creating a second secret or PII log.
