# Quickstart: Titus Email Inbox Polling

## Local qualification

```bash
cd /home/frosted639/src/overnightdesk-suite/overnightdesk
tenants/hermes-titus/email-poller/scripts/qualify.sh
tenants/hermes-titus/scripts/qualify.sh
git diff --check
```

Go tests use in-memory fake AgentMail/OpenRouter transports and temporary atomic
state files. They do not require or read production credentials.

## Production preflight

```bash
tenants/hermes-titus/scripts/deploy-aegis.sh verify
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh status
```

Hermes Titus and the Go poller are separate containers on
`overnightdesk_overnightdesk`. Neither publishes a port. Teams remains disabled.

## Controlled deployment

1. Keep `/agents/hermes-titus/email` at `AGENTMAIL_POLLING_ENABLED=false`.
2. Run `tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh install`.
3. Verify `titus_email_poller=disabled` and hardened container attributes.
4. Run `tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh initialize`.
   Confirm its JSON reports `"sends":0`.
5. Remove AgentMail receive-allow entries only now.
6. Update the existing Phase flag to `true` through stdin and restart only the
   Go service.
7. Verify enabled freshness and controlled trusted/approval-queue smoke checks.

Never paste Phase, AgentMail, OpenRouter, signing-secret, or approval-token
values into shell history, logs, issues, or this repository.

## Rollback

1. Set `AGENTMAIL_POLLING_ENABLED=false` in Phase.
2. Restart only `titus-email-poller.service` and verify disabled health.
3. Restore AgentMail receive-allow entries if external intake must stop at the
   provider boundary.
4. Preserve `titus-email-poller-data` and pending AgentMail drafts for review.
