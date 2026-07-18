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

Semantic recall uses OpenRouter model `perplexity/pplx-embed-v1-4b` at 1,536
dimensions. The model's Matryoshka representation keeps the existing vector
width while its 32K model context permits a guarded 32,000-character gateway
input cap. Embedding input leaves the host for OpenRouter; SQLite records and
vectors remain in the private `hermes-titus-data` volume.

Titus does not receive the Phase service-account token or Azure credentials. The host loader reads exact Phase paths and materializes downstream values only under `/run/hermes-titus`. The file is mounted read-only and sourced by the container entrypoint; Docker configuration contains no secret values.

## Phase records

Core runtime:

- `/agents/hermes-titus/runtime`: `OPENROUTER_API_KEY`, `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `AGENTMAIL_EMAIL_ADDRESS`, `HERMES_DEFAULT_MODEL`
- `/agents/hermes-titus/overnightdesk`: `CONTROL_TOWER_TOKEN`
- `/agents/hermes-titus/memory`: `MEMORY_TENCENTDB_EMBEDDING_ENABLED`, `MEMORY_TENCENTDB_EMBEDDING_PROVIDER`, `MEMORY_TENCENTDB_EMBEDDING_BASE_URL`, `MEMORY_TENCENTDB_EMBEDDING_MODEL`, `MEMORY_TENCENTDB_EMBEDDING_DIMENSIONS`, `MEMORY_TENCENTDB_EMBEDDING_SEND_DIMENSIONS`

The memory path is fail closed. With
`MEMORY_TENCENTDB_EMBEDDING_ENABLED=false`, Titus keeps keyword/BM25 recall and
does not load the remote embedding configuration. Activation requires the
exact Perplexity 4B route, 1,536 dimensions, `sendDimensions=true`, and a controlled
Titus-only restart.

TTS Teams preparation:

- `/agents/hermes-titus/teams`: `TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`, `TEAMS_ALLOWED_USERS`, `TEAMS_ALLOWED_USER_EMAILS`, `TEAMS_ALLOW_ALL_USERS`, `TEAMS_PORT`, `TEAMS_HOME_CHANNEL`, `TEAMS_HOME_CHANNEL_NAME`, `TEAMS_DELIVERY_MODE`, `TEAMS_TEAM_ID`, `TEAMS_CHANNEL_ID`

Matrix channel:

- `/agents/hermes-titus/matrix`: `MATRIX_ENABLED`, `MATRIX_HOMESERVER`, `MATRIX_ACCESS_TOKEN`, `MATRIX_DEVICE_ID`, `MATRIX_USER_ID`, `MATRIX_ALLOWED_USERS`, `MATRIX_ALLOWED_ROOMS`, `MATRIX_RECOVERY_KEY`

The active Matrix contract is `https://matrix-client.matrix.org`, bot
`@hermes-titus:matrix.org`, operator `@frozensolo:matrix.org`, and encrypted
room `!LuLWlULPVgtogXtKbP:matrix.org`. Phase paths are case-sensitive; all eight
records must remain under the lowercase `matrix` path. The access token and
recovery key are secret values and must never be printed, logged, committed, or
placed in Docker configuration.

Routed email intake:

- `/agents/hermes-email-intake/titus`
- `/agents/hermes-email-intake/agent`
- `/agents/hermes-email-intake/mitchel`

Each path contains the strict AgentMail identity, exact sender allowlist,
least-privilege database URL, route ID, target Hermes private API, API key,
limits, and enabled flag. New paths start disabled. The Titus Hermes loader
reads only the Titus API key from this path to authenticate its private Runs
API; other intake credentials never enter the Hermes container.

`TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`, and `TEAMS_ALLOWED_USERS` remain `NOT_CONFIGURED` until the TTS app is created. `TEAMS_ALLOW_ALL_USERS` must remain `false`. Email addresses are onboarding references; populate `TEAMS_ALLOWED_USERS` with the corresponding Entra/AAD object IDs before activation.

## AgentMail

The `agentmail` MCP server connects directly to `https://mcp.agentmail.to/mcp` and interpolates `AGENTMAIL_API_KEY` from the Titus process; its configuration never embeds the key. Titus must use `skills/agentmail-email/SKILL.md` for inbox discovery, read-only triage, draft preparation, and approval-gated mailbox mutations.

The shared Go email intake runs as three isolated systemd template instances.
It lands every newly observed message in `content_staging` as dirty input and
never calls a model with that raw body. SecurityTeam alone produces
`ingested_messages.safe_content`; the exact route instance atomically claims an
approved clean row and submits it to the mapped Hermes `/v1/runs` API. Hermes
retains its normal tools, memory, model routing, and Matrix/Telegram approval
channel. Intake cannot approve actions. A completed result is replied once in
the original AgentMail thread.

## Matrix

Matrix is Titus's primary interactive channel and uses Hermes's native Matrix
adapter, so authorized room messages enter the normal Hermes reasoning, tools,
memory, session, and approval pipeline. No public ingress port is required.

Titus's approved default route is OpenRouter model `x-ai/grok-4.3` with Hermes
`agent.reasoning_effort` set to `medium`. The Phase-backed
`HERMES_DEFAULT_MODEL` is shared by the interactive gateway and standalone email
poller; reasoning effort applies to Hermes agent turns.
The gateway exports `HERMES_INFERENCE_MODEL` from that Phase value so the
approved route has process-level precedence over mutable dashboard or restored-
session model selections.

Hermes sub-agent delegation uses OpenRouter model `x-ai/grok-build-0.1`.
The vision/image-analysis auxiliary slot remains on its existing route until a
compatible image-input/text-output model is approved; xAI's Grok Imagine image
quality model is an image generation/editing route, not a vision-analysis slot.

The repository fixes the channel policy at required E2EE, one exact operator,
one exact shared room, room-scoped sessions, queue-mode busy input, requester-
bound approvals, no room-mention expansion, no Matrix administration tools,
and a 10 MiB media limit. The native adapter also accepts direct messages from
the exact authorized operator; those DMs are a separate room-scoped session and
do not authorize any other user or shared room.

Activation is fail closed. `MATRIX_ENABLED=false` omits token and recovery-key
values from the container runtime and leaves the platform disabled. When all
identity, allowlist, token, and recovery records are valid, set the flag to
`true`, restart only `hermes-titus.service`, and run `deploy-aegis.sh verify`.
Verification proves the exact bot identity, encrypted-room membership, crypto
store initialization, container hardening, email-poller continuity, and absence
of Matrix secrets from Docker inspect output.

Volume preparation refuses to run while the `hermes-titus` container is active;
configuration and identity updates must use the controlled service restart path.

Per-route recovery state is stored at `/data/state.json` on
`hermes-email-intake-<route>-data`; message content is not persisted there.
Health is written to `/data/health.json`. Initialize each disabled route before
activation so historical inbox messages remain checkpointed.

## Control Tower

Titus uses `skills/control-tower-hermes/SKILL.md`. It must call `/v1/session` first and treat the returned agent, workspace, profile, and capability IDs as authoritative. It never connects directly to Azure or broadens authority from a prompt.

Tool shells do not receive `CONTROL_TOWER_TOKEN` directly. Titus runs the
fixed-purpose `/opt/data/bin/control-tower-session` helper, which sources the
protected runtime mount internally, calls only the private `/v1/session`
endpoint, validates the exact read-only authority boundary, and returns only
safe session metadata. The bearer token never appears in the agent command or
its output.

Titus's durable identity prompt is source-owned at `config/SOUL.md` and copied
to `/opt/data/SOUL.md`. It identifies the agent as Titus while explicitly
leaving Control Tower's returned session and capability profile authoritative.

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
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh initialize all
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh verify all
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh enable titus
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh enable agent
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh status
tenants/hermes-titus/email-poller/scripts/deploy-aegis.sh rollback all
```

The Hermes and intake stop/rollback actions preserve all named volumes. Do not
delete them during routine recovery or credential repair.

Safe activation order:

1. Populate all three strict Phase paths with polling disabled.
2. Verify each mapped Hermes API privately with authentication.
3. Install the shared image and initialize all historical inbox messages with
   zero sends.
4. Activate and verify Titus first, then Hermes Agent for
   `netgleb@gmail.com`.
5. Activate Hermes Mitchel for `mitchelcbrown88@gmail.com` after verifying the
   exact Phase allowlist.

Rollback sets polling to `false`, restarts only the Go service, verifies
disabled health, and restores the legacy Titus poller when Titus is rolled
back. Keep the dedicated volume and database rows for reconciliation.
