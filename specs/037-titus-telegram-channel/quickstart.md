# Quickstart: Titus Telegram DM Channel

This procedure contains no credentials and never prints Phase values.

## Local qualification

```bash
python3 -m pytest tenants/hermes-titus/tests/test_telegram_runtime_contract.py -q
bash -n tenants/hermes-titus/runtime/load-phase-env.sh
bash -n tenants/hermes-titus/runtime/start-with-secrets.sh
git diff --check
```

Expected result: all Telegram contract tests pass; the source template is
disabled; no webhook, public port, group allowlist, wildcard, or token literal
is present.

Final local verification used:

```bash
PYTHONPATH=tenants/hermes-titus/tests:tenants/hermes-titus/mcp-servers/guarded-agentmail \
  pytest tenants/hermes-titus/tests \
  tenants/hermes-titus/mcp-servers/guarded-agentmail/tests -q
```

Result: `171 passed`, with one pre-existing pydantic warning.

## Read-only Phase preflight

From the approved production operator environment, inspect only the Telegram
Phase key names and redacted presence metadata:

```bash
phase secrets export \
  --app timeless-tech-solutions \
  --env production \
  --path /agents/hermes-titus/telegram \
  --format json | jq '{keys:(keys|sort)}'
```

Expected keys are exactly `TELEGRAM_ALLOWED_USERS` and
`TELEGRAM_BOT_TOKEN`. Never print the resulting JSON values.

## Disabled-first deployment

1. Deploy the source using the existing Titus deployment procedure.
2. Restart only `hermes-titus.service` while Telegram is not ready.
3. Verify Titus, memory, Matrix, and AgentMail remain healthy.
4. Verify no public Telegram webhook port exists and Docker inspection contains
   no token value.

## Controlled activation and canary

1. Confirm the Phase profile still has exactly the two expected keys without
   printing values.
2. Start Titus with the profile available and wait for redacted Telegram
   `connected`/polling evidence.
3. Gary sends one harmless private DM and verifies one response in the same
   chat within 30 seconds under normal health.
4. Verify a non-private test update and an unauthorized sender create no Titus
   turn, tool call, memory write, or visible response.
5. Verify Matrix, email intake, memory, and approval behavior remain healthy.

## Rollback

Remove Telegram readiness or disable the Phase profile through the approved
secret-management workflow, then restart only `hermes-titus.service`. Verify
Telegram stops accepting new turns and preserve `hermes-titus-data`, Matrix
crypto/session state, email-poller state, and all other runtime surfaces.

## Stop conditions

Stop and roll back if any of these occur:

- group or unauthorized messages produce any Titus activity;
- token or message content appears in logs, process listings, health output, or
  source;
- Telegram activation requires a public route or new service;
- Matrix, AgentMail, memory, meeting processing, or approvals regress;
- the Phase profile is missing, ambiguous, wildcarded, or has extra keys.
