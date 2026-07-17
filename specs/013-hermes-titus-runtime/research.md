# Research: Hermes Titus Runtime

## Existing Hermes attachment instead of a replacement image

**Decision**: Attach TencentDB Agent Memory to the pinned OvernightDesk Hermes image and persist its package/provider files in Titus's named volume.

**Rationale**: TencentDB documents an existing-Hermes provider path, while OvernightDesk requires pinned derived Hermes releases. This keeps Titus aligned with the currently qualified agent runtime and avoids an unreviewed all-in-one image.

**Alternatives considered**: Build TencentDB's example Hermes image; run the memory gateway as a network-visible second container. The example image changes the Hermes installation boundary, and a second exposed service adds unnecessary network authority.

## Memory backend

**Decision**: Use TencentDB Agent Memory 0.3.6 with its local SQLite plus sqlite-vec backend and store all data below Titus's `/opt/data` volume.

**Rationale**: The upstream provider supports a zero-cloud-credential local backend. It is sufficient for one Titus agent, preserves tenant locality, and can be verified on ARM64 before activation.

**Alternatives considered**: Tencent Cloud VectorDB. It requires a separate cloud credential and service decision that the MVP does not need.

## Secret injection

**Decision**: A root-owned systemd launcher reads the existing host Phase service token, retrieves exact Titus paths, validates all keys, and writes a root/group-readable file below `/run/hermes-titus`. The container sources that read-only file at startup.

**Rationale**: `/run` is ephemeral. Docker inspect contains only the mount path, while Titus receives neither the broad Phase service credential nor secret values as Docker environment arguments.

**Alternatives considered**: Docker `--env-file` with a persistent file; mounting the Phase service token; persisting `.env` in the tenant volume. Each alternative increases credential persistence or authority.

## Microsoft Teams

**Decision**: Use Hermes's native Microsoft Teams platform adapter for the TTS bot. Install its pinned optional Python dependencies now but enable the platform only after the Phase client ID, client secret, tenant ID, and explicit allowed-user IDs are real.

**Rationale**: The official Hermes integration validates Bot Framework traffic, supports DMs/chats/channels, and recommends `TEAMS_ALLOWED_USERS`. It requires a public TLS `/api/messages` endpoint, so publishing ingress before credentials exist would be non-functional and needlessly expand attack surface.

**Alternatives considered**: `TEAMS_ALLOW_ALL_USERS=true`; Graph-only posting; an incoming webhook. Allow-all violates least privilege. Graph-only does not provide an interactive bot. Incoming webhooks are useful for one-way notifications but do not satisfy the support-agent requirement.

## Microsoft Teams meeting pipeline

**Decision**: Defer meeting ingestion, Graph webhook subscriptions, and automated 72-hour subscription renewal until the basic Teams bot is activated and the operator explicitly approves meeting access.

**Rationale**: Meeting transcripts and recordings broaden data access and require distinct Microsoft Graph application permissions, public ingress, and renewal operations. They are not required for Titus's initial support presence.

**Alternatives considered**: Enable all Teams meeting features during initial install. This would over-grant access before the TTS use cases and retention boundaries are confirmed.

## Control Tower

**Decision**: Keep the existing `/agents/hermes-titus/overnightdesk` caller token and require Titus to discover authority only through `/v1/session`.

**Rationale**: Control Tower already enforces token-bound workspaces and capability profiles. No Azure credentials should be given directly to Titus.

**Alternatives considered**: Provide Azure service-principal credentials to Titus or infer workspace from network placement. Both bypass the designed broker boundary.

## AgentMail

**Decision**: Connect Hermes directly to AgentMail's hosted MCP endpoint and interpolate `AGENTMAIL_API_KEY` into the `x-api-key` header from the Phase-loaded process environment. Do not persist the credential or rely on the local `agentmail-mcp` bridge.

**Rationale**: Hermes resolves `${AGENTMAIL_API_KEY}` from the process environment before opening the hosted Streamable HTTP connection, so the credential never appears as a literal in persisted YAML.

**Alternatives considered**: Write the API key into the tenant config or command arguments. Both are unnecessarily observable and persistent.
