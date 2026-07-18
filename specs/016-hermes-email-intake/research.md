# Research: Routed Hermes Email Intake

## Decision: Preserve the dirty-to-clean database path

**Decision**: AgentMail producers insert raw extracted text into
`content_staging`. SecurityTeam remains the only writer of cleaned
`ingested_messages`. Consumers join the clean row to its staging record and
filter trusted route metadata.

**Rationale**: This is the existing production architecture and restores the
boundary the Titus direct-OpenRouter worker bypassed. Joining through the
existing `staging_id` avoids a schema migration and leaves legacy unrouted rows
unclaimable.

**Alternatives considered**:

- Call `/scan-inbound` synchronously: rejected because it bypasses durable dirty
  landing and the clean-table handoff.
- Add new routing tables and delivery tables: rejected as unnecessary for three
  one-inbox worker instances and contrary to the least-change constraint.

## Decision: Reuse the existing Go poller as one route-configured binary

**Decision**: Generalize the current Go 1.24 worker and deploy one instance per
inbox/agent route.

**Rationale**: The worker already has bounded AgentMail pagination, extracted
text selection, hardened container execution, durable state, health checks,
idempotent replies, and Aegis qualification. Per-instance configuration makes
cross-agent isolation simpler than a shared in-process dispatcher.

**Alternatives considered**:

- Python Hermes platform plugin: rejected because it adds a second language and
  more custom code than the existing Go service needs.
- One process polling all inboxes: rejected because a configuration or worker
  fault would have a larger cross-agent blast radius.
- Move source to a new repository now: rejected because source relocation and
  behavior change should be reviewed separately.

## Decision: Use the upstream Hermes Runs API

**Decision**: Submit clean messages with `POST /v1/runs`, a stable email session
identifier and session key, poll `GET /v1/runs/{run_id}`, and recognize terminal
and approval-waiting states. Discover support through authenticated
`GET /v1/capabilities` before enabling an instance.

**Rationale**: The official API invokes the full Hermes agent with tools,
memory, skills, model routing, status, stop, and approval support. It removes
the custom direct-model loop while keeping the Go worker responsible only for
transport and reconciliation.

**Source**: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/

**Alternatives considered**:

- Chat Completions: rejected because it is stateless and less suitable for
  long-running tool work and approval state.
- Responses API: viable, but Runs exposes explicit lifecycle status and
  approval operations that fit a background poller.
- Private Python imports: rejected because the capabilities endpoint and Runs
  API are the documented stable integration surfaces.

## Decision: Use pgx v5.7.6 with a bounded pool

**Decision**: Add `github.com/jackc/pgx/v5` v5.7.6, use `pgxpool`, parameterized
queries, and a small connection bound.

**Rationale**: pgx is a pure-Go PostgreSQL driver, and v5.7.6 declares Go 1.23,
which is compatible with the worker's Go 1.24 toolchain. The current v5.10 line
requires newer Go and is not selected.

**Sources**:

- https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool
- https://raw.githubusercontent.com/jackc/pgx/v5.7.6/go.mod

**Alternatives considered**:

- Direct HTTP wrapper around SecurityTeam: rejected because no existing API
  represents both durable landing and clean-row claiming.
- Another SQL driver: rejected because pgx is pure Go, current, and supports the
  PostgreSQL-specific transaction and `SKIP LOCKED` behavior already used by
  SecurityTeam.

## Decision: Keep approval outside the email worker

**Decision**: The worker never invokes the Runs approval endpoint. If a run is
waiting for approval, the worker records that state and sends one idempotent
informational email containing the run ID and fixed local helper command. The
operator must ask the agent to run that helper in its existing Matrix or
Telegram channel, where the terminal action remains subject to the normal
interactive approval boundary. Email replies never resolve the run.

**Rationale**: Sender authorization permits starting a turn, not approving its
side effects. This preserves the established operator channels and prevents an
email from approving its own instructions.

**Alternatives considered**:

- Accept `/approve` through email: rejected because email is asynchronous and
  easier to replay or quote, and the interactive approval channels already exist.
- Auto-approve allowlisted senders: rejected because sender identity does not
  authorize arbitrary infrastructure or external actions.

## Decision: Preserve authorized instructions without weakening other content

**Decision**: SecurityTeam retains the exact text of an AgentMail instruction
only when `source=agentmail`, `sender_authorized=true`, and route, inbox, and
target metadata match one protected tuple. Injection detection and secret
redaction still run. Mismatched, unauthorized, legacy, or other-source content
continues through the existing untrusted-content wrapper.

**Rationale**: The previous universal wrapper explicitly told Hermes not to
treat the email as an instruction, reproducing the acknowledgement-only bug.
The narrow route policy preserves executable intent after sender and route
validation without granting approval or trusting arbitrary email content.
