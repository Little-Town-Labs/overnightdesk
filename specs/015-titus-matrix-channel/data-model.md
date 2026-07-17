# Data Model: Titus Matrix Communication Channel

This feature adds no application database. Configuration and durable state live
inside the existing Titus runtime boundary.

## Matrix Channel Configuration

Represents the operator-approved channel boundary materialized from Phase.

| Field | Classification | Validation |
| --- | --- | --- |
| enabled | configuration | Exact string boolean; defaults and rolls back to false |
| homeserver | configuration | Exact HTTPS base URL for the bot account's homeserver |
| bot user ID | configuration | Exact full Matrix ID for Titus |
| allowed user IDs | authorization | Exactly one full Matrix ID for this slice |
| allowed room IDs | authorization | Exactly one opaque room ID for this slice |
| access token | secret | Non-empty; Phase-only; never logged or persisted in source |
| recovery key | secret | Non-empty; Phase-only; never logged or persisted in source |

Configuration is `disabled`, `ready`, or `invalid`. Only `ready` enables the
Hermes Matrix platform. Invalid input fails before the container starts.

## Matrix Bot Identity

Represents the authenticated bot session returned by the homeserver.

| Attribute | Rule |
| --- | --- |
| Matrix user | Must equal `@hermes-titus:matrix.org` |
| Homeserver | Must be compatible with `matrix.org` client discovery |
| Device identity | Bound to the access token and native E2EE store |
| Room membership | Must include the exact authorized room before activation |
| Encryption readiness | Must be ready in required mode |

The identity is derived at runtime and is never accepted merely because the
configured display name resembles Titus.

## Authorized Operator

| Attribute | Rule |
| --- | --- |
| Matrix user ID | Exactly `@frozensolo:matrix.org` |
| Shared room | Exactly the authorized room |
| Approval authority | Only for prompts created by that same sender |

Display names, email addresses, room aliases, and identity-server discovery are
not authorization evidence.

## Authorized Room

| Attribute | Rule |
| --- | --- |
| Room ID | Exactly `!LuLWlULPVgtogXtKbP:matrix.org` |
| Visibility | Private |
| Encryption | Required |
| Main session | Stable room-scoped Hermes session |
| Real threads | Independent session namespaces |
| Mentions | Inbound bot mention not required; outbound room mention forbidden |

## Matrix Event Disposition

Every inbound event reaches exactly one disposition before an agent turn.

```text
received
  -> rejected_sender
  -> rejected_room
  -> rejected_unencrypted
  -> ignored_old
  -> ignored_duplicate
  -> ignored_edit_or_notice
  -> ignored_self_or_bridge
  -> accepted
       -> queued
       -> active
       -> waiting_approval
       -> succeeded | failed | denied | cancelled | superseded
```

The native adapter may retain bounded event identifiers for deduplication.
Operational logs retain only event ID hashes or bounded protocol identifiers,
disposition, timestamps, and failure categories—not message bodies.

## Room Session

| Attribute | Rule |
| --- | --- |
| Session key | Derived from exact room ID; explicit Matrix thread adds thread root |
| Busy behavior | Queue ordinary follow-ups |
| Control behavior | Explicit stop, steer, status, and approval commands only |
| Persistence | Existing Hermes session storage on `hermes-titus-data` |
| Cross-room resume | Forbidden by exact-room intake and cross-room tool policy |

## Matrix Encryption Store

Native state below `/opt/data/platforms/matrix/store/` containing device and
room encryption material. It is owned by runtime UID 10000, persists on
`hermes-titus-data`, is never copied into repository artifacts, and must not be
deleted during stop, rollback, token repair, or normal redeployment.

State transitions:

```text
absent -> initializing -> ready
                    \-> failed
ready -> stale_device -> rotation_required -> initializing
```

`failed` and `stale_device` are fail-closed states.

## Channel Health Snapshot

Metadata-only operational view:

| Field | Bounded values |
| --- | --- |
| configured state | disabled, ready, invalid |
| platform state | disabled, connecting, connected, reconnecting, error |
| authenticated user match | true, false, unknown |
| encryption mode/readiness | required plus ready, failed, unknown |
| sync freshness | timestamp or age in seconds; stale above 120 seconds |
| last event disposition | enum value only |
| last failure category | auth, membership, encryption, network, rate_limit, config, stale_sync, internal |
| reconnect attempts | bounded integer |

No field contains credentials, recovery material, room message text, attachment
content, approval text, or full third-party payloads.
