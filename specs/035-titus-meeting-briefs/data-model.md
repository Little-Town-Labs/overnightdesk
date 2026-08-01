# Data Model: Titus Meeting Briefs

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
custody, review, filing, and recording-verification lifecycle only. Provider
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
screened content are never state fields.

Configuration contains one active key ID and a map of key ID to 32-byte key.
Rotation adds a new key and makes it active; every old key stays projected until
the last referenced custody object is deleted. Missing active/referenced keys
or any ciphertext present after `expiresAt` puts the whole Feature 035 worker in
failed-closed retention state: deletion sweeps continue, but no new custody,
analysis, email, review, recording, or filing transition starts.

## MeetingBrief

The canonical payload is defined by
`contracts/meeting-brief.schema.json`. State wraps it with lifecycle metadata:

| Field | Type | Constraints |
|-------|------|-------------|
| `schemaVersion` | string | Exactly `meeting-brief/v1` |
| `reference` | string | `MB-` plus 12 uppercase base32 characters |
| `sourceDigest` | string | Digest of raw transcript; no source text |
| `analysisPromptVersion` | string | Fixed release identifier |
| `legacyAnalysisDigest` | string/null | Verified pre-scrub Feature 034 output digest |
| `brief` | object | Strict schema-valid Meeting Brief v1 |
| `briefDigest` | string | Canonical JSON SHA-256 |
| `projectRoute` | object/null | Exact immutable route snapshot or unknown |
| `reviewStatus` | enum | `draft`, `email_pending`, `pending_review`, `approved`, `held`, `filing_retryable`, `filed`, `blocked` |
| `email` | object/null | Provider-safe delivery metadata |
| `decision` | object/null | First terminal decision metadata |
| `filing` | object/null | Idempotent result metadata |
| `createdAt` | timestamp | UTC RFC3339 |
| `updatedAt` | timestamp | Monotonic UTC RFC3339 |
| `retryCount` | integer | Bounded `0..8` per stage |
| `lastErrorCode` | string/null | Allowlisted safe code |

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

JSON Schema format validation is mandatory, not annotation-only. Code also:

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

## State Transitions

```text
transcript processed/no brief
        |
        v
custody retained -> analyzed -> email_pending -> pending_review
                                             |          |
                                             |          +-> held
                                             v
                                          approved -> filing_retryable -> filed

custody retained -> retained --(168h sweep)--> deleted

recording pending -> verified
                 -> retryable -> pending
                 -> blocked
```

Every transition is compare-and-set against the current lifecycle and request
digest. A prior terminal state is never replaced by a retry result.

Rollback removes both Feature 035 activation markers and stops the analyzer and
filer. The prior worker reads the still-version-2 discovery state (with legacy
output replaced by its validator-compatible safe sentinel). Feature 035 state
and ciphertext remain untouched and are read-only until the Feature 035 release
is restored; a root-owned retention-only sweep remains available so rollback
never extends the seven-day deadline.
