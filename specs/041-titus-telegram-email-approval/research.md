# Research: Titus Telegram-Native Guarded Email Approval

## Existing runtime evidence

Read-only inspection of the pinned `hermes-titus` container on Aegis confirmed:

- `/opt/hermes/plugins/platforms/telegram/adapter.py` implements
  `send_exec_approval` with inline `Allow Once` and `Deny` buttons.
- The adapter authorizes callback users through the normal gateway identity
  path and calls `tools.approval.resolve_gateway_approval`.
- `/opt/hermes/tools/approval.py` exposes the gateway notify registration,
  queue, resolver, expiry, and fail-closed wait used by dangerous tool gates.
- `/opt/hermes/gateway/run.py` registers that callback for every gateway turn
  and prefers the adapter button surface when available.
- The current Titus guarded MCP server instead calls `Context.elicit`, which
  is the source of the terminal-oriented prompt observed in the incident.

## Chosen approach

Use Hermes's existing `pre_tool_call` approval escalation for the single Titus
send mutation when the child process is in a Telegram session. This keeps the
approval decision in the same gateway/session that owns the Telegram DM and
avoids a new bot, webhook, bridge, token, or durable message-content store.

## Safety notes

The outer approval is not a replacement for local controls. The MCP server must
still verify the exact signed draft token, screen the complete content through
SecurityTeam, preserve one-send idempotency, and exact-read the AgentMail
record. The plugin must not log arguments or approval values. Its approval key
must be unique per tool call so a native `Session` or `Always` button cannot
silently approve a later send.

## Unresolved external dependency

The feature depends on the pinned Hermes image retaining the documented native
approval method and callback resolver. Qualification must fail closed if those
symbols or the plugin hook contract drift; updating the Hermes image is outside
this feature.
