# ADR-006: Host-Local OCI Maintenance CLI Boundary

## Status

Accepted for Feature 041 planning; live mutation remains separately
unapproved.

## Date

2026-08-20

## Context

The Aegis host needs bounded OCI evidence collection and, later, narrowly
approved vulnerability remediation. The work touches OCI signing credentials,
Phase secret custody, production backups, and potentially package mutation.
OvernightDesk's constitution requires least privilege, explicit human approval,
durable operational truth, recoverability, and named workloads over dynamic
hosting.

The existing OvernightDesk repository is a Next.js workspace shell with
separate Go operational services. The OCI tool is a new operational workload,
and its first value slice is read-only inventory and deterministic grouping.

## Decision

Build the runtime as a separate, version-controlled Go companion repository at
`/home/powerbox2/src/overnightdesk-maintenance`, while retaining the feature
specification and roadmap in this OvernightDesk repository.

The runtime is a host-local CLI or one-shot process on the approved
OvernightDesk/Aegis operations machine. The MVP opens no network listener, does
not use the Docker socket, does not install an automatic scheduler, and does
not expose a general OCI administration surface.

The MVP uses a read-only OCI identity and a dedicated Phase app/environment/
service-account boundary. The OCI private key is injected only at runtime and
is not stored in Git, durable configuration, logs, evidence, or a temporary
key file. Mutation is a future phase requiring a separate write identity,
exact target allowlist, current backup evidence, owner approval, bounded
work-request handling, rollback, and post-update verification.

## Alternatives Considered

### Add the OCI client to the OvernightDesk Next.js application

Rejected because it would couple host-control authority to the web workspace,
expand the application secret boundary, and create an unnecessary route or
runtime path for a host-local operator tool.

### Run a general-purpose daemon or HTTP service on Aegis

Rejected because the MVP has no need for inbound traffic or continuous
scheduling. A one-shot CLI is easier to disable, audit, qualify, and roll back.

### Use OCI CLI subprocesses for all API access

Rejected as the primary implementation because structured request-ID capture,
response validation, pagination, and bounded retry semantics should remain in a
typed client boundary. The OCI CLI may still be used for operator diagnostics
only if a future plan explicitly permits it.

### Keep the private key in an OCI config or host PEM file

Rejected because it creates a durable host copy outside the approved Phase
secret boundary. The official OCI Go SDK supports constructing a raw provider
from the PEM value in memory.

## Consequences

- Feature planning spans two repositories and must keep the Spec Kit artifacts
  synchronized with the companion README and deployment runbook.
- The companion repository requires its own Git history, dependency pinning,
  tests, release source, and host installation procedure.
- Live qualification is intentionally slower because owner approval, Phase/IAM
  preflight, and sanitized evidence are explicit gates.
- The design keeps the initial blast radius small and makes a future mutation
  phase auditable and reversible.
