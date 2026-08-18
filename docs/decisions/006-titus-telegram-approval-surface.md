# ADR 006: Use Hermes Native Telegram Approval for Titus Email Sends

## Status

Proposed

## Context

Feature 025 correctly binds Titus outbound email to an exact draft, a short-lived
token, SecurityTeam screening, provider idempotency, and exact readback. Its
owner gate is MCP form elicitation. In a Telegram-initiated turn, the active
Hermes runtime can instead route an approval through its native gateway queue,
which already renders authorized inline buttons and resolves the waiting agent
thread. The two surfaces are not equivalent operationally: a Telegram owner
message cannot answer a terminal prompt waiting in the MCP client.

## Decision

For Telegram-initiated `titus_send_approved_email` calls, a repo-owned Hermes
`pre_tool_call` policy escalates the call to the existing gateway approval
queue. The request uses a unique per-tool-call approval key and exposes only
Approve Once/Deny semantics to the owner. The local MCP sender skips its second
MCP elicitation only when the child process is explicitly running in the
Telegram session context. All local draft, token, screening, idempotency, and
readback checks remain authoritative.

Other callers retain the existing MCP elicitation path. The feature does not
add a bridge service, alter the Hermes image, widen Telegram access, or change
provider contracts.

## Consequences

- Telegram approval is delivered and resolved in the same private DM session.
- One call cannot silently inherit a prior session/permanent approval.
- The runtime depends on the pinned Hermes native `send_exec_approval` and
  `resolve_gateway_approval` contracts; qualification must detect drift.
- The policy must keep its review description and telemetry content-free.
- Telegram rollback remains reversible by disabling the tenant channel or
  removing the repo-owned plugin; guarded email can still roll back to hosted
  read-only mode.

## Rejected Alternatives

- **Ask the owner to type `/approve` or a token**: repeats the fragile channel
  mismatch and exposes internal controls.
- **Add a Telegram-to-MCP bridge**: adds another credentialed service and
  approval state without improving the existing Hermes path.
- **Trust Telegram text as approval**: makes identity, exact-draft binding,
  replay, and concurrent-session handling ambiguous.
