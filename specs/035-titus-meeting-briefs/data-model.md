# Data Model: Titus Meeting Briefs

## Active simplified lifecycle

The active worker uses one bounded Titus request and local validation:

```text
transcript discovered -> custody retained -> analysis_pending
  -> completed/email_pending -> pending_review
  -> approved|held -> filed (approval path only)
  -> blocked (screening, Titus transport exhaustion, or invalid output)
```

The active `analysis` object stores only `version`, bounded `attempt`,
`screenedDigest`, `status`, timestamps, and safe error/outcome codes. Session,
run, child, delegation, QA, and cleanup fields remain readable for legacy
state compatibility but are never populated by the simplified path.

## State Boundaries

Feature 035 does not change the version of the existing discovery document. It
remains version 2 so the prior meeting-worker release can read it during
rollback. A disabled-first migration verifies each legacy `TitusOutput` against
its existing digest, copies that original digest to separate Feature 035
provenance, and replaces the body and v2 digest with exactly:

```text
Legacy Feature 034 analysis retired; Meeting Brief v1 required.
```

The fixed sentinel keeps the old version-2 lifecycle validator and rollback
binary usable without retaining the free-form body. The new handoff omits every
output body. A fixture with a unique legacy marker must prove the marker cannot
survive state migration or handoff regeneration.

Feature 035 writes a separate `meeting-brief-state.json` document with version
1. It is keyed by the existing internal artifact reference and contains brief,
custody, Titus analysis-attempt, review, filing, and recording-verification
lifecycle only. Provider
IDs remain solely in the version-2 discovery state and never cross the review
or filing interfaces. A processed transcript with no Feature 035 record is
eligible for the one-time Meeting Brief v1 path.

Migration is crash-safe and idempotent: write the verified original digest and
`migration_pending` record to Feature 035 state first; atomically replace the
v2 body/digest with the sentinel; atomically regenerate the body-free handoff;
then mark migration complete. Every restart validates and resumes from the
first incomplete step. A sentinel without prior Feature 035 provenance is
invalid and blocks activation rather than inventing the original digest.

## RawCustody

| Field | Type | Constraints |
|-------|------|-------------|
| `version` | integer | Exactly `1` |
| `objectName` | string | Generated opaque name; no provider ID or path separator |
| `algorithm` | string | Exactly `AES-256-GCM` |
| `keyId` | string | Non-secret configured identifier, 1..40 safe characters |
| `plaintextSha256` | string | Lowercase 64-hex digest |
| `ciphertextSha256` | string | Lowercase 64-hex digest |
| `plaintextBytes` | integer | `1..1,000,000` |
| `createdAt` | timestamp | UTC RFC3339 |
| `expiresAt` | timestamp | Exactly `createdAt + 168h` |
| `deletedAt` | timestamp/null | Set only after ciphertext removal is verified |
| `status` | enum | `retained`, `deleted`, `delete_retryable`, `blocked` |
| `lastErrorCode` | string/null | Allowlisted safe code only |

The nonce is prepended to ciphertext and authenticated through file format
versioning. Associated data binds custody version, internal meeting reference,
artifact kind, key ID, plaintext digest, and creation timestamp. Plaintext and
screened content are never meeting-processor state fields. During active T057
they exist only in process memory for the SecurityTeam/Titus request; the
parent/delegated-child session language below is historical compatibility
documentation and is not created by the simplified worker. They never enter
general Titus memory or project knowledge.

Configuration contains one active key ID and a map of key ID to 32-byte key.
Rotation adds a new key and makes it active; every old key stays projected until
the last referenced custody object is deleted. Missing active/referenced keys
or any ciphertext present after `expiresAt` puts the whole Feature 035 worker in
failed-closed retention state: deletion sweeps continue, but no new custody,
analysis, email, review, recording, or filing transition starts.

## MeetingBrief

T057 stores the accepted bounded Markdown MVP in `briefMarkdown`; the
canonical JSON payload defined by `contracts/meeting-brief.schema.json` is the
deferred T058+ contract. State wraps either contract with lifecycle metadata:

| Field | Type | Constraints |
|-------|------|-------------|
| `schemaVersion` | string | Exactly `meeting-brief/v1` |
| `reference` | string | `MB-` plus 12 uppercase base32 characters |
| `sourceDigest` | string | Digest of raw transcript; no source text |
| `analysisPromptVersion` | string | Fixed release identifier |
| `legacyAnalysisDigest` | string/null | Verified pre-scrub Feature 034 output digest |
| `brief` | object | Strict schema-valid Meeting Brief v1 when the T058+ JSON contract is active; empty for T057 Markdown |
| `briefMarkdown` | string | Locally validated four-section Markdown for the active T057 MVP; empty for JSON state |
| `briefDigest` | string | SHA-256 of the accepted Markdown or canonical JSON result |
| `projectRoute` | object/null | Exact immutable route snapshot or unknown |
| `reviewStatus` | enum | `analysis_pending`, `email_pending`, `pending_review`, `approved`, `held`, `filing_retryable`, `filed`, `blocked` (legacy lifecycle values remain readable) |
| `analysis` | object/null | Safe single-pass attempt metadata; legacy session fields are not written |
| `email` | object/null | Provider-safe delivery metadata |
| `decision` | object/null | First terminal decision metadata |
| `filing` | object/null | Idempotent result metadata |
| `createdAt` | timestamp | UTC RFC3339 |
| `updatedAt` | timestamp | Monotonic UTC RFC3339 |
| `retryCount` | integer | Bounded `0..8` per stage |
| `lastErrorCode` | string/null | Allowlisted safe code |

## TitusAnalysisAttempt (historical compatibility; not active T057)

The state never stores transcript text, Luna output, Sol reasoning, or full
session messages. The fields below are retained so older state can be inspected
safely; they are not written by active T057. The simplified worker stores only
bounded attempt metadata needed to restart one direct request.

| Field | Type | Constraints |
|-------|------|-------------|
| `version` | integer | Exactly `1` |
| `attempt` | integer | `1..8` infrastructure attempts |
| `sessionId` | string | Deterministic `meeting-` plus safe digest-derived suffix and attempt |
| `runId` | string/null | Hermes `run_` identifier after accepted dispatch |
| `createBodyDigest` | string | Lowercase SHA-256 of the exact deterministic Sessions create body |
| `runBodyDigest` | string/null | Lowercase SHA-256 recorded before the sole Runs submission |
| `childSessionIds` | string array | Zero to two authenticated child IDs whose parent is `sessionId` |
| `childRouteVerified` | boolean | True only after every child reports the approved Titus Luna model |
| `childDraftDigest` | string/null | Canonical digest of the latest verified Luna Meeting Brief result |
| `status` | enum | `dispatch_pending`, `dispatch_unknown`, `luna_running`, `sol_qa_pending`, `qa_remediation`, `qa_passed`, `qa_blocked`, `cleanup_pending`, `cleanup_retryable`, `cleanup_blocked`, `deleted`, `unknown` |
| `delegationCount` | integer | `0..2`; observed from parent tool calls |
| `qaReviewCount` | integer | `0..2`; exact validated envelope count |
| `startedAt` | timestamp | UTC RFC3339 |
| `lastObservedAt` | timestamp | UTC RFC3339, monotonic |
| `completedAt` | timestamp/null | Set only for terminal QA |
| `deletedAt` | timestamp/null | Set only after Sessions API returns not found |
| `outcomeCode` | string/null | Allowlisted terminal QA-block or session-conflict reason retained through cleanup |
| `lastErrorCode` | string/null | Allowlisted content-free code |

The exact `meeting-qa/v1` envelope contains `status`, `meetingReference`,
`attempt`, `sourceDigest`, `draftAttempts`, `qaReviews`, and either a strict
`brief` for `QA_PASS` or an allowlisted `safeReasonCode` for `QA_BLOCKED`.
The three correlation values must equal local immutable state. Pass requires
one or two observed single-child `delegate_task` calls, exact safe arguments,
matching counts, no other parent tool call, verified child-session lineage and
Luna route, and an embedded brief whose canonical digest equals the strict
Meeting Brief parsed from the latest verified child's final assistant result.
A QA envelope is eligible only when it is the latest non-empty parent assistant
result and occurs after the final audited delegation.
A blocked envelope never contains an email-eligible brief.

### Runs and Sessions reconciliation (historical, superseded)

The following compare-and-set lifecycle documents the superseded session-based
design and is retained only for compatibility and audit context. Active T057
uses one direct Titus request and no meeting session, run, or child delegation.

The processor performs one compare-and-set controlled attempt at a time:

1. Persist the deterministic session ID, exact create-body digest, and
   `dispatch_pending` before `POST /api/sessions`.
2. Accept `201`, or accept `409` only when the persisted digest matches and
   authenticated `GET /api/sessions/{id}` confirms the deterministic ID,
   title, source, system-prompt presence, configured Sol route, and no model
   snapshot on the pre-run session. Any conflicting local state is cleanup-only.
3. Persist the exact run-body digest and `dispatch_unknown` before the attempt's
   only `POST /v1/runs`. A successful `202` adds `runId`; a lost response never
   causes a second POST for that attempt.
   A lost session-create response also enters `dispatch_unknown` immediately;
   the processor never repeats that attempt's create POST.
4. Reconcile from authenticated parent messages and bounded child-session list
   pages. Post-run `has_model_config=true` is expected because Hermes persists
   its inherited runtime model snapshot when the run starts; reconciliation
   continues to require the observed parent model to be Sol but does not treat
   that normal snapshot as a request override. An empty or incomplete session
   or unavailable readback is polled until the attempt deadline;
   it is then cleanup-only and retried under the next attempt number.
5. After terminal QA, enumerate one or two children by exact
   `parent_session_id`, retain their IDs, delete the parent, and require
   authenticated `404 session_not_found` for parent and children. Cleanup
   failures retry without email; exhaustion becomes `cleanup_blocked` and
   requires operator action while custody deletion continues independently.

## Brief Content

| Field | Meaning | Bounds |
|-------|---------|--------|
| `title` | Neutral meeting label | 1..120 chars |
| `occurredAt` | Provider-created meeting time | RFC3339 |
| `participants` | Named people/organizations stated in transcript | 0..20 items, 1..100 chars |
| `summary` | Concise internal summary | 1..2,000 chars |
| `facts` | Source-supported facts | 0..20 items, 1..500 chars |
| `decisions` | Decisions explicitly made | 0..20 items, 1..500 chars |
| `actionItems` | Internal work to track | 0..25 structured items |
| `externalCommitments` | Commitments converted to internal tracking | 0..20 structured items |
| `unresolvedQuestions` | Questions requiring follow-up | 0..20 items, 1..500 chars |
| `proposedFollowUp` | Draft/proposal only | 0..2,000 chars |
| `projectHint` | Model hint for allowlist matching | null or 1..100 chars |
| `projectConfidence` | Model confidence, non-authoritative | `unknown`, `low`, `medium`, `high` |

An action item contains `title`, `owner`, optional `dueDate`, `sourceTimestamp`,
and `confidence`. The owner is `gary`, `austin`, or `unassigned`. `dueDate` is
`YYYY-MM-DD` only when explicitly supported by transcript text. External
commitments use the same structure without an owner and are rendered as
internal follow-up tasks.

## ProjectRoute

Project routes are parsed from exact Phase-managed JSON at startup and frozen
for the cycle.

| Field | Type | Constraints |
|-------|------|-------------|
| `canonicalProject` | string | Operator label, 1..80 chars |
| `aliases` | array | Exact normalized aliases, 1..20 unique values |
| `noteDirectory` | string | Relative allowlisted directory under `10-projects/` |
| `kanbanBoard` | string | Exact existing board slug |
| `configDigest` | string | Canonical configuration digest |

Normalization is lowercase, trim, and collapse ASCII whitespace only. No fuzzy
matching. A hint must match exactly one alias and have `high` model confidence;
otherwise the route is unknown. The filer revalidates the submitted route
against its own configuration digest.

## EmailDelivery

| Field | Type | Constraints |
|-------|------|-------------|
| `idempotencyKey` | string | Derived from brief digest and template version |
| `providerMessageIdDigest` | string | Hash only; provider ID never leaves private state |
| `recipientSet` | string | Constant `gary+austin` |
| `templateVersion` | string | Fixed release identifier |
| `sentAt` | timestamp | UTC RFC3339 |
| `readbackVerifiedAt` | timestamp | UTC RFC3339 |

## ReviewDecision

| Field | Type | Constraints |
|-------|------|-------------|
| `decision` | enum | `approve`, `hold` |
| `actor` | enum | `gary`, `austin` |
| `actorFingerprint` | string | HMAC-SHA-256 fingerprint verified before actor derivation |
| `messageDigest` | string | Versioned digest of provider message ID and exact normalized command |
| `receivedAt` | timestamp | From poller, bounded skew |
| `acceptedAt` | timestamp | Worker time |
| `idempotencyKey` | string | Stable provider message digest |

No email body, email address, subject, or provider message identifier is stored
in brief state. The review API does not accept `actor`; the worker derives it by
constant-time comparison of the verified fingerprint against HMAC fingerprints
of its exact configured Gary/Austin addresses.

The poller computes:

```text
messageDigest = SHA256("meeting-review-message/v1\x00" +
                       providerMessageID + "\x00" + normalizedExactCommand)
```

`normalizedExactCommand` is uppercase verb, one ASCII space, and the exact
uppercase reference after trimming outer ASCII whitespace. `receivedAt` is the
staged provider timestamp. The worker rejects a time earlier than the brief's
verified email send or more than five minutes in the future; delayed processing
of an otherwise valid pending decision has no arbitrary age cutoff.

## FilingResult

| Field | Type | Constraints |
|-------|------|-------------|
| `requestDigest` | string | Canonical approved request SHA-256 |
| `noteRelativePath` | string | Safe relative result path |
| `noteDigest` | string | Written Markdown SHA-256 |
| `noteKey` | string | Stable versioned `note` sub-operation key embedded in and read back from the create-only note |
| `board` | string | Exact allowlisted board or `meeting-triage` |
| `triageTaskKey` | string/null | Present only for unknown project |
| `actionTaskKeys` | array | One stable key per action/commitment |
| `filedAt` | timestamp | UTC RFC3339 |

## RecordingVerification

| Field | Type | Constraints |
|-------|------|-------------|
| `version` | integer | Exactly `1` |
| `status` | enum | `pending`, `verified`, `retryable`, `blocked` |
| `sha256` | string/null | Lowercase 64-hex after full stream |
| `bytes` | integer/null | Positive and below configured cap |
| `contentType` | string/null | Exactly `video/mp4` when verified |
| `verifiedAt` | timestamp/null | UTC RFC3339 |
| `retryCount` | integer | `0..8` |
| `lastErrorCode` | string/null | Allowlisted safe code |

No temporary filename or recording content is a state field.

## Canonical Digests and Idempotency

For both private APIs, `Idempotency-Key` is lowercase SHA-256 of the exact UTF-8
request body bytes. The server hashes the bounded body before parsing and
rejects a missing/mismatched key. Identical bytes return the prior result;
different bytes necessarily have a different key, and storage rejects any
impossible key/result collision without mutation.

Review sender proof uses:

```text
actorFingerprint = HMAC-SHA256(reviewSigningKey,
  "meeting-review-actor/v1\x00" + normalizedExactSender)

claimSignature = HMAC-SHA256(reviewSigningKey,
  "meeting-review-claim/v1\x00" + exactRequestBody)
```

The signature is sent in `X-Review-Claim-Signature`; neither the sender address
nor actor enum is sent in the request body. The signed body binds fingerprint,
reference, decision, clean message digest, and received time.

`normalizedExactSender` is the existing email-poller `NormalizeAddress`
contract: one parsed mailbox, lowercased address, exactly one non-empty local
and domain part, no CR/LF, and no consecutive dots. The clean claim returns the
already-stored authorized staging sender to the poller for this derivation; the
sender is not copied into Feature 035 state or telemetry.

Filing sub-operation keys use unambiguous versioned NUL-delimited inputs:

```text
SHA256("meeting-filing-item/v1\x00" + reference + "\x00" +
       briefDigest + "\x00" + kind + "\x00" + zeroPaddedIndex)
```

`kind` is exactly `note`, `triage`, `action`, or `commitment`; index is six
decimal digits and is `000000` for note and triage. The note key is embedded in
the deterministic create-only Markdown and returned for exact caller readback.

## Deterministic Semantic Validation

For T058+ JSON state, JSON Schema format validation is mandatory, not
annotation-only. The active T057 Markdown validator separately enforces the
required four headings, bounded output, valid UTF-8, protected-value and
credential-marker exclusion, and no provider identifiers. Both paths also
apply the following semantic safeguards:

- requires semantic RFC3339/date parsing and VTT timestamp components with
  minutes/seconds `00..59`;
- requires valid UTF-8 and NFC normalization;
- rejects NUL, C0/C1 controls except LF/TAB in the two multiline fields, bidi
  override/isolate controls, raw HTML tags, and strings that become empty after
  normalization;
- rejects case-insensitive exact protected values and protected substrings for
  organizer/tenant/meeting/artifact IDs, Graph origins/routes, configured
  internal email addresses, and credential-like markers already enforced by
  Feature 034;
- escapes Markdown metacharacters and renders all transcript-derived text only
  below explicit `Source-derived` or `Draft proposal - not performed` labels;
- never interprets string content as a recipient, path, board, command, status,
  or evidence that Titus performed an action.

Instruction-like phrasing is treated as untrusted quoted data rather than
executed or reinterpreted. It is rejected only when it violates the concrete
rules above; prompt-text pattern matching is not treated as a security control.

## Historical Sol/Luna state transitions (superseded)

The following diagram documents the retired implementation for rollback
context only; it is not an active Feature 035 lifecycle.

```text
transcript processed/no brief
        |
        v
custody retained -> analysis_pending -> luna_running -> sol_qa_pending
                                                       |          |
                                                       |          +-> qa_remediation
                                                       |                    |
                                                       |                    +-> sol_qa_pending
                                                       v
                                                  cleanup_pending
                                                   |          +-> cleanup_retryable
                                                   |                    |
                                                   |                    +-> cleanup_blocked
                                                   |                         (no email/filing)
                                                   |
                                                   +-> blocked (QA_BLOCKED, cleanup verified)
                                                   v
                                              email_pending (QA_PASS, cleanup verified)
                                                   |
                                                   v
                                             pending_review
                                                                  |       |
                                                                  |       +-> held
                                                                  v
                                                              approved -> filing_retryable -> filed

running --(Titus restart/deadline/ambiguity)--> unknown -> cleanup_pending -> analysis_pending

custody retained -> retained --(168h sweep)--> deleted

recording pending -> verified
                 -> retryable -> pending
                 -> blocked
```

Every transition is compare-and-set against the current lifecycle and request
digest. A prior terminal state is never replaced by a retry result.

Rollback removes both Feature 035 activation markers and stops new meeting
runs plus the filer. The prior worker reads the still-version-2 discovery state (with legacy
output replaced by its validator-compatible safe sentinel). Feature 035 state
and ciphertext remain untouched and are read-only until the Feature 035 release
is restored; a root-owned retention-only sweep remains available so rollback
never extends the seven-day deadline.
