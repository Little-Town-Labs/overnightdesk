# Research: Titus Guarded Outbound Email

## Decision: Restrict the hosted AgentMail MCP server to reads

**Rationale**: Titus currently discovers 26 hosted AgentMail tools, including
send, reply, forward, draft, delete, inbox, and message mutations. Hermes
supports exact `mcp_servers.<name>.tools.include` filtering, so an allowlist
removes the dangerous provider schema without removing normal mailbox triage.

**Alternatives considered**:

- Prompt-only prohibition: rejected because the incident crossed that boundary.
- Remove AgentMail entirely: rejected because mailbox inspection is still safe
  and useful.
- Provider blacklist: rejected because a future mutation tool could appear
  without being named in the blacklist.

## Decision: Use a local Python FastMCP stdio boundary

**Rationale**: The active Hermes image already contains the official MCP Python
SDK. A local subprocess inherits only the Titus runtime environment, requires
no public listener, and can expose a narrow schema that the provider does not.
Python's standard library provides HMAC, SQLite, address parsing, JSON, and
bounded HTTPS clients without another runtime dependency.

**Alternatives considered**:

- Add validation only to the skill: rejected because prompt text is not an
  authorization or input-validation boundary.
- Proxy all provider tools: rejected because the first release needs only one
  new-message mutation and a wider proxy recreates excessive agency.
- Extend the Go intake service: rejected because that service owns inbound
  routed replies and is not the interactive Titus MCP process.

## Decision: Split preparation from the sole mutating send tool

**Rationale**: A preparation tool can validate and return a stable exact draft
plus an opaque short-lived signed token before the owner approves it. The
mutating tool then accepts only the same canonical fields and token. The token
contains a random logical-send nonce so a later approval of identical content
can intentionally represent a different send.

After token validation, the mutating tool also issues MCP form elicitation.
The active Hermes 1.26.0 client routes form elicitation through its human
approval system and fails closed on decline, cancel, timeout, or handler
failure. This makes owner authorization an enforced runtime gate instead of
relying on the MCP `destructiveHint`, which Hermes treats as descriptive tool
metadata.

**Alternatives considered**:

- Let the model calculate a SHA-256 fingerprint: rejected as error-prone.
- Accept a boolean `approved` flag: rejected because it does not bind content.
- Rely on `destructiveHint`: rejected because the active Hermes dispatcher does
  not use annotations as an authorization decision.
- Store email content in an approval database: rejected because Titus already
  presents the full draft in the owner conversation and local storage would
  unnecessarily retain message content.

## Decision: Owner objectives outrank persona preferences

**Rationale**: Titus supports both Timeless Technology Solutions Microsoft
Teams operations and the encrypted Matrix channel. Recalled preferences for a
protocol or platform are presentation-level advice, not capability or
authorization boundaries. They may inform a recommendation but cannot veto an
otherwise authorized owner objective. Concrete safety rules apply to the
unsafe field or transport method: Titus must redirect credentials to an
approved secret handoff while continuing the permitted integration or email.

The guarded boundary also canonicalizes a blank unused `text` or `html`
representation to absent. This preserves the exact approved draft when a model
serializes an optional `null` as an empty string, while retaining rejection
when both representations are absent or blank.

**Alternatives considered**:

- Let recalled persona preferences block corporate-platform work: rejected
  because persona is not an authority source and Teams is an explicit Titus
  responsibility.
- Reject a valid text body when unused HTML is empty: rejected because the
  empty representation carries no content and canonicalizes safely to absent.
- Remove outbound security screening to avoid refusals: rejected because
  secret and content screening remains a concrete transport-safety boundary.

## Decision: Use SecurityTeam's existing outbound scan synchronously

**Rationale**: Production SecurityTeam is already reachable from Titus on the
private Docker network. `/check-outbound` authenticates with a bearer token,
requires nonempty content, detects PII/secrets and restricted financial
content, and returns an explicit `allowed` decision. The existing service token
can be bound into the exact Titus Phase path without copying it to source or
Docker metadata.

**Alternatives considered**:

- Skip screening after local validation: rejected by the owner requirement and
  platform standard.
- Use SecurityTeam's approval queue as the interactive approval source:
  deferred because the current owner approval occurs in the authenticated
  Titus conversation and queue integration would add a separate notification
  and lifecycle. The scan remains mandatory immediately before every send.
- Accept redacted content and send it: rejected because it would differ from
  the owner-approved draft.

## Decision: Use provider idempotency plus content-free local state

**Rationale**: AgentMail documents `Idempotency-Key` for message sends. A retry
with the same key returns the original message and thread IDs without a second
email; a changed request returns conflict. Keys expire after 24 hours. A local
SQLite attempt row therefore preserves the logical-send identity beyond the
provider window and prevents an ambiguous old attempt from becoming a new
send.

**Alternatives considered**:

- Random key generated on each call: rejected because retries could duplicate.
- Draft creation then draft send: rejected for the first release because it
  adds more mutation surfaces and still requires provider readback.
- No local state: rejected because retries after the provider window could
  create a second message.

## Decision: Treat readback as the delivery truth

**Rationale**: The reported incident proves provider acceptance IDs do not show
that intended content was supplied. AgentMail's Get Message response contains
inbox, thread, message, labels, recipients, subject, text, and HTML, which are
the exact fields needed for verification.

**Alternatives considered**:

- Trust HTTP 200: rejected by the incident.
- Trust provider preview or extracted body: rejected because these are derived
  fields and are not the submitted body representations.
- Read the thread instead of the exact message: rejected because another
  message in the thread could mask a mismatch.

## Authoritative sources

- AgentMail send contract:
  https://docs.agentmail.to/api-reference/inboxes/messages/send
- AgentMail get-message contract:
  https://docs.agentmail.to/api-reference/inboxes/messages/get
- AgentMail idempotency:
  https://docs.agentmail.to/idempotency
- MCP protocol:
  https://modelcontextprotocol.io/llms-full.txt
- MCP Python SDK:
  https://github.com/modelcontextprotocol/python-sdk

## Decision: Move Titus's default route to MiMo V2.5 Pro

**Rationale**: The owner approved changing Titus's default OpenRouter model
from `x-ai/grok-4.3` to `xiaomi/mimo-v2.5-pro` after the guarded-email
production path was stable. OpenRouter's current catalog identifies the exact
MiMo selector, a 1,050,000-token context window, and support for `tools`,
`tool_choice`, and reasoning parameters. The route therefore preserves the
Hermes interaction contract while reducing default inference cost. Titus
retains medium reasoning and the independent `x-ai/grok-build-0.1` delegation
route.

The production transition must update the repository's Phase-loader allowlist
and live verifier before changing the protected Phase value. After merged
source is staged, update only `/agents/hermes-titus/runtime`
`HERMES_DEFAULT_MODEL` through Phase's value-update path without a `--type`
argument, re-export the non-secret selector independently, and restart only
`hermes-titus.service`.

**Alternatives considered**:

- Change only the Phase value: rejected because the reviewed fail-closed loader
  correctly prevents an unapproved selector from starting Titus.
- Reuse `xiaomi/mimo-v2.5`: rejected because the owner selected the exact Pro
  route.
- Change the delegation model at the same time: rejected to keep the cost-route
  change isolated and independently reversible.

**Authoritative source**:

- OpenRouter MiMo V2.5 Pro model:
  https://openrouter.ai/xiaomi/mimo-v2.5-pro
