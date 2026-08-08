# Titus TTS-Internal channel MVP

This runbook covers the active first Teams interaction slice. It records the
production boundary and verification evidence; it does not authorize a new
activation or widen the scope by itself.

## Boundary

- One exact Team and one exact channel: `TTS-Internal`.
- Gary and Austin's Entra object IDs are the only allowed senders.
- Titus processes only provider-authenticated `@Titus` mentions.
- Ordinary non-mentioned messages are ignored before Titus reasoning, memory,
  tools, actions, or visible output.
- Project channels, attachments, passive reading, all-message RSC, and meeting
  artifact processing are out of scope.
- The conversational `TEAMS_*` identity remains separate from the meeting
  processor's `MSGRAPH_*` identity.
- The Bot Framework endpoint is `https://titus-dashboard.overnightdesk.com/api/messages`;
  the Titus container publishes no host port.

## Qualification matrix

| Case | Expected result |
| --- | --- |
| Gary mentions Titus in `TTS-Internal` | Reply or safe refusal in the same conversation |
| Austin mentions Titus in `TTS-Internal` | Reply or safe refusal in the same conversation |
| Gary or Austin posts without mentioning Titus | Ignored; no inference or reply |
| Unauthorized user mentions Titus | Ignored; no processing or reply |
| Mention from another channel | Ignored; no processing or reply |
| Explicit memory request | Existing memory boundary applies; at most one promotion |
| Guarded action request | Existing Titus approval remains required |

## Native memory behavior

Explicit memory requests use Hermes's existing memory capability. The request
must identify the selected fact to retain; Titus should attach
`Teams/TTS-Internal` source context and must not retain an unbounded channel
transcript. Ordinary, unauthorized, or out-of-channel messages cannot invoke
memory because the adapter rejects them before Hermes processing. No separate
Teams memory database, queue, MCP server, or channel store is part of this MVP.

Memory correction or removal uses the existing Hermes memory controls and is
handled as an explicit operator request; rollback does not delete the Titus
runtime or memory volume.

## Stop conditions

Stop qualification if exact Team/channel IDs or allowed user IDs are missing,
ambiguous, wildcarded, or printed in evidence; if ordinary messages reach
Titus reasoning; if another channel is accepted; or if credentials or message
content appear in logs.

## Rollback

Disable the Teams route or remove the active Teams configuration through the
reviewed Aegis workflow, then restart only `hermes-titus.service`. Do not delete
Phase values, Teams app registrations, or Titus data volumes as part of
rollback. Standalone Titus, Matrix, and meeting discovery must remain healthy.
