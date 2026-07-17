# Quickstart: Titus Email Inbox Polling

## Local qualification

```bash
cd /home/frosted639/src/overnightdesk-suite/overnightdesk
python -m unittest discover -s tenants/hermes-titus/tests -p 'test_*.py'
tenants/hermes-titus/scripts/qualify.sh
git diff --check
```

Tests use fake AgentMail/OpenRouter transports and temporary SQLite files. They
must not require or read production credentials.

## Production preflight

```bash
tenants/hermes-titus/scripts/deploy-aegis.sh status
tenants/hermes-titus/scripts/deploy-aegis.sh verify
```

Confirm `hermes-titus` is healthy, on `overnightdesk_overnightdesk`, has no
published ports, and still has Teams disabled.

## Controlled deployment

1. Populate `/agents/hermes-titus/email` in Phase with polling disabled and the
   exact Gary/Austin sender and approver sets.
2. Run `tenants/hermes-titus/scripts/deploy-aegis.sh install`.
3. Run the deployment script's poller initialization action. Confirm its output
   reports zero sends and a nonzero/zero preexisting count as appropriate.
4. Verify the disabled health state and inspect metadata-only logs.
5. Remove the AgentMail receive allowlist entries only now.
6. Set `AGENTMAIL_POLLING_ENABLED=true` in Phase and restart Titus.
7. Verify enabled poller freshness and perform controlled smoke checks.

Never paste Phase, AgentMail, OpenRouter, or approval token values into a shell
command captured in history, a log, an issue, or this repository.

For the explicitly authorized transition where only the newest unread trusted
message must remain eligible, use:

```bash
TITUS_INITIALIZE_LEAVE_LATEST_TRUSTED=true \
  tenants/hermes-titus/scripts/deploy-aegis.sh initialize-poller
```

This fails closed unless the newest inbound message is unread and from one of
the exact trusted addresses. It still reports zero sends; activation is a
separate step.

## Rollback

1. Set `AGENTMAIL_POLLING_ENABLED=false` in Phase.
2. Restart only `hermes-titus.service` and verify disabled health.
3. Restore the AgentMail receive allowlist if external intake must be stopped at
   the provider boundary.
4. Preserve `/opt/data/agentmail-poller/state.db` and pending drafts for review.
