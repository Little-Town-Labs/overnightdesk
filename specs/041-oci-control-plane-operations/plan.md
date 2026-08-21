# Implementation Plan: OCI Control-Plane Operations

**Branch**: `041-oci-control-plane-operations` | **Date**: 2026-08-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/041-oci-control-plane-operations/spec.md`

## Summary

Build a host-local Go CLI that uses OCI's signed REST API requests to collect
sanitized boot-volume backup and host-vulnerability evidence, then groups that
evidence into a deterministic maintenance plan. The implementation starts with
fixture-tested read-only inventory and grouping. It runs on the approved
OvernightDesk/Aegis operations machine, opens no network listener, does not use
the Docker socket, and does not perform production mutation in the MVP.

The later mutation phase is retained in the specification as a separately
approved capability. It will remain unavailable until exact target allowlists,
read/write IAM identities, current backup evidence, owner approval, bounded
rollback, and post-operation verification are all present.

## Maintenance-First Implementation Boundary

The first implementation wave follows the maintenance decision loop only:

1. establish the exact approved target and read-only OCI identity;
2. verify boot-volume backup readiness;
3. collect and validate host-vulnerability evidence;
4. group findings into a deterministic maintenance plan; and
5. emit preflight and sanitized evidence for human review.

The OCI SDK boundary must not become a general-purpose tenancy client. Power
actions, package writes, restores, deletes, compartment moves, scheduling, and
other unrelated OCI operations remain non-goals for this wave. The mutation
types in the specification are mock-only until a new owner-approved plan
authorizes a separate write identity and implementation.

## Repository and Runtime Boundary

- Spec Kit artifacts remain in this OvernightDesk repository under
  `specs/041-oci-control-plane-operations/`.
- Runtime source is the sibling companion project at
  `/home/powerbox2/src/overnightdesk-maintenance/`, now established as its own
  Git repository on `main`. The scaffold contains no credentials; remaining
  setup work is limited to the non-secret configuration example, package
  structure, and fixture-first developer commands.
- The host-local CLI is invoked manually or by an explicitly reviewed one-shot
  runbook. The MVP does not install a systemd daemon, expose an HTTP endpoint,
  add a public route, or add an automatic scheduler.
- Production source is synchronized from reviewed version-controlled source to
  a root-owned host installation. Operator evidence is written only to an
  approved host evidence directory and the deployment ledger receives metadata,
  never secrets or raw configuration.

## Technical Context

**Language/Version**: Go 1.25, required by the pinned official OCI Go SDK
`v65.123.2`; the companion scaffold is being raised from Go 1.24 before SDK
integration.

**Primary Dependencies**: Official Oracle OCI Go SDK `v65.123.2` pinned in
`go.mod`; Go standard library; Phase CLI as an external
runtime secret-injection boundary. No web framework, database, Docker SDK, or
general-purpose orchestration dependency.

**Storage**: No application database. Sanitized evidence and operation records
are immutable JSON files under an approved host path; fixture inputs and golden
outputs live in the companion repository. Incomplete runs are never marked
complete.

The post-MVP live slice uses `/etc/overnightdesk-maintenance/config.json` for
root-owned non-secret target configuration and
`/var/lib/overnightdesk-maintenance/evidence/` for restricted host-local
evidence artifacts. The private key and Phase token remain runtime-only.

**Testing**: `go test ./...`, `go test -race ./...`, `go vet ./...`, and a
reproducible build. OCI and Phase integration tests use interfaces, fixtures,
and fake transports; live OCI calls are a separately approved qualification
step and are never required for ordinary CI.

**Target Platform**: Linux on the approved OvernightDesk/Aegis operations
machine; outbound HTTPS to OCI and the approved Phase endpoint; no inbound
listener.

**Project Type**: Host-local command-line tool and one-shot operational
qualification utility.

## Post-MVP Live Inventory Design

Live inventory is an explicit `--live` source selection on the existing
`inventory` command. Fixture input remains the default and `--live` cannot be
combined with `--input`. The CLI constructs the existing OCI read-only adapter
and inventory run through dependency injection, so fixture and live sources
share target validation, pagination, normalization, evidence envelopes, and
terminal states.

The live command is invoked manually through `deploy/phase-run.sh`. The
launcher owns Phase selection and runtime key delivery; the Go process receives
only the injected key material needed to construct the in-memory OCI signer.
No systemd unit, scheduler, listener, database, or mutation client is added in
this slice.

**Performance Goals**: Handle the current 193-finding evidence scale and at
least 1,000 sanitized findings within one bounded run, with a configurable
maximum of 100 pages and 5,000 records, a 30-second per-request timeout, a
15-minute overall run deadline, and at most three retries for eligible
read-only transient failures.

**Constraints**: OCI request signing must use the registered public key and
matching private key; private key material must be loaded from the approved
secret boundary into process memory only. No private key, Phase token,
authorization header, signed request material, or full configuration may be
logged, exported, persisted, or committed. Write calls are disabled by default
and ambiguous writes are terminal `unknown` outcomes, never automatic retries.
The Go toolchain baseline must remain compatible with the pinned SDK and be
verified in local and CI checks.

**Scale/Scope**: One approved tenancy/compartment and the exact Aegis target
allowlist. The MVP covers OCI boot-volume backup inventory, host-vulnerability
summary/detail inventory, deterministic grouping, sanitized evidence export,
and production-safe preflight reporting. Generic tenancy administration,
resource deletion, unrestricted reboot, automatic patch scheduling, and public
multi-user operation are out of scope.

## Constitution Check

### Pre-Phase-0 Gate

- **Business/use-case boundary**: PASS. The tool has one use case—approved
  Aegis vulnerability-remediation evidence—and no generic OCI administration.
- **Least privilege**: PASS with design constraint. Read-only OCI identity is
  the only identity used by the MVP; write identity and mutation code remain
  separately gated. Secrets use a dedicated Phase app/environment/path.
- **Human accountability**: PASS. Live discovery and every write require an
  explicit operator/owner approval record; ambiguous conditions fail closed.
- **Named workloads**: PASS. The companion project is a named, versioned
  host-local operational CLI with a documented installation and rollback
  handle; it is not a dynamic service.
- **Operational truth**: PASS. Each complete run produces sanitized evidence,
  run ID, counts, source identifiers, verification state, and ledger metadata.
- **Recoverability**: PASS for the MVP. The read-only slice cannot mutate Aegis;
  the later write phase cannot proceed without current backup and rollback
  evidence.
- **Test-first delivery**: PASS. Contract, fixture, negative authorization,
  secret-leak, determinism, and interrupted-run tests precede implementation.
- **Go preference**: PASS. This is new first-party operational tooling and the
  existing scaffold is Go 1.24.

No constitutional violation is proposed. The gate must be re-checked after
Phase 1 design and again before any live qualification or mutation work.

## Architecture

The runtime is a small set of explicit, testable boundaries:

```text
CLI/config
   |
   +--> secret provider (Phase runtime injection; private key never persisted)
   |
   +--> OCI transport (signing, timeout, pagination, request IDs, read retry)
   |
   +--> evidence normalizer/validator
   |          |
   |          +--> backup inventory
   |          +--> vulnerability summary + detail inventory
   |
   +--> deterministic finding grouper
   |
   +--> sanitized evidence writer / ledger adapter
   |
   +--> future mutation gate (disabled in MVP; mock-only until approved)
```

The OCI boundary is interface-driven so fake responses can prove malformed
records, pagination, throttling, request-ID propagation, and interruption
semantics without contacting OCI. The secret boundary is also interface-driven
so tests use sentinel values and can prove the private key never reaches logs,
JSON evidence, command output, or temporary files.

## Source Structure

The companion repository will use this concrete structure:

```text
overnightdesk-maintenance/
├── cmd/overnightdesk-maintenance/main.go
├── internal/
│   ├── cli/                 # command parsing, exit codes, mode gates
│   ├── config/              # non-secret allowlists and bounded limits
│   ├── secret/              # Phase-backed runtime secret provider
│   ├── oci/                 # signer/client, pagination, response adapters
│   ├── evidence/            # sanitized records, validation, completeness
│   ├── grouping/            # deterministic finding groups
│   ├── mutation/            # preflight contract; no live MVP endpoint
│   └── observability/       # structured safe events and correlation IDs
├── fixtures/                # sanitized OCI responses and golden outputs
├── tests/                    # integration and qualification tests
├── deploy/                  # host install, disabled-first, rollback assets
├── docs/                    # companion-project operator documentation
├── go.mod
└── README.md
```

Spec Kit contracts and design artifacts remain in this feature directory and
are the source of truth for the companion repository's implementation paths.

## Delivery Phases

1. **Research and boundary decisions**: Resolve OCI API/SDK details, Phase
   runtime injection, IAM policy names, exact host paths, and evidence format.
2. **Companion repository foundation**: Complete the non-secret configuration
   example, package structure, fixture commands, secure configuration, and
   fakeable interfaces; prove no listener/Docker access/credential leakage.
3. **Read-only inventory MVP**: Implement signed, paginated backup inventory and
   vulnerability summary/detail inventory with bounded read retries and
   complete/incomplete run semantics.
4. **Deterministic grouping MVP**: Normalize finding metadata, preserve all
   unresolved records, generate stable group identifiers, and export sanitized
   plan evidence suitable for Issue #239 and the deployment ledger.
5. **Host qualification**: Build a disabled-first local runbook and perform a
   separately approved live read-only run only after Phase/IAM/configuration
   preflight passes. No mutation is enabled by this phase.
6. **Future approved mutation phase**: Design and test the exact allowlist,
   approval, backup, work-request, rollback, and verification gates in a mock
   environment. Live write implementation and activation require a new explicit
   approval decision and a post-design constitution/security review.

## Constitution Check After Design

- The host-local process has no public ingress or Docker authority.
- The first live identity is read-only and compartment-scoped.
- Phase access is dedicated and path-scoped; the OCI private key is never part
  of source, evidence, logs, or durable configuration.
- All external OCI responses are untrusted until schema-validated.
- A complete run is distinguishable from an interrupted or partial run.
- The mutation phase has no executable production task in the MVP delivery
  wave; its tasks are mock-only until separately authorized.

## Complexity Tracking

No constitutional violations or speculative abstractions are required. The
OCI and secret interfaces are justified by the fixture-only test boundary and
by the need to prevent live credentials and production calls in ordinary tests.
