# Titus Telegram DM Channel

This runbook covers the single-user Telegram interaction surface for Titus. It
contains no credentials and does not authorize additional users, groups,
channels, or webhook ingress.

## Boundary

- Phase path: `/agents/hermes-titus/telegram`
- Accepted Phase keys: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_USERS`
- `TELEGRAM_ALLOWED_USERS`: exactly one numeric Gary user ID
- Chat scope: private direct messages only
- Transport: outbound polling
- Group sender policy: explicit empty `group_allow_from`
- Activation: readiness-gated; absent/invalid profiles disable Telegram without
  stopping Titus or sibling channels

The bot token is never printed, logged, committed, placed in command
arguments, or copied into this runbook. User IDs and message bodies are not
included in health evidence.

## Local checks

```bash
python3 -m pytest tenants/hermes-titus/tests/test_telegram_runtime_contract.py -q
bash -n tenants/hermes-titus/runtime/load-phase-env.sh
bash -n tenants/hermes-titus/runtime/start-with-secrets.sh
git diff --check
```

## Read-only Phase check

Use the approved Phase operator environment and inspect only the key names:

```bash
phase secrets export \
  --app timeless-tech-solutions \
  --env production \
  --path /agents/hermes-titus/telegram \
  --format json | jq '{keys:(keys|sort)}'
```

Expected output contains exactly the two contract keys. Never print the JSON
values or pipe the full export into logs.

## Disabled-first activation

1. Run the local checks and inspect the source diff.
2. Deploy the source through the normal Titus procedure while Telegram is
   absent/invalid or otherwise not ready; Titus must remain healthy with only
   Telegram disabled.
3. Restart only `hermes-titus.service` and verify Titus, Matrix, memory, and
   AgentMail remain healthy.
4. Verify no Telegram webhook URL, listener, host port, or token appears in
   Docker inspection or logs.
5. Confirm the Phase profile has exactly the two expected keys without values.
6. With the profile ready, restart only Titus and verify the redacted bot
   identity, Hermes gateway `telegram=connected` state, and polling evidence.

## Gary canary

1. Gary sends one harmless private DM to the Titus bot.
2. Verify exactly one response in that private chat within 30 seconds under
   normal provider and runtime health.
3. Verify a harmless tool/read request still uses existing Titus approval and
   tool boundaries.
4. Verify an unauthorized sender and a group/supergroup/forum/channel update
   produce no agent turn, tool call, memory write, or visible response.
5. Verify Matrix, email intake, memory, meeting processing, and approvals are
   unchanged.

## Safe evidence

Allowed evidence fields are bounded state, configured policy cardinality,
transport mode, connection state, and failure category. Do not collect message
text, usernames, chat titles, user IDs, update IDs, tokens, or raw provider
payloads.

## Stop and rollback

Stop immediately if any unauthorized or non-private update reaches Titus, if
Telegram requires public ingress, or if any secret/content appears in evidence.
Disable Telegram readiness through the approved Phase workflow and restart
only `hermes-titus.service`. Confirm no new Telegram turn is accepted and
preserve `hermes-titus-data`, Matrix crypto/session state, email-poller state,
and all other Titus surfaces. Do not delete volumes or log the bot out.

Additional users, group/forum access, channel posts, webhooks, proactive cron
delivery, and Matrix retirement require a separate reviewed feature.
