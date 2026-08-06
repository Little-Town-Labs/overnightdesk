# Research: Titus TTS-Internal Channel MVP

## Decision: Wrap the existing Hermes Teams adapter with a repo-owned plugin

**Decision**: Keep Titus's Teams bot inside the existing `hermes-titus` runtime and route explicit `@Titus` interactions through a repo-owned Hermes platform plugin that delegates accepted events to the native Teams adapter.

**Rationale**: The repository already pins the Hermes Teams dependency, exposes the Teams platform entry, reserves port 3978, and maintains a separate Teams Phase path. Hermes's plugin registry permits a same-name platform override, so the exact Team/channel and provider-mention checks can live in source control without copying or mutating the full image adapter. A new bot service, message queue, database, or agent runtime would add authority and recovery surfaces without improving the single-channel MVP.

**Evidence**:

- `tenants/hermes-titus/config/config.yaml` already declares the `hermes-teams` toolset and a disabled Teams platform with port 3978 and `allow_all_users: false`.
- `tenants/hermes-titus/README.md` already defines the Teams Phase path, public HTTPS `/api/messages` endpoint, Entra object-ID allowlist, TLS route, and disabled-first activation boundary.
- Hermes documents that channel bots respond to `@` mentions and require a public HTTPS webhook in production: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/teams
- The installed Hermes registry supports plugin adapters overriding a built-in platform name; the Titus plugin preserves the native Teams send, approval-card, and standalone-delivery surfaces while gating inbound messages and card actions.

## Decision: Start with mention-only channel interaction

**Decision**: Do not request all-message RSC delivery for the MVP. Titus processes only an explicitly addressed `@Titus` message from an authorized user in the exact `TTS-Internal` channel.

**Rationale**: Hermes documents channel interaction as mention-driven by default. This removes passive message ingestion, reduces data exposure and inference volume, and avoids a Team-scoped permission that could deliver messages from other channels in the containing Team. Ordinary channel messages are ignored before Titus processing.

**Deferred**: Microsoft documents `ChannelMessage.Read.Group` for all-message delivery, but that permission and passive-context design are deferred until the mention-driven MVP is qualified and a separate scope decision approves the broader boundary.

**Official sources**:

- Hermes Teams behavior: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/teams
- All-message delivery and mention filtering: https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/conversations/channel-messages-for-bots-and-agents
- RSC resource and permission scope: https://learn.microsoft.com/en-us/microsoftteams/platform/graph-api/rsc/resource-specific-consent

## Decision: Keep bot and meeting identities separate

**Decision**: Use the existing `/agents/hermes-titus/teams` identity for conversational Teams activity. Do not project or reuse the `/agents/hermes-titus/teamsmeetings` `MSGRAPH_*` identity, meeting permissions, webhook settings, or artifact credentials for this MVP.

**Rationale**: Feature 035 and Issue 165 already establish that organizer meeting polling and channel-meeting discovery are separate authority and lifecycle boundaries. The conversational MVP must not create a second transcript pipeline or silently activate channel-meeting permissions.

## Decision: Use existing Titus memory and approval boundaries

**Decision**: Treat only an authorized explicit `@Titus` request as Titus input. Require an explicit operator request before durable memory promotion. Route actions through existing Titus approval controls and add no new autonomous authority.

**Rationale**: Business records remain in their owning systems, and the constitution prohibits prompts or agent memory from becoming the sole source of truth. Hermes already provides the native memory capability, so the MVP supplies behavior instructions and qualification evidence rather than another persistence path. A source-channel marker must accompany any approved durable memory entry so later recall does not imply access to excluded project channels.

**Implementation boundary**: The Teams adapter only decides whether a message
may enter Hermes. The native Hermes memory capability remains responsible for
the actual write, correction, removal, and provider persistence behavior.

**Official Hermes references**:

- Native persistent memory and explicit memory requests: https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/
- Memory write approval configuration: https://hermes-agent.nousresearch.com/docs/user-guide/configuration/

## Decision: No new persistence or service for the MVP

**Decision**: Reuse the existing Titus runtime volume and native session/delivery state. Do not create a new database, queue, event ledger, public service, or sidecar solely for one-channel routing.

**Rationale**: The MVP is one channel and two users. The required duplicate/replay behavior must be proven against the pinned runtime and its existing state. If the adapter cannot provide safe replay behavior, implementation must stop for a scope/architecture decision rather than adding an unreviewed state service.

## Deferred alternatives

- Team-wide application permissions: rejected because they exceed the approved channel scope.
- Tenant-wide Graph message or meeting permissions: rejected because they conflict with least privilege and the separate meeting identity boundary.
- A second Titus agent or channel-specific container: rejected because the MVP uses the existing Titus runtime and does not require a new memory or credential boundary.
- Passive ordinary-message ingestion and automatic durable memory: deferred because they increase retention, privacy, and routing scope.
- File, attachment, channel-meeting, webhook, and multi-channel support: deferred to separately scoped work.
