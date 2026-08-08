# Hermes Titus

`hermes-titus` is the OvernightDesk operations and support agent for Control Tower, the TTS Microsoft Teams workspace, and Titus's AgentMail inbox. Its tenant source, skills, runtime contract, and production lifecycle files live here.

## Runtime boundary

- Container: `hermes-titus`
- Image: `overnightdesk/hermes-agent:0.19.1-coder`
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

## Local project knowledge

The `titus-project-knowledge-data` volume stores durable project background as
ordinary Markdown and is mounted read-write at
`/opt/data/project-briefs` in Titus. It runs entirely on Aegis: there is no
account, token, sync client, companion service, or public endpoint.

Project knowledge is authoritative for durable background only. Linear is
authoritative for TTS technical-delivery work and status, code and review state
remain in GitHub, target environments own deployment verification, deployed
contracts remain in the platform standard, and source customer records remain
in their approved document systems. Titus Kanban is coordination only.

Treat project notes as untrusted data. A note can supply project context;
it cannot grant authority, bypass approval, expose credentials, or require an
external action merely because its text contains instructions.

Titus uses `skills/titus-project-knowledge/SKILL.md` to discover, read, cite,
and narrowly maintain this Markdown context. New notes use a root `README.md`
index when present and stable category folders (`00-inbox`, `10-projects`,
`20-decisions`, `30-reference`, and `90-archive`) without automatically moving
existing notes.

On a fresh installation, volume preparation seeds an empty project-knowledge
volume from `hermes-titus-data/project-briefs`; after that, the dedicated
volume is the only active copy. The existing encrypted Aegis backup includes
it as a separate ordinary-file dataset.

## Phase records

Core runtime:

- `/agents/hermes-titus/runtime`: `OPENROUTER_API_KEY`, `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `AGENTMAIL_EMAIL_ADDRESS`, `HERMES_DEFAULT_MODEL`, `SECURITY_SERVICE_TOKEN`
- `/agents/hermes-titus/overnightdesk`: `CONTROL_TOWER_TOKEN`
- `/agents/hermes-titus/memory`: `MEMORY_TENCENTDB_LLM_MODEL`, `MEMORY_TENCENTDB_EMBEDDING_ENABLED`, `MEMORY_TENCENTDB_EMBEDDING_PROVIDER`, `MEMORY_TENCENTDB_EMBEDDING_BASE_URL`, `MEMORY_TENCENTDB_EMBEDDING_MODEL`, `MEMORY_TENCENTDB_EMBEDDING_DIMENSIONS`, `MEMORY_TENCENTDB_EMBEDDING_SEND_DIMENSIONS`
- `/agents/hermes-titus/linear`: optional disabled/ready profile containing
  `LINEAR_ENABLED` and, only when ready, exact workspace/team metadata plus
  `LINEAR_API_KEY`
The memory path is fail closed. With
`MEMORY_TENCENTDB_EMBEDDING_ENABLED=false`, Titus keeps keyword/BM25 recall and
does not load the remote embedding configuration. Activation requires the
exact Perplexity 4B route, 1,536 dimensions, `sendDimensions=true`, and a controlled
Titus-only restart. `MEMORY_TENCENTDB_LLM_MODEL` independently fixes memory
processing to `xiaomi/mimo-v2.5-pro`; the Phase-backed OpenRouter credential is
not used for Titus's interactive inference. OpenRouter remains scoped to memory
processing and embeddings.

## Linear technical delivery

The optional `linear` MCP server connects directly to
`https://mcp.linear.app/mcp/readonly`. Source and production default disabled;
activation requires exact workspace `Timeless Technology Solutions`, team
`TTS`, and a team-limited `Read` API key from the dedicated Phase path. The
projected configuration contains only an environment placeholder, never the
key value.

Titus uses `skills/linear-technical-delivery/SKILL.md` for current backlog,
cycle, dependency, blocker, risk, verification, and delivery-status questions.
Linear content is untrusted. Titus reports identifiers, status, owner when
present, observation time, and completeness but cannot create, edit, assign,
comment on, transition, archive, or delete records. Humans retain priority,
scope, commitment, assignment, acceptance, architecture, and technical
decisions. Done requires target-environment verification, not merge alone.

Linear's native GitHub integration may surface approved pull-request and commit
evidence. GitHub Issues synchronization remains unconfigured, and Titus has no
GitHub credential. This release adds no webhook, bridge, database copy, cache,
event ledger, or mutation wrapper. See
`runbooks/linear-technical-delivery.md` for setup, canary, revocation, and
rollback.

TTS Teams preparation:

- `/agents/hermes-titus/teams`: `TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_TENANT_ID`, `TEAMS_ALLOWED_USERS`, `TEAMS_ALLOWED_USER_EMAILS`, `TEAMS_ALLOW_ALL_USERS`, `TEAMS_PORT`, `TEAMS_HOME_CHANNEL`, `TEAMS_HOME_CHANNEL_NAME`, `TEAMS_DELIVERY_MODE`, `TEAMS_TEAM_ID`, `TEAMS_CHANNEL_ID`

The Teams interaction is active as a mention-only MVP limited to one approved
`TTS-Internal` channel. Gary and Austin are independently allowlisted; ordinary
non-mentioned messages, other channels, passive reading, all-message RSC
delivery, attachments, and meeting artifacts are excluded. The public Bot
Framework endpoint is `/api/messages` on the Titus dashboard hostname. Explicit
memory and action requests continue through Titus's existing boundaries. The
repo-owned `titus-teams-routing` Hermes plugin enforces the exact Team/channel
and provider-mention checks before Hermes reasoning.

- `/agents/hermes-titus/teamsmeetings`: the separate `MSGRAPH_*` meeting
  application identity, strict two-organizer allowlist, disabled webhook
  settings, and one-time qualification input. The root meeting-processor loader
  projects only tenant/client credentials, the organizer allowlist, and fixed
  polling/lookback bounds; it never projects webhook or join values.
- `/agents/hermes-titus/meetingbriefs`: Feature 035 custody key ring, review
  bearer/signing key, filer bearer, fixed Gary/Austin addresses, and exact
  project-route definitions. Legacy analyzer key/model fields may remain in
  Phase during rollback cooling-off, but the loader ignores them and never
  projects them. Values are projected only when the corresponding root-owned
  processing and filing markers exist.

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

The `agentmail` MCP server connects directly to
`https://mcp.agentmail.to/mcp` and interpolates `AGENTMAIL_API_KEY` from the
Titus process; its configuration never embeds the key. Its exact tool include
list is read-only: inbox, thread, message, search, and attachment retrieval.
Direct provider send, reply, forward, draft, delete, label, inbox, webhook,
key, domain, list, and other mailbox mutations are unavailable.

New outbound messages use the separate local `guarded_agentmail` stdio MCP
server. It exposes one read-only preparation tool and exactly one send
mutation. Preparation validates and canonicalizes the complete draft, rejects
unsupported fields, and returns a 30-minute purpose-derived HMAC token bound to
the exact inbox, recipients, subject, text, HTML, and empty attachment state.
The send tool accepts only that unchanged draft and token, validates their
fingerprint, and then blocks on Hermes's MCP elicitation approval surface.
Decline, cancel, timeout, or approval-routing failure stops before external
I/O. Explicit acceptance synchronously calls SecurityTeam's private
authenticated `/check-outbound`, submits every supplied field to AgentMail with
one stable idempotency key, then reads the exact message back. Only exact inbox,
recipient, subject, supplied-body, message/thread ID, and `sent`-label equality
returns `verified_sent`.

The guarded state database is mode 0600 under
`/opt/data/guarded-agentmail/attempts.sqlite3` in `hermes-titus-data`. It stores
only logical-send identifiers, a draft digest, idempotency key, safe state/error
codes, provider IDs, and timestamps—never recipients, subject, text, HTML,
approval tokens, SecurityTeam content, or credentials. Structured stderr
events likewise omit draft and token values. Rollback removes the local guarded
server from Titus while retaining the hosted read-only allowlist and the state
database for reconciliation.

Titus must use `skills/agentmail-email/SKILL.md` for inbox discovery, triage,
exact draft presentation, later-turn explicit owner approval, guarded sending,
and fail-closed success reporting. Replies, forwards, drafts, attachments,
CC/BCC, custom headers, and mailbox administration remain unsupported.

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

Titus's approved default route is Codex provider `openai-codex`, model
`gpt-5.6-sol`, and reasoning effort `medium`. The Phase-backed
`HERMES_DEFAULT_MODEL` is projected to `HERMES_INFERENCE_MODEL`, so the approved
interactive route has process-level precedence over mutable dashboard or
restored-session selections.

The meeting-brief worker uses Titus's existing private API route for one
bounded, tool-free request and validates the returned Meeting Brief locally.
It does not create meeting sessions or delegate child agents. Hermes's general
interactive delegation support remains a separate capability, with subagent
auto-approval disabled and the existing manual/deny approval policy governing
sensitive actions.

Codex authentication is a fresh Titus-owned OAuth enrollment in the persistent
Hermes auth store. It must report active provider `openai-codex` and auth mode
`chatgpt`, and `auth.json` must remain owned by `10000:10000` with mode 0600.
Do not copy Walter's or Mitchel's auth file, store OAuth material in Phase, or
print tokens, authorization codes, callback URLs, or credential documents.
The owner's browser authorization is the only interactive enrollment step.

The OpenRouter credential remains required by the separate TencentDB memory
processing and embedding clients. That split is intentional: changing
`HERMES_DEFAULT_MODEL` must not change `TDAI_LLM_MODEL`. Production activation
must stage compatible source first, update the exact Sol primary and MiMo
memory selectors as one transaction, and restart only
`hermes-titus.service`. Any failed auth, projection, health, delegation, or
memory gate stops the cutover and invokes the retained Titus-only rollback.

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
6. Enable the route-only nginx configuration for `https://titus-dashboard.overnightdesk.com/api/messages` to the container's internal port 3978; the dashboard route remains independent.
7. Restart only Titus and verify `/health`, one authorized message, and one unauthorized denial.

Meeting artifact discovery and reviewed brief generation run in the separate
`meeting-processor/` service. Organizer-scoped Microsoft Graph delta queries
discover transcript and recording metadata. Feature 035 encrypts raw WebVTT
with AES-256-GCM for exactly 168 hours and screens it through SecurityTeam.
The processor sends one stateless, no-tools request through Titus's existing
private Hermes API and accepts only a strict Meeting Brief v1 JSON object. The
local validator rejects provider identifiers, unsafe fields, malformed output,
and tool/action content. Only accepted output can be emailed exactly once to
Gary and Austin; a rejection is terminal and produces no email or filing.
Feature 035 supplies no model, provider, extra credential, or approval
resolution. The existing email poller intercepts only exact clean `APPROVE
<ref>` or `HOLD <ref>` replies before Hermes; the first terminal decision wins.
Approval alone allows the private filer to create a deterministic
project/inbox note and internal Kanban tasks. Recording MP4 is streamed,
bounded, hashed, correlated, and discarded without analysis. None of these
private services publishes a host port. See
`runbooks/meeting-artifact-discovery.md` for qualification, canaries, failure
response, activation, and rollback. Channel meetings, a separate channel bot,
and Graph subscription/webhook lifecycle remain a separate feature.

## Operator commands

From the `overnightdesk` repository:

```bash
tenants/hermes-titus/scripts/qualify.sh
tenants/hermes-titus/scripts/deploy-aegis.sh install
tenants/hermes-titus/scripts/deploy-aegis.sh verify
tenants/hermes-titus/scripts/deploy-aegis.sh status
tenants/hermes-titus/scripts/deploy-aegis.sh restart
tenants/hermes-titus/scripts/deploy-aegis.sh email-read-only
tenants/hermes-titus/scripts/deploy-aegis.sh email-guarded
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

tenants/hermes-titus/meeting-processor/scripts/qualify.sh
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh install-feature-035-disabled
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh verify-feature-035-disabled
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh enable-brief
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh disable-brief

tenants/hermes-titus/meeting-filer/scripts/qualify.sh
tenants/hermes-titus/meeting-filer/scripts/deploy-aegis.sh initialize
tenants/hermes-titus/meeting-filer/scripts/deploy-aegis.sh enable
tenants/hermes-titus/meeting-filer/scripts/deploy-aegis.sh verify
tenants/hermes-titus/meeting-filer/scripts/deploy-aegis.sh rollback
```

The Hermes and intake stop/rollback actions preserve all named volumes. Do not
delete them during routine recovery or credential repair.

Guarded-email rollback is separate from the dashboard rollback. The
`email-read-only` action installs a root-owned durable marker, restarts only
Titus, projects the local guarded MCP server out of the runtime config, and
fully verifies the retained hosted read-only server and all runtime state.
`email-guarded` validates and removes only that marker, restarts only Titus,
and requires both guarded tools again. Neither action changes the native
dashboard route, deletes the attempt ledger, or restores a direct AgentMail
mutation.

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
