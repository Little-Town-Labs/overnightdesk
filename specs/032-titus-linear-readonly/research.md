# Research: Titus Linear Read-Only Delivery

## Decision 1: Use Linear's hosted read-only MCP directly

**Decision**: Configure Hermes to call
`https://mcp.linear.app/mcp/readonly` over Streamable HTTP.

**Rationale**: Linear documents this endpoint as exposing only read tools.
Hermes natively supports remote HTTP MCP servers, environment-backed headers,
tool filtering, and automatic discovery. A direct connection is the fewest
moving parts and keeps current delivery state in its owning system.

**Alternatives considered**:

- Local Linear MCP wrapper: rejected because it duplicates a provider-operated
  protocol surface without adding a necessary control.
- Custom GraphQL client: rejected because it adds an API client and maintenance
  boundary when the hosted MCP already fits Hermes.
- Webhook bridge: rejected because the pilot has no event-driven behavior.

**Sources**:

- https://linear.app/docs/mcp
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md

## Decision 2: Use a team-scoped Read API key for the pilot

**Decision**: A human administrator creates a key with only `Read` permission
and limits it to the `TTS` team. The key is named and used only for Titus.

**Rationale**: Linear explicitly supports permission- and team-restricted API
keys and accepts them as bearer credentials for the hosted MCP. This gives the
pilot a stable, revocable credential without adding an OAuth callback, token
refresh process, app webhook, or a billable teammate. The read-only MCP endpoint
and team-scoped Read key enforce independent boundaries.

**Alternatives considered**:

- Interactive user OAuth: rejected for the pilot because it grants the
  installing user's accessible workspace surface and introduces persisted
  authorization state without improving the read-only requirement.
- Linear app user: rejected for now because agent/app behavior is in Developer
  Preview and its useful mention/delegation model is mutation-oriented.
- Client-credentials OAuth: rejected because expiring token renewal would add
  runtime machinery that the read-only pilot does not need.

**Sources**:

- https://linear.app/docs/mcp
- https://linear.app/docs/api-and-webhooks
- https://linear.app/developers/agents
- https://github.com/phasehq/cli/blob/main/src/cmd/secrets_export.go

Phase CLI's export implementation returns provider errors to the caller and
formats an empty successful result as an empty JSON object. The loader
therefore treats only a successful empty object as an absent optional path;
every nonzero export, timeout, malformed document, or invalid profile fails
without replacing the prior runtime environment. Qualification executes these
cases against a fake `PHASE_BIN` rather than matching mutable error text.

## Decision 3: Keep Linear authoritative and store no copy

**Decision**: Query delivery state on demand and retain no provider dataset,
editable replica, semantic-memory copy, webhook ledger, or authoritative cache.

**Rationale**: Titus needs current coordination context, not a second backlog.
Direct reads avoid staleness, conflict resolution, retention rules, migrations,
and recovery work.

**Alternatives considered**:

- Full PostgreSQL extraction: rejected because it creates competing state and
  unnecessary retention/security obligations.
- Narrow event ledger: deferred until an approved event-driven workflow exists.
- Cached snapshots: rejected as an authoritative fallback; connection failures
  must be reported plainly.

## Decision 4: Use native GitHub linking without issue synchronization

**Decision**: Human administrators connect approved repositories with Linear's
native GitHub integration for PR/commit/status evidence. GitHub Issues
synchronization remains unconfigured.

**Rationale**: PR linking connects delivery and implementation evidence while
preserving Linear as the backlog and GitHub as the code-review/merge system.
Issue synchronization would create competing work items.

**Alternatives considered**:

- GitHub Issues two-way sync: rejected for the pilot because it creates a second
  backlog.
- A Titus-owned GitHub token: rejected because native integration owns this
  function and Titus does not need GitHub authority.

**Source**: https://linear.app/docs/github

## Decision 5: Treat target verification as the Done boundary

**Decision**: A merge may advance work toward verification but cannot by itself
make an issue Done. Human-reviewed target-environment evidence is required.

**Rationale**: Linear's default GitHub automation can move work to Done on
merge, but Linear also supports branch-specific workflow destinations. The TTS
workflow must preserve a verification state between merge and Done when the
target environment requires it.

**Alternative considered**: Default merged-to-Done automation was rejected
because it overstates delivery before runtime verification.

**Source**: https://linear.app/docs/github
