# ADR-002: Route AgentMail Through SecurityTeam Before Hermes

## Status

Accepted

## Date

2026-07-17

## Context

The first Titus email poller called OpenRouter directly and produced an
acknowledgement without entering Hermes tools, memory, or Control Tower. The
platform already has a dirty `content_staging` table, a SecurityTeam cleaning
worker, and a clean `ingested_messages` table. Three AgentMail inboxes must map
to three isolated Hermes runtimes.

## Decision

Use one route-configured Go worker image with one instance per inbox. Instances
land untrusted extracted email in `content_staging`, consume only approved clean
rows joined to their exact route, call the documented Hermes Runs API, and send
one threaded AgentMail reply. SecurityTeam remains the only dirty-to-clean
writer. Matrix, Telegram, and Control Tower remain the approval authorities.

SecurityTeam preserves instruction semantics only for an exact protected
AgentMail route whose producer validated the sender. It still detects injection
signals, redacts secrets, and sends suspicious content to its existing approval
gate. All other content retains the normal untrusted wrapper.

## Alternatives Considered

### Direct OpenRouter calls

Rejected because they bypass Hermes tools, memory, sessions, and approval policy.

### Synchronous SecurityTeam scan endpoint

Rejected because it bypasses the durable dirty and clean tables.

### New routing and delivery schema

Rejected because the existing staging reference and trusted metadata support
the three isolated per-route workers without a migration.

### Python Hermes platform plugin

Rejected because the existing hardened Go poller already owns AgentMail
transport and recovery, and the upstream Runs API is the documented integration
surface.

## Consequences

- Email instructions enter the full Hermes agent loop only after cleaning.
- A pure-Go PostgreSQL dependency is added to the existing worker.
- Each Hermes runtime must expose its authenticated API only on the private
  Docker network.
- Source remains temporarily under the Titus tenant directory to keep source
  relocation out of the behavior change.
- Old direct-model and email-specific approval code is removed after cutover.
- Exact sender allowlists live in protected Phase route configuration rather
  than being inferred from messages or duplicated as source-code policy.
