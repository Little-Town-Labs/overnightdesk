# Implementation Plan: Titus Meeting Artifact Discovery

**Branch**: `033-titus-meeting-ingestion` | **Date**: 2026-08-01 |
**Spec**: [spec.md](spec.md)

**Input**: Feature specification from
`/specs/033-titus-meeting-ingestion/spec.md`

## Summary

Add a separately deployable, internal-only Go worker beside Titus that discovers
Microsoft Teams transcript and recording metadata for exactly two Phase-approved
organizers through independent delta streams. A root-only loader projects an
allowlisted subset of `/agents/hermes-titus/teamsmeetings` into a read-only
runtime file; the Phase service token never enters the container. The worker
follows provider continuation links, commits only completed delta rounds to an
atomic private state file, deduplicates by protected provider artifact identity,
and emits only sanitized health and derived handoff records. This release has no
content-download client, webhook, public port, subscription, PostgreSQL copy, or
direct Graph tooling for Titus.

## Technical Context

**Language/Version**: Go 1.24, Bash 5, systemd unit and Markdown operating
guidance

**Primary Dependencies**: Go standard library, Microsoft identity platform and
Microsoft Graph v1.0, Phase CLI, Docker, systemd, jq

**Storage**: One dedicated Docker named volume containing a mode-0600 atomic
JSON state document, health document, and metadata-only handoff document; no
PostgreSQL copy and no raw meeting content

**Testing**: Go unit and contract tests with `httptest`, Bash syntax and
deterministic qualification checks, container/image inspection, ARM64 build,
disabled install, one-shot live metadata canaries, restart/idempotency and
rollback verification

**Target Platform**: Aegis Ubuntu on ARM64; one unprivileged internal-only
container managed by systemd

**Project Type**: Tenant-adjacent background worker and operating contract

**Performance Goals**: A normal four-stream cycle completes within 60 seconds
when the provider is healthy; the default interval is five minutes; each HTTP
request has a 30-second deadline; a page body is capped at 4 MiB; each stream
accepts at most 2,500 artifacts/8 MiB of new metadata; retained state is capped
at 10,000 artifacts, 32 MiB of strings, and 64 MiB encoded with incremental
atomic serialization under the 256 MiB container limit

**Constraints**: Two exact organizers; scheduled non-channel meetings only;
metadata-only; no public ingress; no provider subscription; no redirects; no
secret or protected identifier output; no state advance on partial rounds;
bounded three-attempt retry; independent disable/rollback; 0.5 CPU, 256 MiB,
128 PID container limits

**Scale/Scope**: Four organizer-and-artifact streams, low-volume internal pilot,
one Aegis service, one private state volume, one safe handoff document

## Constitution Check

### Pre-design gate

- **Business data boundary**: PASS. Raw meeting content remains in Microsoft;
  the worker stores only protected provider metadata and safe derived records in
  one Titus-specific volume.
- **Least privilege**: PASS. The meeting application, Phase path, organizer
  allowlist, Microsoft application access policies, projected key subset,
  container user, and URL validator each narrow authority. No Graph tool is
  exposed to an agent.
- **Human authority**: PASS. Discovery is read-only. Content access and
  production activation remain separate owner-approved decisions.
- **Named workload**: PASS. The deterministic `titus-meeting-processor` source,
  systemd lifecycle, state volume, qualification, and rollback are all
  version-controlled.
- **Current-business scope**: PASS. The worker serves the active Gary-and-Austin
  Titus workspace and adds no customer or tenant-general platform.
- **Operational truth**: PASS. Structured safe events, per-stream health, last
  success times, cursor presence, counts, and deploy verification answer the
  operator's core questions without exposing identifiers.
- **Recoverability**: PASS. State changes are atomic, incomplete rounds retain
  the prior cursor, the volume survives disable/rollback, and startup defaults
  disabled until a controlled enable action.
- **Workspace quality**: PASS. Meeting discovery is isolated from interactive
  Teams and Titus runtime availability.
- **Test-first delivery**: PASS. Config, URL, retry, pagination, atomic state,
  idempotency, redaction, health, and runtime-projection contracts receive
  failing tests before implementation.

### Threat model

| Boundary | Primary risks | Required controls |
| --- | --- | --- |
| Phase to host runtime | Secret disclosure, key smuggling, mixed identities | Root-only loader, exact input key set, exact projected key set, 0440 runtime file, Phase token unset before container start |
| Runtime to Microsoft identity | Credential theft, spoofed token response, unbounded outage | HTTPS-only fixed host, response size/type validation, cached expiry with safety margin, fixed deadlines, sanitized errors |
| Runtime to Graph delta | SSRF through continuation links, tampered state, pagination loops, throttling | HTTPS `graph.microsoft.com` allowlist, exact organizer/type path validation, allowed query keys, no redirects, page cap, page limit, `Retry-After` handling |
| Graph response to state | Content URL leakage, duplicate events, partial state advance | Narrow response structs, no content fields, artifact identity deduplication, stage complete round in memory, atomic fsync-and-rename commit |
| State and telemetry | Identifier/content disclosure, concurrent corruption, repudiation | Dedicated 0700 volume, 0600 files, process lock, safe field allowlists, structured cycle IDs, no provider values in logs/health/handoff |
| Agent boundary | Excessive agency, prompt injection, content exfiltration | No raw content, no Graph tool, no automatic Hermes run, safe derived handoff only, later human-reviewed consumption contract |

### Post-design gate

PASS. Phase 1 introduces one justified named Go worker but no public route,
database, subscription, agent tool, content store, or mutation authority. Its
runtime contract is narrower than the existing Titus process, the private state
is sufficient for restart-safe delta synchronization, and rollback preserves
evidence without affecting Titus or the Teams bot.

## Phase 0: Research

Research is recorded in [research.md](research.md). The key decisions are:

1. Use the documented v1.0 organizer delta functions with a seven-day initial
   lookback, copy every continuation link exactly, and store only the final
   delta link after a complete round.
2. Implement a separate Go 1.24 standard-library worker rather than adding
   Graph authority to Hermes or reusing the interactive Teams adapter.
3. Use a dedicated root-owned Phase projection and an unprivileged container;
   do not place the Phase token or Graph secrets in Docker environment metadata.
4. Use one private atomic JSON state document because the pilot has four
   single-writer streams and explicitly does not justify PostgreSQL.
5. Store protected provider artifact and meeting identifiers only in the private
   state needed for future reconciliation; expose only deterministic derived
   references in the handoff document.
6. Treat 429 according to `Retry-After`, retry network/5xx failures within a
   fixed bound, refresh once after 401, and fail closed on 400/403/402/invalid
   state.
7. Preserve the owner content gate despite current Microsoft documentation
   stating that meeting APIs are no longer metered; retention and controlled
   destination remain undecided, and the provider page is internally stale.

## Phase 1: Design

The state model is in [data-model.md](data-model.md), the CLI/runtime/handoff
contract is in [contracts/runtime-and-handoff.md](contracts/runtime-and-handoff.md),
and the local plus production qualification flow is in
[quickstart.md](quickstart.md). The durable architecture rationale is in
[ADR-002](../../docs/decisions/002-titus-meeting-delta-worker.md).

### Runtime flow

```text
Phase /agents/hermes-titus/teamsmeetings
        |
        | root-only exact-key export and projection
        v
/run/titus-meeting-processor/runtime.json (root:worker, 0440)
        |
        v
internal-only Go worker ---- client credentials ----> Microsoft identity
        |
        +---- four organizer/type delta streams ----> Microsoft Graph v1.0
        |
        +---- atomic protected state ---------------> private named volume
        |
        +---- safe health + derived handoff --------> private named volume

No content endpoint, webhook, subscription, public port, or Hermes tool/run
```

### Synchronization transaction

1. Acquire the process lock and load/validate the exact runtime and state.
2. Acquire or safely reuse an application token.
3. For each organizer slot and artifact type, start from its saved delta link or
   a seven-day initial-lookback URL.
4. Validate every request URL before I/O; reject redirects.
5. Follow all next links with bounded pages and retries while staging artifact
   identities and the final delta link in memory.
6. If any page fails, discard the staged round and retain the last good stream
   state.
7. If the round completes, merge new artifacts idempotently, atomically persist
   state, atomically refresh safe handoff/health, and emit one structured summary
   event.

### On-call questions and signals

1. **Is the worker enabled and authenticating?** Health state and token-health
   classification.
2. **Are all four streams current?** Per-slot/type state, last-success time,
   artifact count, and cursor-present boolean.
3. **Why is a stream delayed?** Sanitized status class/error code, retry count,
   and last-attempt time.
4. **Did restart or provider replay duplicate work?** New-versus-known counts and
   cumulative derived-handoff count.

Structured events use a generated cycle ID and bounded fields only. Organizer
labels are `organizer_1` and `organizer_2`; raw IDs, URLs, tokens, provider
request IDs, messages, and response bodies are never telemetry fields.

## Delivery Order

1. Add failing Go tests for exact config, URL validation, token refresh,
   throttling/retries, pagination, cursor completion, atomic state, deduplication,
   redaction, health, and safe handoff.
2. Implement configuration, Graph client, state store, worker, CLI, and
   standard-library structured events in vertical slices.
3. Add the root-owned Phase loader, hardened container runtime, systemd unit,
   named-volume preparation, and disabled-by-default deploy lifecycle.
4. Add deterministic qualification, secret-leak, image, ARM64, restart,
   idempotency, and rollback checks.
5. Update Titus source guidance, runbook, ADR, roadmap, and active Spec Kit
   artifacts; prepare the separate platform-standard synchronization.
6. Run Spec Kit analysis, scoped repository tests, shell checks, image build,
   security review, and final Sol quality gate.
7. Publish reviewed source only after explicit authorization.
8. Install disabled, initialize private state, verify no ports/secrets/content,
   enable the worker, prove all four cursors, restart/idempotency, disable and
   restore rollback, then record the production deployment separately.

## Project Structure

### Documentation

```text
specs/033-titus-meeting-ingestion/
├── checklists/requirements.md
├── contracts/runtime-and-handoff.md
├── data-model.md
├── plan.md
├── quickstart.md
├── research.md
├── spec.md
└── tasks.md

docs/decisions/002-titus-meeting-delta-worker.md
```

### Source

```text
tenants/hermes-titus/
├── meeting-processor/
│   ├── cmd/titus-meeting-processor/main.go
│   ├── internal/
│   │   ├── config/
│   │   ├── graph/
│   │   ├── state/
│   │   └── worker/
│   ├── runtime/
│   │   ├── load-phase-config.sh
│   │   ├── prepare-volume.sh
│   │   ├── run-container.sh
│   │   ├── stop-container.sh
│   │   └── titus-meeting-processor.service
│   ├── scripts/
│   │   ├── deploy-aegis.sh
│   │   └── qualify.sh
│   ├── Dockerfile
│   └── go.mod
├── runbooks/meeting-artifact-discovery.md
└── README.md

.specify/roadmap.md
AGENTS.md
```

**Structure Decision**: Add one self-contained tenant-adjacent Go worker under
the existing Titus source boundary. Mirror the proven email-intake deployment
shape while keeping a distinct UID, image, unit, runtime directory, and volume.
Do not modify the Hermes image or expose a new interface inside Titus.

## Complexity Tracking

No constitution violations or complexity exceptions are required. The separate
worker is the least-privilege boundary, not optional duplication: merging it
into Titus would expose Graph credentials and untrusted provider responses to
the general agent runtime.
