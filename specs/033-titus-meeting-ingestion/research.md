# Research: Titus Meeting Artifact Discovery

## Decision 1: Use organizer-scoped v1.0 delta synchronization

**Decision**: Use one transcript and one recording delta stream per approved
organizer. Initial synchronization uses the documented function form with a
seven-day `startDateTime`; continuation requests copy `@odata.nextLink` exactly,
and only a final `@odata.deltaLink` completes the round.

**Rationale**: Microsoft documents full and incremental synchronization on the
organizer-wide views, opaque state tokens, and exact continuation-link reuse.
The live 2026-08-01 Aegis qualification returned HTTP 200 and a final delta link
for all four streams; Gary returned one transcript and one recording, while
Austin returned zero of each.

**Alternatives considered**:

- Meeting-specific polling: proved authorization and artifacts, but requires a
  separate meeting-discovery input for every meeting.
- Webhooks/change notifications: adds public ingress, validation, subscription
  renewal, and more failure state than the two-organizer pilot needs.
- Tenant-wide or channel-meeting discovery: exceeds the approved organizer
  boundary and is unsupported by these organizer-wide APIs.

**Sources**:

- https://learn.microsoft.com/en-us/graph/api/calltranscript-delta?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/callrecording-delta?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/onlinemeeting-getalltranscripts?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/api/onlinemeeting-getallrecordings?view=graph-rest-1.0

## Decision 2: Add a separate Go worker beside Titus

**Decision**: Implement `titus-meeting-processor` as a Go 1.24 service using the
standard library, managed independently by systemd and an internal-only Docker
container.

**Rationale**: The constitution prefers Go for new first-party daemons. The
existing Titus email-intake worker proves the host/systemd/container pattern,
but its database and message-delivery dependencies do not belong here. A
separate process prevents Graph credentials, provider responses, and lifecycle
failures from entering the general Hermes runtime.

**Alternatives considered**:

- Add Graph tools to Titus: rejected because it gives a general agent broader
  authority and exposes credentials/provider data to prompts and tool calls.
- Add the loop to the interactive Teams adapter: rejected because bot and
  meeting-processor identities have separate trust and secret boundaries.
- Add the worker to the existing email-intake binary: rejected because the
  services have unrelated providers, data, state, and rollback.

## Decision 3: Project secrets through a dedicated root-owned loader

**Decision**: A systemd `ExecStartPre=+` loader uses the host Phase service token
to export the exact meeting path, validates the complete source key set, and
writes a narrower root-to-worker mode-0440 JSON runtime file. The container sees
only tenant/client/client-secret/organizer values plus fixed non-secret runtime
limits.

**Rationale**: This mirrors the proven email-intake boundary while keeping the
Phase token outside Docker. Webhook client state, webhook settings, and the
pilot join URL are deliberately omitted from the projected file.

**Alternatives considered**:

- Extend the main Hermes runtime environment: rejected because meeting secrets
  would enter the general agent container.
- Mount the Phase token into the worker: rejected because it grants continuing
  secret-store access and exposes the token in the container boundary.
- Put secrets in Docker environment variables: rejected because Docker inspect
  would expose them.

## Decision 4: Use one atomic private JSON state document

**Decision**: Store four stream cursors, protected artifact records, and safe
operational metadata in one versioned mode-0600 JSON document on a dedicated
0700 named volume. Hold a nonblocking process lock, stage each complete delta
round in memory, fsync a temporary file, rename atomically, and fsync the
directory.

**Rationale**: The pilot is one process and four low-volume streams. Atomic JSON
matches an existing repository pattern and avoids a database added only for
integration convenience. Storing provider artifact and meeting IDs privately
preserves future reconciliation; logs and handoff use only derived hashes.

**Alternatives considered**:

- PostgreSQL: rejected by scope and operating-cost constraints.
- SQLite: technically sound, but adds a dependency and schema lifecycle with no
  concurrency or query requirement in this pilot.
- Cursor-only files: rejected because provider delta can replay older artifacts,
  so durable artifact deduplication remains necessary.

## Decision 5: Validate continuation URLs as hostile input

**Decision**: Accept only HTTPS URLs on `graph.microsoft.com`, reject userinfo,
fragments, redirects, unexpected query keys, cross-organizer paths, cross-type
paths, and non-delta routes. Cap pages and response bytes.

**Rationale**: Provider responses and persisted state are external inputs. A
blind request to a returned URL would create SSRF and confused-deputy risk.

**Alternatives considered**:

- Trust every Microsoft-returned URL: rejected because compromised responses or
  tampered state could redirect the privileged client.
- Reconstruct continuation URLs from state tokens: rejected because Microsoft
  explicitly requires clients to treat tokens as opaque and copy the link.

## Decision 6: Bound retries and expose safe operational truth

**Decision**: Honor numeric `Retry-After` for 429 within a 60-second cap; use
bounded exponential delay for network and 5xx failures; refresh once after 401;
fail closed on invalid input, 400, 402, 403, and incomplete state. Emit
structured allowlisted events and an atomic health document with organizer
slots rather than identifiers.

**Rationale**: Microsoft directs clients to honor `Retry-After` and use
exponential backoff when absent. Bounded attempts prevent a stuck cycle from
blocking all streams indefinitely.

**Alternatives considered**:

- Unlimited provider-directed retry: rejected because it makes service health
  and shutdown unbounded.
- Log provider bodies/messages: rejected because responses can contain protected
  identifiers and unstable text.

**Source**: https://learn.microsoft.com/en-us/graph/throttling

## Decision 7: Keep content disabled despite billing-document drift

**Decision**: Do not implement transcript or recording content requests in this
feature. Treat a provider 402 as a nonretryable sanitized classification even
though no content route is present.

**Rationale**: Microsoft’s current payment page says at the top that the listed
Teams APIs have not required billing configuration since 2025-08-25, while
later deprecated sections still describe evaluation quotas and 402 responses.
That internal inconsistency means billing is no longer a sound sole gate.
However, the owner has not approved retention, destination, deletion, access,
or content processing, so the data-custody gate independently blocks download.

**Alternatives considered**:

- Enable content because current billing is free: rejected because cost is only
  one of the unresolved content risks.
- Add dormant content code behind a flag: rejected because it creates an
  unqualified authority path and can be enabled accidentally.

**Source**: https://learn.microsoft.com/en-us/graph/teams-licenses
