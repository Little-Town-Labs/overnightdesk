# Research: Titus Meeting Briefs

## Decision: Keep organizer polling for ordinary meetings

**Decision**: Continue the existing organizer-scoped Graph delta worker for
Gary/Austin meetings. Do not add webhooks to the same slice.

**Rationale**: The deployed worker already proves organizer access, cursors,
metadata deduplication, and content retrieval. A subscription receiver adds
public ingress, lifecycle renewal, validation tokens, client-state custody, and
new failure modes without improving correctness for the current low meeting
volume.

**Official source**: Microsoft documents organizer-wide transcript and
recording delta APIs, but `getAllRecordings` does not support channel meetings:
https://learn.microsoft.com/en-us/graph/api/onlinemeeting-getallrecordings?view=graph-rest-1.0

**Rejected**:

- Replace polling with webhooks now. Rejected as unrelated production ingress.
- Treat Austin's zero artifacts as access failure. Rejected because the Gary-
  only pilot correctly yields no Austin-organized artifacts.

## Decision: Track channel meetings as a separate bot feature

**Decision**: Record a follow-on feature for a separately credentialed Teams
channel bot and channel-meeting subscription design.

**Rationale**: Microsoft meeting apps require `team` scope for channel meetings
and `groupchat` for other meeting chats. This is a distinct installation,
consent, identity, and event-discovery boundary from organizer-scoped Graph
polling.

**Official sources**:

- Meeting chat scopes: https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/build-extensible-conversation-for-meeting-chat
- Transcript/recording notifications: https://learn.microsoft.com/en-us/graph/teams-changenotifications-callrecording-and-calltranscript
- Subscription lifecycle: https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0

**Operational note**: Teams subscriptions have short lifetimes and lifecycle
requirements; channel/private-channel coverage and real activity IDs must be
qualified independently. The central Microsoft page now says the relevant
Teams APIs no longer require metered billing configuration after 2025-08-25:
https://learn.microsoft.com/en-us/graph/metered-api-list

## Decision: Stream and discard recording content

**Decision**: Retrieve the associated Graph recording as a bounded constant-
memory stream, validate `video/mp4`, hash it, correlate it, and discard it.

**Rationale**: Recording retrieval proves custody and future availability, but
the approved business workflow uses the transcript. Persisting or sending
audio/video to a model would add high-volume sensitive storage and a new media-
analysis purpose that has not been approved.

**Official source**: The Graph recording content endpoint returns `video/mp4`
for supported meetings:
https://learn.microsoft.com/en-us/graph/api/callrecording-get?view=graph-rest-1.0

**Rejected**:

- Store MP4 for seven days. Rejected because the user selected transcript
  retention, not media retention.
- Analyze the recording with Titus. Rejected because there is no defined use or
  result contract for audio/video analysis.

## Decision: Encrypt raw transcript for exactly seven days

**Decision**: Store the downloaded raw VTT only as AES-256-GCM ciphertext on a
dedicated volume, with a unique nonce and versioned associated data. Delete it
after 168 hours.

**Rationale**: This implements the user's explicit seven-day retention choice
while preserving the constitution's data-minimization and recoverability
requirements. The state document stores only digest, object name, algorithm
version, timestamps, and deletion status.

**Rejected**:

- Continue Feature 034 zero retention. Rejected because it contradicts the new
  explicit retention requirement.
- Put base64 ciphertext in the state JSON. Rejected because it expands backups,
  state diffs, memory use, and accidental handling surface.
- Rely only on filesystem permissions. Rejected because a copied volume or
  backup would contain readable transcript text.

## Decision: Keep Feature 035 state separate and scrub legacy output

**Decision**: Keep the organizer discovery state at version 2, replace the
legacy free-form Titus output body with a fixed safe sentinel after verifying
and separately preserving its original digest, remove output bodies from new
handoff generation, and store Feature 035 lifecycle in a separate version-1
document.

**Rationale**: The prior binary can still read the discovery document during
rollback, because the sentinel satisfies the old processed-output validator.
The new workflow does not retain an unbounded output whose absence of transcript
excerpts cannot be proven from source alone. The original digest preserves
provenance without the body.

**Rejected**:

- Add Feature 035 fields directly to a state-v3 discovery document. Rejected
  because the rollback binary rejects version 3.
- Preserve the prior Markdown result unchanged. Rejected because a disabled-
  first migration cannot prove it contains no transcript excerpt without
  inspecting sensitive production content.

## Historical decision: Let Titus orchestrate Luna drafting and Sol QA

This decision was implemented in Phase 7 and is superseded by the single-pass
decision below after the failed Gary canary.

**Decision**: Use the existing authenticated Titus API. The worker creates a
deterministic dedicated meeting session and starts a Hermes Run without a
request-scoped model override. Sol delegates the first draft to the configured
Luna child, evaluates the returned draft, permits at most one Luna remediation
and one Sol delta review, and emits an exact `meeting-qa/v1` envelope. The
worker independently validates the envelope, observed tool calls, and embedded
Meeting Brief before email becomes eligible.

**Rationale**: This matches the owner's intended Titus responsibility and lets
Sol use Titus's existing project knowledge while Luna does the long transcript
work in a background child. The Runs/Sessions surface supports detached result
delivery and recovery; stateless `/v1/chat/completions` cannot reliably deliver
a background child result later. Feature 035 adds no model, provider, OAuth, or
analyzer lifecycle.

**Official sources**:

- Hermes API server behavior: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/
- Hermes delegation behavior: https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation/

Pinned Hermes v0.19.1 source confirms:

- `POST /v1/runs` binds the supplied `session_id`, returns a pollable `run_id`,
  and enables a detached delegation wake target;
- a top-level run may complete after dispatch while the child result returns
  later through the owning session, so final QA is reconciled from session
  messages rather than the first run's terminal status;
- a running child is not resumed after process restart and becomes unknown;
- deleting a parent session cascade-deletes delegated child session rows;
- child sessions are discoverable through the authenticated session list with
  `parent_session_id` and observed model, so the processor can prove lineage
  and the already-configured Luna route without selecting a model in a request;
- Hermes constructs a non-empty runtime model snapshot and upserts it into the
  session when a run starts, so `has_model_config` normally changes from false
  on the pre-run session to true afterward. Pre-run creation rejects an existing
  snapshot, while post-run reconciliation verifies the observed Sol route and
  accepts the inherited runtime snapshot;
- delegation kickoff logs retain only a bounded 500-character context preview,
  so the fixed safe prefix is at least 512 bytes before transcript content.

**Rejected**:

- Keep the separate analyzer sidecar. Rejected because it bypasses Titus's
  knowledge and introduces a second model/provider/OAuth lifecycle.
- Use stateless chat completion. Rejected because detached delegation cannot be
  reconciled reliably from a stateless response.
- Run all transcript processing synchronously in primary Sol. Rejected because
  it occupies the main reasoning turn and misses the requested Luna/Sol split.

**Security boundary**: prompt text does not grant authority. The processor never
resolves tool approvals for a meeting run, audits the parent session so only one
or two exact single-leaf `delegate_task` calls are accepted, discovers their
child sessions by parent lineage, and verifies the observed approved Luna route.
The latest child result must itself parse as Meeting Brief v1 and have the same
canonical digest as Sol's `QA_PASS` brief; the envelope's meeting reference,
attempt, and source digest must equal local state. The fixed ASCII safe context
prefix prevents raw VTT from entering Hermes's bounded live-log kickoff preview.
The dedicated parent and enumerated children are deleted and verified after
terminal QA, while encrypted custody remains for the seven-day contract.

## Decision: Use a single-pass Titus brief request

**Decision**: Replace the nested Sol/Luna session workflow with one bounded,
stateless Titus chat-completion request and a local strict Meeting Brief v1
validator. Do not create a meeting session, delegate a child, emit a QA
envelope, or perform session cleanup.

**Rationale**: The Gary canary reached Titus but Luna repeatedly returned a
legacy shape despite exact prompt templates. The nested design added deterministic
session IDs, retry identity, child lineage, asynchronous reconciliation, QA
envelopes, and deletion proofs without making model output reliable. The local
validator is the real trust boundary and already rejects malformed or unsafe
briefs. A single request keeps Titus as the interpreter while making the worker
state and failure behavior understandable.

**Accepted trade-off**: The draft is produced synchronously through Titus's
private API instead of a background Luna child. The meeting volume is low, the
request is bounded, and the worker remains isolated from Titus's interactive
conversation. If future latency or throughput requires delegation, it should be
introduced as a separately measured feature rather than embedded in the basic
meeting path.

**Rejected**:

- Keep adding prompt templates or legacy-key bans. Rejected because prompts are
  advisory and the canary proved they do not enforce a schema.
- Add a local legacy-to-v1 translator. Rejected because it would guess field
  semantics and move interpretation authority into brittle compatibility code.
- Retry model output until it matches. Rejected because it creates duplicate
  work and hides a contract failure; invalid output blocks safely.

## Deferred T058 design: Strict JSON first, deterministic rendering second

**Deferred decision**: Require Meeting Brief v1 JSON with `additionalProperties: false`,
bounded arrays/strings, fixed owner enums, RFC3339 source timestamps, and date-
only due dates. Render email and Markdown from validated values in code.

This remains the target for T058 structured routing and filing. It is not the
active T057 production contract; T057 uses the bounded four-section Markdown
MVP documented in `spec.md` and `delivery.md`.

**Rationale**: Free-form Markdown is difficult to validate and permits model
text to smuggle paths, recipients, or action claims. A strict schema makes the
untrusted/approved boundary testable.

**Rejected**:

- Accept current bounded Titus Markdown. Rejected because it cannot reliably
  drive project routing and one-task-per-action filing.
- Let the model compose the outbound email. Rejected because recipients and
  approval instructions are deterministic policy.

## Decision: Automatic internal email is a narrow standing authorization

**Decision**: Permit only the Meeting Brief template to send automatically to
the exact configured Gary and Austin addresses, after SecurityTeam outbound
screening and provider idempotency/readback. Keep the ordinary Titus guarded-
email approval flow unchanged.

**Rationale**: The user explicitly approved automatic internal delivery and
states that Titus is already provider-restricted from sending elsewhere. A
separate code path makes that standing authorization narrow and auditable.

**Official sources**:

- AgentMail send endpoint: https://docs.agentmail.to/api-reference/inboxes/messages/send?explorer=true
- AgentMail scoped API keys: https://docs.agentmail.to/api-reference/api-keys/create
- AgentMail inbox send allowlists: https://docs.agentmail.to/api-reference/inboxes/lists/get

**Rejected**:

- Auto-approve through the general guarded-email tool. Rejected because it
  weakens the approval invariant for all other Titus messages.
- Attach the transcript. Rejected by the raw-custody and recipient-minimization
  requirements.

## Decision: Parse approval after the clean email claim

**Decision**: Extend the email poller after `claimClean` and before Hermes
submission. An exact command goes to the meeting worker's authenticated private
review endpoint and does not create a Hermes run.

**Rationale**: This reuses exact sender controls, dirty landing, SecurityTeam,
provider reply, and poller idempotency. Parsing before SecurityTeam would bypass
the established untrusted-email boundary; sending the command to Hermes would
make a deterministic state transition model-mediated.

**Rejected**:

- Let Titus interpret natural-language approval. Rejected because approval must
  be exact, deterministic, and replay-safe.
- Poll AgentMail independently in the meeting worker. Rejected because it would
  duplicate message claiming and race the existing poller.

The poller maps the exact sender to a versioned HMAC fingerprint and signs the
exact clean decision body. The worker verifies the signature and derives the
actor by constant-time comparison; the request cannot select `gary` or `austin`
as a free field. No email address is persisted in Feature 035 state.

## Decision: Bind retries to exact request bytes

**Decision**: Private API idempotency keys are SHA-256 of the exact transmitted
body bytes. Filing sub-operations use committed versioned NUL-delimited keys.

**Rationale**: The server can validate the key before parsing, identical retry
bytes map to the prior result, and same-key/different-payload behavior is
impossible without a hash collision and still fails closed in storage.

## Decision: Use a private deterministic filer

**Decision**: Add a single-purpose filer service that receives only approved
Meeting Brief v1 payloads over bearer-authenticated private HTTP. It owns the
project-knowledge and Hermes-data mounts, writes create-only Markdown, and uses
the supported `hermes kanban` CLI with idempotency keys.

**Rationale**: Hermes Kanban is durable SQLite with multi-board support, but its
dashboard plugin routes are intentionally designed for localhost and are not a
suitable sensitive mutation boundary. The filer can enforce exact paths,
boards, schema, and replay behavior without Graph/model/email credentials.

**Official source**: Hermes Kanban CLI and storage behavior:
https://github.com/nousresearch/hermes-agent/blob/main/website/docs/user-guide/features/kanban.md

**Rejected**:

- Call the dashboard plugin directly. Rejected because the plugin route is not
  the authentication boundary for sensitive mutation.
- Mount both writable volumes into the meeting worker. Rejected because it
  collapses untrusted content ingestion and durable business-record authority.
- Use Linear for these tasks. Rejected because the user chose Titus Kanban for
  internal coordination; Linear remains technical delivery only.

## Decision: Route unknown work to `meeting-triage`

**Decision**: Add a dedicated Titus Kanban board `meeting-triage`. Identified
projects use exact Phase-configured routes; unmatched meetings create one
triage card and their action items on that board.

**Rationale**: This makes unidentified work visible without silently selecting
the current board or mixing it into an unrelated default board. It also avoids
creating a project from untrusted model output.

**Rejected**:

- Use whichever board is current. Rejected because current board is mutable
  operator UI state, not policy.
- Create a new project automatically. Rejected because model output has no
  authority to establish customer/project records.
