# Data Model: Hermes Titus Runtime

## Runtime definition

- **Identity**: `hermes-titus`
- **Image selector**: pinned OvernightDesk Hermes release
- **Network**: `overnightdesk_overnightdesk`
- **User**: unprivileged Hermes UID/GID
- **Resource bounds**: one CPU and two GiB memory unless revised by the operator
- **Security state**: all Linux capabilities dropped, no-new-privileges, bounded mounts
- **Lifecycle states**: absent -> preparing -> running -> healthy/degraded -> stopped -> removed

## Credential reference

- **Phase app/environment**: `azure-ops` / `production`
- **Path**: server-controlled exact path
- **Key**: exact expected name
- **Sensitivity**: config or secret
- **Required for core**: boolean
- **Activation rule**: non-empty, not placeholder, and format-valid when applicable
- **Persistence rule**: `/run` only; never named volume or container metadata

## Memory provider

- **Package**: `@tencentdb-agent-memory/memory-tencentdb`
- **Version**: `0.3.6`
- **Provider name**: `memory_tencentdb`
- **Gateway address**: `127.0.0.1:8420`
- **Store backend**: local SQLite/sqlite-vec
- **Data root**: `/opt/data/memory-tencentdb/data`
- **Health states**: unavailable, starting, healthy, degraded
- **Ownership**: Titus volume only

## Control Tower binding

- **Agent ID**: returned by `/v1/session`
- **Workspace ID**: returned by `/v1/session`
- **Capability profile**: returned by `/v1/session`
- **Token**: runtime-only Phase value
- **Authority rule**: client-supplied workspace IDs never broaden the returned binding

## TTS Teams connection

- **Client ID**: pending Phase config value
- **Client secret**: pending Phase secret value
- **Tenant ID**: pending Phase config value
- **Allowed users**: required comma-separated AAD object IDs
- **Allow all**: always false in production
- **Bot port**: internal TCP 3978
- **Webhook**: future public TLS `/api/messages` route
- **Activation states**: placeholder, ready for ingress, active, degraded, disabled

## State transitions

1. Core Titus can move from preparing to running only when model, AgentMail, and Control Tower runtime values validate.
2. Memory moves from unavailable to healthy only after the pinned package installs, the provider loads on ARM64, and gateway health passes.
3. Teams remains placeholder until all three app credentials and an explicit allowed-user list validate.
4. Teams can move to active only after the public TLS route, Microsoft bot endpoint, and authenticated message smoke test all pass.
