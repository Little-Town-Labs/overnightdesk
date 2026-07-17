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

`TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`, and `TEAMS_ALLOWED_USERS` remain `NOT_CONFIGURED` until the TTS app is created. `TEAMS_ALLOW_ALL_USERS` must remain `false`. Email addresses are onboarding references; populate `TEAMS_ALLOWED_USERS` with the corresponding Entra/AAD object IDs before activation.

## AgentMail

The `agentmail` MCP server connects directly to `https://mcp.agentmail.to/mcp` and interpolates `AGENTMAIL_API_KEY` from the Titus process; its configuration never embeds the key. Titus must use `skills/agentmail-email/SKILL.md` for inbox discovery, read-only triage, draft preparation, and approval-gated mailbox mutations. Sending, forwarding, deleting, or changing external mailbox state always requires explicit human approval.

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
```

`stop` preserves `hermes-titus-data`. Do not delete the volume during routine stop, rollback, credential repair, or Teams activation.
