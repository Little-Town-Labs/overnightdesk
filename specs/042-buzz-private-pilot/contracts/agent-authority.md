# Contract: Agent Authority

## Allowed

- One new canary public identity.
- One owner public identity as caller.
- One approved test channel.
- Read context and post one bounded reply in the correct channel/thread.
- One active prompt at a time with timeout, output cap, and event deduplication.

## Denied

- Unknown callers or channels; direct messages unless separately approved.
- Shell, code/repository mutation, Docker, deployment, secrets, MCP, payments,
  outreach, CRM, customer/prospect data, or cross-workspace memory.
- Owner/admin private keys and existing Walter, Titus, or Trevor credentials.
- `respond-to anyone`, implicit tools, or automatic authority expansion.

## Fail-Closed Rules

Missing owner/channel configuration means respond to nobody. Invalid
signatures, revoked membership, repeated events, excessive work, adapter errors,
and prohibited requests produce safe reason codes and no action. Revocation
cancels queued work before reconnect/publish attempts.

## Verification

Run 20 owner requests, messages from an unapproved identity and channel,
adversarial authority requests, duplicate/reconnect cases, restart, resource
bounds, and relay/channel revocation. Expected prohibited actions: zero.
