# Teams Channel Routing Contract

## Purpose

Define the boundary between Microsoft Teams activity and Titus's normal
interactive pipeline for the `TTS-Internal` MVP.

## Inbound acceptance

An activity is eligible for Titus processing only when all of these checks pass:

1. The Teams request is authenticated by the configured bot boundary.
2. The sender matches one of the independently allowlisted Gary or Austin
   identities.
3. The exact Team identity matches the approved containing Team.
4. The exact channel identity matches `TTS-Internal`.
5. The event is not a duplicate or replay that has already completed.

The display names `Gary`, `Austin`, `TTS`, and `TTS-Internal` are verification
labels only. Authorization uses stable provider identities.

## Routing behavior

| Message class | Context | Visible reply | Tools/actions | Durable memory |
|---|---:|---:|---:|---:|
| Authorized ordinary `TTS-Internal` message | No | No | No | No |
| Authorized `@Titus` message | Yes | Yes or safe refusal | Only through existing approval | Only when explicitly requested |
| Unauthorized sender | No | No | No | No |
| Separate project-channel message | No | No | No | No |
| Invalid or ambiguous policy | No | No | No | No |

## Content handling

- All message content is untrusted input and may contain prompt injection,
  credentials, or instructions for another person or system.
- Ordinary non-mentioned messages are ignored for this MVP and cannot create
  context, trigger inference, or authorize an action.
- Project content in an explicit `@Titus` request is conversational input, not
  authoritative project data and not permission to read the related project channel.
- Files and attachments are not part of this contract.
- Meeting transcripts, recordings, Graph notifications, and channel-meeting
  actions are not part of this contract.

## Output and approval

- A visible response must remain in the originating `TTS-Internal` conversation
  unless a separately approved action contract says otherwise.
- Any external or high-impact action uses the existing Titus approval surface.
- A refusal must be safe and must not disclose hidden channel, user, or
  credential details.

## Safe operational evidence

Operational evidence may include only safe event type, stage, outcome, bounded
duration, aggregate counts, and a non-sensitive correlation reference. It must
not include message bodies, credentials, access tokens, meeting URLs, protected
identifiers, or excluded-channel content.
