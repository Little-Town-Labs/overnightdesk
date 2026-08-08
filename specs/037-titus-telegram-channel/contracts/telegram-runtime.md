# Contract: Titus Telegram Runtime

## Phase path

Path: `/agents/hermes-titus/telegram`

Exactly these keys are accepted:

- `TELEGRAM_ALLOWED_USERS`
- `TELEGRAM_BOT_TOKEN`

`TELEGRAM_ALLOWED_USERS` must be exactly one decimal numeric Telegram user ID.
It must not be empty, contain commas, contain whitespace, or equal `*`.
`TELEGRAM_BOT_TOKEN` must be non-empty, contain no whitespace, and match the
provider token shape without being printed or persisted in source.

## Runtime policy

When the profile is ready, the runtime configures the native Telegram platform
with:

```yaml
platforms:
  telegram:
    enabled: true
    extra:
      allow_from: ["<phase-projected-user-id>"]
      group_allow_from: []
      require_mention: false
      guest_mode: false
      observe_unmentioned_group_messages: false
      disable_link_previews: true
```

The source template remains disabled. There is no `group_allowed_chats`,
`allowed_chats`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET`, public port,
or Nginx route.

## Acceptance boundary

An inbound update may create a Titus turn only when:

1. the native Telegram platform is ready and connected;
2. the chat type is private;
3. the sender ID equals the single Phase-projected ID; and
4. the event is not bot-authored or otherwise rejected by the native adapter.

No group, supergroup, forum, channel, unauthorized sender, wildcard policy, or
invalid Phase profile may create a turn.

## Secret and evidence boundary

The token may appear only in the root-owned runtime secret file and the
provider client memory. Logs, source, process arguments, health responses,
Docker inspection, and runbook examples contain no token or message body.
