# Hermes Titus

`hermes-titus` is the OvernightDesk operations and support agent for Control Tower, the TTS Microsoft Teams workspace, and Titus's AgentMail inbox. Its tenant source, skills, runtime contract, and production lifecycle files live here.

## Runtime boundary

- Container: `hermes-titus`
- Image: `overnightdesk/hermes-agent:0.18.0-coder`
- Volume: `hermes-titus-data`
- Network: `overnightdesk_overnightdesk`
- Public ports: none during the initial install
- Service manager: `hermes-titus.service`
- Memory: TencentDB Agent Memory 0.3.6 with private local SQLite/sqlite-vec storage

Titus does not receive the Phase service-account token or Azure credentials. The host loader reads exact Phase paths and materializes downstream values only under `/run/hermes-titus`. The file is mounted read-only and sourced by the container entrypoint; Docker configuration contains no secret values.

## Phase records

Core runtime:

- `/agents/hermes-titus/runtime`: `OPENROUTER_API_KEY`, `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `AGENTMAIL_EMAIL_ADDRESS`, `HERMES_DEFAULT_MODEL`
- `/agents/hermes-titus/overnightdesk`: `CONTROL_TOWER_TOKEN`

TTS Teams preparation:

- `/agents/hermes-titus/teams`: `TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`, `TEAMS_ALLOWED_USERS`, `TEAMS_ALLOWED_USER_EMAILS`, `TEAMS_ALLOW_ALL_USERS`, `TEAMS_PORT`, `TEAMS_HOME_CHANNEL`, `TEAMS_HOME_CHANNEL_NAME`, `TEAMS_DELIVERY_MODE`, `TEAMS_TEAM_ID`, `TEAMS_CHANNEL_ID`

Email polling:

- `/agents/hermes-titus/email`: `AGENTMAIL_POLLING_ENABLED`, `AGENTMAIL_POLL_INTERVAL_SECONDS`, `AGENTMAIL_AUTO_REPLY_ALLOWED_SENDERS`, `AGENTMAIL_APPROVAL_ALLOWED_SENDERS`, `AGENTMAIL_MAX_MESSAGES_PER_CYCLE`, `AGENTMAIL_APPROVAL_SIGNING_SECRET`

The automatic-reply and approval sets must contain exactly
`garyb@timelesstechs.com,austin@timelesstechs.com`. The signing secret is a
dedicated random value of at least 32 bytes and must never leave Phase. Polling
must be created as `false`, initialized, and verified before activation.

The email path is consumed only by the standalone Go poller. It is not loaded
into the Hermes container.

`TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`, and `TEAMS_ALLOWED_USERS` remain `NOT_CONFIGURED` until the TTS app is created. `TEAMS_ALLOW_ALL_USERS` must remain `false`. Email addresses are onboarding references; populate `TEAMS_ALLOWED_USERS` with the corresponding Entra/AAD object IDs before activation.

## AgentMail

The `agentmail` MCP server connects directly to `https://mcp.agentmail.to/mcp` and interpolates `AGENTMAIL_API_KEY` from the Titus process; its configuration never embeds the key. Titus must use `skills/agentmail-email/SKILL.md` for inbox discovery, read-only triage, draft preparation, and approval-gated mailbox mutations.

The standalone `titus-email-poller` Go container is Titus's only active
communications channel. It calls OpenRouter directly without Hermes tools or
memory, sends automatic replies only to the exact Gary/Austin addresses, and
creates an immutable approval draft for every other sender. Both operators
receive the draft. The first valid
`APPROVE <QUEUE_ID> <TOKEN>` sends it once; `REJECT <QUEUE_ID> <TOKEN>` closes it
without a sender reply. Interactive/manual mail mutations remain separately
approval-gated.

Poller state is stored at `/data/state.json` on the dedicated
`titus-email-poller-data` volume; the original email body and plaintext approval
token are not persisted. Health is written to `/data/health.json`. The receive
allowlist must not be removed until the disabled Go container is deployed and
the existing mailbox has been initialized as preexisting.

## Control Tower

Titus uses `skills/control-tower-hermes/SKILL.md`. It must call `/v1/session` first and treat the returned agent, workspace, profile, and capability IDs as authoritative. It never connects directly to Azure or broadens authority from a prompt.

## TTS Microsoft Teams activation

The initial container includes Hermes's pinned Teams dependencies but leaves the platform disabled. Activation requires a separate production change:

1. Authenticate the Microsoft Teams CLI to the TTS tenant.
2. Create or update the bot with the approved endpoint `https://<domain>/api/messages`.
3. Put the emitted client ID, one-time client secret, and tenant ID into the matching Phase records.
4. Resolve the approved users' Entra object IDs and set `TEAMS_ALLOWED_USERS`.
5. Keep `TEAMS_ALLOW_ALL_USERS=false`.
6. Add the reviewed nginx TLS route to the container's internal port 3978.
7. Restart only Titus and verify `/health`, one authorized message, and one unauthorized denial.

Meeting transcript/recording ingestion is not part of the initial activation. It requires separate Graph permissions, a `/msgraph/webhook` route, a client-state secret, data-retention approval, and automated subscription renewal.

## Operator commands

From the `overnightdesk` repository:

```bash
tenants/hermes-titus/scripts/qualify.sh
tenants/hermes-titus/scripts/deploy-aegis.sh install
tenants/hermes-titus/scripts/deploy-aegis.sh verify
tenants/hermes-titus/scripts/deploy-aegis.sh status
tenants/hermes-titus/scripts/deploy-aegis.sh restart
tenants/hermes-titus/scripts/deploy-aegis.sh stop
tenants/hermes-titus/scripts/deploy-aegis.sh rollback

tenants/hermes-titus/email-poller/scripts/qualify.sh
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh install
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh verify
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh initialize
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh run-once
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh audit-mailbox
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh open-intake
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh close-intake
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh status
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh restart
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh stop
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh rollback
```

The Hermes `stop` action preserves `hermes-titus-data`; the poller `stop` action
preserves `titus-email-poller-data`. Do not delete either volume during routine
stop, rollback, credential repair, or Teams activation.

Safe activation order:

1. Populate the Phase email path with `AGENTMAIL_POLLING_ENABLED=false`.
2. Install and verify `titus_email_poller=disabled`.
3. Run the Go deploy script's `initialize` action and confirm its JSON reports
   `"sends":0`.
4. Deploy Hermes without the retired Python poller and verify Hermes health.
5. Remove the AgentMail receive allowlist so other senders can reach the queue.
6. Change polling to `true`, restart only `titus-email-poller.service`, and
   verify `titus_email_poller=healthy`.

Rollback sets polling to `false`, restarts only the Go service, verifies
disabled health, and optionally restores the AgentMail receive allowlist. Keep
the dedicated volume and drafts for review.
