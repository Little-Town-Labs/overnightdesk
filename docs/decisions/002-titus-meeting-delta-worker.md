# ADR-002: Use a Separate Delta Worker for Titus Meeting Artifacts

## Status

Accepted

## Date

2026-08-01

## Context

Titus needs bounded awareness of transcript and recording artifacts created by
scheduled non-channel meetings organized by Gary or Austin. The interactive
Teams adapter has a bot identity and public-message responsibility; the meeting
processor has a different Microsoft application identity, permission set,
organizer policy, secret path, and background lifecycle.

Live Aegis qualification proved the meeting-specific list endpoints and all
four organizer delta streams. Raw meeting content remains unapproved because
its retention, controlled destination, deletion, access, and processing rules
are not decided.

## Decision

Use a separate internal-only Go worker, `titus-meeting-processor`, to poll the
Microsoft Graph v1.0 organizer transcript and recording delta functions. Keep
four independent streams, persist final opaque cursors and protected artifact
metadata in one dedicated private volume, and expose only sanitized health and
derived metadata references.

Use a root-owned Phase loader to project only the meeting credentials and two
approved organizer IDs into a read-only runtime file. Keep the Phase service
token, webhook client state, pilot join URL, raw state, and content outside the
container-visible configuration and outside Titus.

The service has no public port, webhook, provider subscription, database,
content endpoint, Hermes tool, or automatic prompt/run handoff. Production
installation is disabled by default and rollback preserves the state volume.

## Alternatives Considered

### Expose Microsoft Graph tools directly to Titus

- Pros: Fewer components and immediate agent access.
- Cons: Gives a general agent credentials and open-ended provider authority;
  places untrusted provider data near prompts, tools, and memory.
- Rejected: Violates the least-privilege and data-boundary goals.

### Add ingestion to the interactive Teams adapter

- Pros: Reuses Microsoft-related runtime code.
- Cons: Collapses two application identities and couples background processing
  to public bot ingress and interactive availability.
- Rejected: Identity, secret, permission, and lifecycle boundaries are distinct.

### Use Graph webhooks and subscriptions

- Pros: Lower polling latency.
- Cons: Requires public ingress, validation, lifecycle notifications,
  subscription renewal, and more operational state.
- Rejected: Delta polling is supported and sufficient for two pilot users.

### Store cursor and discovery state in PostgreSQL

- Pros: Transactional queries and familiar operational tooling.
- Cons: Adds a database dependency and canonical copy for four single-writer
  low-volume streams.
- Rejected: Atomic private file state is sufficient and smaller.

### Implement dormant content download behind a flag

- Pros: Shortens a later content feature.
- Cons: Creates an unapproved content authority path that could be enabled by
  configuration drift.
- Rejected: Content code begins only after a separate approved design.

## Consequences

- Meeting-provider compromise or malformed response is contained in a narrow
  worker instead of the general Titus runtime.
- The worker adds one image, systemd unit, UID/GID, named volume, deploy script,
  and operational health surface.
- The state volume becomes protected Titus operational data and must be backed
  up, preserved during rollback, and excluded from logs and source sync.
- Discovery latency is bounded by the polling interval rather than immediate
  notifications.
- Later content retrieval or agent consumption requires a new reviewed contract
  and cannot be activated by a hidden flag in this release.
