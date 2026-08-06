# Data Model: Titus TTS-Internal Channel MVP

This feature does not introduce a new database schema. These entities describe
the policy and message-state contract that the existing Titus runtime must
enforce.

## ChannelPolicy

Represents one approved conversational channel.

| Field | Meaning | Rules |
|---|---|---|
| `team_id` | Authoritative containing Team identity | Required; sourced from approved deployment evidence, never inferred from display name |
| `channel_id` | Authoritative `TTS-Internal` channel identity | Required; exact match only |
| `channel_name` | Human-readable verification name | Informational; never an authorization substitute |
| `enabled` | Whether the channel is active | Must default to disabled and fail closed when absent or invalid |
| `mode` | MVP behavior | `mention-only` only |
| `excluded_channels` | Known project-channel boundaries | Used for explicit negative verification; not a wildcard replacement for exact matching |

## AuthorizedPrincipal

Represents an independently authorized operator.

| Field | Meaning | Rules |
|---|---|---|
| `principal_id` | Microsoft Entra/AAD object identity | Exact allowlist match; email/display name is not sufficient |
| `display_reference` | Safe operator label for verification | Must not be used as the authorization key |
| `enabled` | Current authorization state | Gary and Austin are individually grantable and revocable |

## ChannelMessageEvent

Represents an inbound Teams message used for routing.

| Field | Meaning | Rules |
|---|---|---|
| `event_id` | Provider activity/delivery identity | Used for replay and duplicate handling; never exposed in general logs |
| `principal_id` | Sender identity | Must pass `AuthorizedPrincipal` policy |
| `team_id` / `channel_id` | Message location | Must pass exact `ChannelPolicy` match before content processing |
| `body` | Message content | Untrusted input; excluded from operational logs |
| `mentioned` | Whether Titus is explicitly addressed | Only `true` may trigger visible interaction, tools, or action preparation |
| `received_at` | Delivery timestamp | Used for bounded processing and safe diagnostics |

## InteractionContext

Context available to an explicit Titus interaction.

- Is created only after an authorized `@Titus` message passes routing.
- Must not imply access to project channels or authoritative project systems.
- Must not be copied into unrelated communication surfaces.
- Ordinary non-mentioned channel messages are outside this MVP and do not create context.

## DurableMemoryPromotion

Represents an explicit operator request to retain selected information.

- `requested_by`: authorized principal identity.
- `source_channel`: exact `TTS-Internal` source reference.
- `content`: selected information, subject to existing Titus memory policy.
- `requested_at`: promotion timestamp.
- `status`: accepted, rejected, or failed without partial write.
- No passive message may create this entity implicitly.

## ActionRequest

Represents a requested operation derived from an explicit `@Titus` interaction.

- `requested_by`: authorized principal identity.
- `source_channel`: exact `TTS-Internal` channel.
- `request_reference`: safe internal correlation reference.
- `approval_state`: existing Titus approval state; no new autonomous state is introduced here.
- `outcome`: safe success, refusal, approval-required, or failure result.

## State and transition rules

```text
received
  -> rejected            (unauthorized principal or unsupported channel)
  -> interactive          (authorized TTS-Internal @Titus message)
  -> memory_pending       (explicit memory request)
  -> action_pending       (explicit action request)
```

`memory_pending` and `action_pending` must resolve through existing Titus
controls. Replay of the same event must not create a second visible response,
memory promotion, or external action.
