# Research: Titus Telegram DM Channel

## Native Hermes Telegram support

**Decision**: Use the Telegram plugin already installed in Titus's pinned
Hermes image.

**Rationale**: The official Hermes documentation describes Telegram setup with
`TELEGRAM_BOT_TOKEN` and numeric `TELEGRAM_ALLOWED_USERS`, and the live Titus
container contains `/opt/hermes/plugins/platforms/telegram/` plus
`python-telegram-bot`. Reusing the native plugin preserves the existing Titus
session, memory, tool, and approval pipeline.

**Source**: [Hermes Telegram guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram/)
and [Hermes environment variables](https://hermes-agent.nousresearch.com/docs/reference/environment-variables/).

**Alternatives considered**: The retired OvernightDesk Engine Telegram bridge
would create a second runtime boundary and does not match the active Hermes
deployment. A custom proxy would duplicate authorization and message handling.

## Private-DM-only authorization

**Decision**: Put Gary's exact numeric ID in `allow_from` and set the native
adapter's `group_allow_from` to an explicit empty list. Do not configure
`group_allowed_chats`, `allowed_chats`, guest mode, or a webhook.

**Rationale**: The pinned adapter performs an adapter-level sender check before
text batching and chooses `allow_from` for private chats and `group_allow_from`
for group/forum/channel scope. An explicit empty group list therefore rejects
all group-scope senders even when Gary is authorized for DMs. This is stronger
than relying on mention gating or the global user allowlist alone.

**Verification**: Read-only inspection of the live pinned adapter at
`/opt/hermes/plugins/platforms/telegram/adapter.py` confirmed that precedence.
No production source or runtime values were printed.

**Alternatives considered**: Relying only on `TELEGRAM_ALLOWED_USERS` would
leave group behavior dependent on upstream defaults. Allowing a group chat
would authorize its members as a chat-level boundary. Webhooks would add an
unneeded public ingress surface.

## Phase secret contract

**Decision**: Reuse the existing `/agents/hermes-titus/telegram` Phase record
with exactly `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_USERS`.

**Rationale**: A read-only live Phase check confirmed those exact keys already
exist. No `TELEGRAM_ENABLED` key is required; source readiness is controlled by
strict shape/value validation and the existing disabled-first deployment
procedure. The token is never committed, logged, placed in a command argument,
or printed in diagnostics.

## Transport and operations

**Decision**: Use outbound polling and no Telegram webhook.

**Rationale**: The Titus runtime is always-on and already has no public service
port. Hermes documents polling as the default mode and webhook mode as requiring
additional public HTTPS configuration. Polling achieves the requested client
replacement without changing Nginx, TLS, or network exposure.

## Scope boundary

**Decision**: Do not alter Matrix/Element configuration as part of this feature.

**Rationale**: Telegram is an additive alternative channel. Retiring Matrix,
rotating its device, or migrating its sessions would be a separate destructive
or stateful change with its own rollback and approval requirements.

## Final qualification evidence

- The Telegram-focused runtime projection and contract checks pass.
- The full current Titus test invocation reports `173 passed, 1 failed`; the
  failure is a pre-existing Teams telemetry assertion on current `main`, not
  part of this feature.
- `tenants/hermes-titus/scripts/qualify.sh` passed with `141 passed` and the
  same warning.
- Aegis post-deploy verification reported `telegram_state=ready`, exactly one
  configured Telegram user, an empty group sender allowlist, healthy Titus,
  Matrix, Teams, AgentMail, and memory checks, and `published_ports=none`.
- The first Gary private-DM canary remains pending. No Telegram message body,
  user ID, bot token, or raw provider payload was collected as evidence.
