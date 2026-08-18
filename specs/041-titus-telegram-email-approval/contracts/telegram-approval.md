# Telegram Guarded Email Approval Contract

## Trigger

The repo-owned Hermes plugin observes `pre_tool_call` and returns an approval
directive only when:

- `tool_name == "titus_send_approved_email"`; and
- `HERMES_SESSION_PLATFORM == "telegram"`.

All other calls return no directive.

## Approval request

The directive message is safe for a Telegram owner and contains a short draft
fingerprint plus an instruction to review the exact draft already shown in the
same conversation. It never contains the approval token or raw email body.

The rule key is unique to the current tool call. The native gateway may render
session/permanent button labels for compatibility, but those choices cannot
match a later tool call's unique key.

Before returning the directive, the plugin writes a short-lived empty marker
whose name is derived from the current session and draft fingerprint. The
marker name also incorporates a digest of the prepared approval token. The
marker is only a process handoff; it contains no email or token values.

The plugin removes the marker on denial or timeout through the existing
`post_approval_response` hook. An approved marker remains only until the child
server consumes it once.

## Resolution

The native Telegram adapter authorizes the callback user, resolves the gateway
queue, and edits the prompt to show the result. Positive resolution allows the
unchanged tool call to reach the local MCP server. Denial, expiry, callback
failure, or unauthorized access blocks the call.

## Child-server behavior

The local guarded MCP server skips only its MCP elicitation when
`HERMES_SESSION_PLATFORM=telegram` is present in the child environment and it
can consume a fresh marker for the same validated fingerprint. It still
performs `validate_approval` before any external I/O and preserves the existing
SecurityTeam, AgentMail, idempotency, readback, and safe error contracts.
Missing marker or any other platform value uses the existing elicitation.
