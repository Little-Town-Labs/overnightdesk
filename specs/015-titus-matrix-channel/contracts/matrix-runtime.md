# Contract: Hermes Titus Matrix Runtime

## Fixed Identities

- Homeserver: `https://matrix-client.matrix.org`
- Bot: `@hermes-titus:matrix.org`
- Authorized operator: `@frozensolo:matrix.org`
- Authorized room: `!LuLWlULPVgtogXtKbP:matrix.org`
- Identity server: not used by Hermes and not part of authorization

## Phase Contract

Path: `/agents/hermes-titus/matrix`

Exactly these keys are accepted:

- `MATRIX_ENABLED`
- `MATRIX_HOMESERVER`
- `MATRIX_ACCESS_TOKEN`
- `MATRIX_DEVICE_ID`
- `MATRIX_USER_ID`
- `MATRIX_ALLOWED_USERS`
- `MATRIX_ALLOWED_ROOMS`
- `MATRIX_RECOVERY_KEY`

The loader MUST reject unknown keys. `MATRIX_ENABLED` MUST be `true` or `false`.
The non-secret identity fields MUST match the fixed values above. Access token
and recovery key MUST be non-empty and MUST NOT equal a placeholder when the
channel is enabled. The device ID MUST be the dedicated stable value
`HERMESTITUS01`.

When disabled, Matrix credential fields MUST NOT be copied into the generated
runtime environment. The loader emits only `TITUS_MATRIX_STATE=disabled`.

When enabled and valid, the loader copies the eight Phase values into the
root-owned runtime file and adds these repository-controlled values:

```text
TITUS_MATRIX_STATE=ready
MATRIX_ALLOW_ALL_USERS=false
MATRIX_HOME_ROOM=!LuLWlULPVgtogXtKbP:matrix.org
MATRIX_E2EE_MODE=required
MATRIX_REQUIRE_MENTION=false
MATRIX_SESSION_SCOPE=room
MATRIX_AUTO_THREAD=false
MATRIX_DM_AUTO_THREAD=false
MATRIX_DM_MENTION_THREADS=false
MATRIX_REACTIONS=true
MATRIX_APPROVAL_REQUIRE_SENDER=true
MATRIX_ALLOW_ROOM_MENTIONS=false
MATRIX_PROCESS_NOTICES=false
MATRIX_TOOLS_ALLOW_REDACTION=false
MATRIX_TOOLS_ALLOW_INVITES=false
MATRIX_TOOLS_ALLOW_ROOM_CREATE=false
MATRIX_ALLOW_PUBLIC_ROOMS=false
MATRIX_TOOLS_ALLOW_CROSS_ROOM=false
MATRIX_TOOLS_ALLOW_CROSS_ROOM_DESTRUCTIVE=false
MATRIX_MAX_MEDIA_BYTES=10485760
TITUS_MATRIX_STALE_SYNC_SECONDS=120
```

## Native Image Contract

Image: `overnightdesk/hermes-agent:0.18.0-coder`

The runtime MUST use the bundled Matrix plugin and existing E2EE dependencies.
Qualification verifies the plugin is present and production verification proves
the exact identity, shared-room membership, room encryption, and crypto store.

## Hermes Configuration Contract

The repository template keeps Matrix disabled. `start-with-secrets.sh` changes
`platforms.matrix.enabled` to true only when `TITUS_MATRIX_STATE=ready`.

Matrix uses:

- stable room session scope;
- synthetic auto-threading disabled;
- real Matrix threads isolated;
- global `display.busy_input_mode: queue`;
- default per-user group session isolation retained;
- Matrix administrative and cross-room tools disabled.

## Event Authorization Contract

An event may create an agent turn only when all are true:

1. The channel is enabled and connected with required E2EE ready.
2. The sender exactly matches `@frozensolo:matrix.org`.
3. The room exactly matches `!LuLWlULPVgtogXtKbP:matrix.org`, or the event is a
   DM from the exact authorized operator under the native adapter policy.
4. The event is new, unique, not bot-authored, not a replacement edit, not a
   notice, and not produced by an ignored bridge identity.
5. Media, if present, is within the configured bound.

No display name, room alias, identity-server result, quoted sender, or prompt
text can satisfy authorization.

## Response and Control Contract

- Every accepted instruction receives visible processing activity and one
  terminal state.
- Ordinary input queues while a run is busy.
- Explicit stop and steer controls apply only to the current room session.
- Approval reactions are accepted only from the requesting authorized sender.
- Matrix failures do not promote AgentMail into a tool-executing fallback.

## Health and Evidence Contract

Qualification and production verification MUST prove:

- systemd, container, dashboard, memory gateway, and Hermes gateway liveness;
- Matrix platform connected as the exact bot;
- exact sender and room policy active;
- required E2EE ready and crypto store writable on the named volume;
- sync freshness no older than 120 seconds;
- no published ports and the existing container hardening intact;
- no Matrix secrets or message bodies in Docker inspection, health output, or
  sampled logs.

Health output uses bounded state and failure-category fields only.

## Stop and Rollback Contract

Rollback sets `MATRIX_ENABLED=false`, restarts only `hermes-titus.service`, and
verifies no new Matrix turn is accepted. It MUST preserve:

- `hermes-titus-data`, including Matrix crypto and Hermes sessions;
- `titus-email-poller-data`;
- the bot Matrix account and access-token session;
- the existing AgentMail poller service and Phase path.

The rollback MUST NOT log the bot account out, delete the crypto store, remove
either data volume, or change AgentMail intake policy.
