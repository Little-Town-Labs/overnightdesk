# ADR-001: Use Matrix as Titus's Primary Interactive Channel

## Status

Accepted

## Date

2026-07-17

## Context

Titus's standalone AgentMail poller acknowledges trusted email and safely queues
other senders, but it intentionally does not enter Hermes tools, memory, or
reasoning. Email therefore cannot support interactive operational work,
progress, controls, or action approvals.

Hermes provides a native Matrix platform that enters the full agent pipeline.
The operator has created a dedicated bot identity and private room. The pinned
Titus image contains the adapter and required ARM64 encryption dependencies.

## Decision

Use native Hermes Matrix as Titus's primary interactive channel, restricted to
one exact operator and one exact private encrypted shared room. Require E2EE,
stable room context, queued busy input, requester-bound approvals, and disabled
Matrix administrative/cross-room tools. Retain the stock adapter behavior that
also allows a separate DM session only for the same exact authorized operator.

Retain the existing AgentMail poller as a separate asynchronous acknowledgement,
drafting, and approval path. Email does not become a Hermes command transport.

## Alternatives Considered

### Make AgentMail execute Hermes instructions

- Pros: Keeps one user-facing channel.
- Cons: Reverses feature 014's tool-free threat boundary and gives untrusted
  email content a path toward production tools.
- Rejected: Requires a separate security redesign and does not provide native
  interactive progress or reaction approvals.

### Build a separate Matrix bridge

- Pros: Full control over routing.
- Cons: Duplicates Hermes sessions, encryption, progress, controls, media, and
  approval integration.
- Rejected: Native Hermes already owns this boundary.

### Patch the adapter to deny authorized-user DMs

- Pros: Makes the shared room the only Matrix session boundary.
- Cons: Creates an upgrade-sensitive derived image for a sender who is already
  fully authorized in the shared room.
- Rejected: The stock exact-user and exact-shared-room allowlists are sufficient
  for the immediate channel, and the DM session remains isolated by room scope.

### Activate Microsoft Teams

- Pros: Aligns with the original TTS collaboration target.
- Cons: Still requires tenant app registration, public TLS ingress, credentials,
  and Entra object-ID authorization.
- Rejected: Matrix is available now without opening inbound ports.

## Consequences

- Titus gains a real interactive control surface without new public ingress.
- The Matrix access token and recovery key become production secrets managed in
  Phase and rotated by restarting only Titus.
- Matrix crypto state becomes durable tenant data and must be preserved during
  rollback and recovery.
- The tenant keeps the upstream-pinned image without an adapter fork.
- Email remains available but cannot be treated as failover command execution.
- Production qualification must test unauthorized users and shared rooms; an
  authorized-user DM is permitted as a separate session.
