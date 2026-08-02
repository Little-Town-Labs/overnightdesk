# Quickstart: Titus Meeting Briefs

This is the implementation and production-qualification runbook for Feature
035. It must be executed in order. Never print Phase values, raw transcript,
brief bodies, email addresses, provider IDs, or recording bytes as evidence.

## 1. Local prerequisites

```bash
cd tenants/hermes-titus/meeting-processor
go test ./...
go test -race ./...
go vet ./...
go build ./cmd/titus-meeting-processor

cd ../email-poller
go test ./...
go test -race ./...
go vet ./...
go build ./cmd/titus-email-poller

cd ../meeting-filer
go test ./...
go test -race ./...
go vet ./...
go build ./cmd/titus-meeting-filer
```

Run repository qualification from the repository root:

```bash
tenants/hermes-titus/meeting-processor/scripts/qualify.sh
tenants/hermes-titus/email-poller/scripts/qualify.sh
tenants/hermes-titus/meeting-filer/scripts/qualify.sh
git diff --check
```

## 2. Required private configuration

Keep the existing Graph values in `/agents/hermes-titus/teamsmeetings`. Add the
Feature 035 values to `/agents/hermes-titus/meetingbriefs`:

- `MEETING_RAW_CUSTODY_KEYS_JSON` - active non-secret key ID plus a map of
  base64-encoded 32-byte keys; old referenced keys remain until expiry;
- `MEETING_REVIEW_API_TOKEN` - poller-to-worker bearer;
- `MEETING_REVIEW_SIGNING_SECRET` - distinct HMAC key for sender-bound claims;
- `MEETING_FILER_API_TOKEN` - worker-to-filer bearer;
- `MEETING_GARY_EMAIL` and `MEETING_AUSTIN_EMAIL` - fixed exact recipients;
- `MEETING_PROJECT_ROUTES_JSON` - exact aliases, note directories, and boards;

Reuse the existing SecurityTeam, AgentMail, and private Titus API credentials
from their current Phase paths through exact allowlisted projections. Titus's
active primary and delegation configuration selects Sol and Luna; Feature 035
must not add or project a model, provider key, OAuth identity, or analyzer key.
Do not copy values between paths or into repository files.

Verify key presence, format, active/referenced key IDs, and equality/inequality
relationships only. Never show literal values. The review/filer API tokens,
custody keys, and review signing secret must all differ. The worker's Titus API
key is an existing credential, not a new Feature 035 secret.

## 3. Local security qualification

The harness must prove:

- AES-GCM round-trip, nonce uniqueness, AAD mismatch rejection, atomic write,
  mode 0600, no plaintext-on-disk, exact 168-hour deletion, key rotation, old-
  key retention, missing-key failure, overdue fail-closed, and delete retry;
- legacy unique-marker output is replaced by the exact safe sentinel in
  version-2 state, its original digest is retained only in separate Feature 035
  provenance, handoff output bodies are removed, and the prior release can
  still read the discovery document across every simulated crash boundary;
- strict Meeting Brief schema, unknown-field rejection, array/string caps,
  owner/date/timestamp rules, project exact-match behavior, and protected-value
  rejection;
- Titus orchestration persists exact create/run body digests, creates or safely
  reconciles one deterministic dedicated session, submits at most one Runs API
  turn per attempt without a model override, and never resubmits an ambiguous
  dispatch;
- the audit observes one or two exact single-leaf `delegate_task` calls only,
  rejects every other parent tool call, discovers the corresponding child
  sessions by parent lineage, proves their observed route is the configured
  Luna model, and binds the strict `meeting-qa/v1` meeting/attempt/source plus
  embedded brief to the latest child's canonical Meeting Brief;
- Luna's delegated context begins with at least 512 bytes of fixed ASCII safe text
  before VTT content, and fixtures prove Hermes's 500-character kickoff preview
  contains no transcript marker for ASCII or multibyte transcript input;
- restart, deadline, missing-run, QA reject/remediation, cleanup failure, and
  duplicate-dispatch fixtures fail closed with no early or duplicate email;
- terminal cleanup enumerates child IDs before parent deletion and requires
  authenticated `404 session_not_found` for parent and children; cleanup
  exhaustion is operator-blocked with custody deletion still active;
- outbound mail uses exactly two recipients, no CC/BCC/attachment, SecurityTeam
  first, idempotency, readback, and no ordinary guarded-email bypass;
- review parsing accepts only one exact command from an exact allowed sender
  after a clean claim, signs the sender fingerprint/body, derives the actor at
  the worker, and performs zero Hermes submissions;
- filer bearer authentication, strict schema, route digest, traversal/symlink/
  overwrite rejection, create-only note, board allowlist, supported Kanban CLI,
  and idempotent replay;
- recording retrieval is constant-memory, no-redirect, bounded MP4 streaming
  with zero surviving bytes;
- logs, health, handoff, state, and command output contain no protected content.

## 4. Disabled-first production preparation

Use the `aegis-ssh` workflow. Prepare immutable ARM64 release trees and images,
project exact Phase subsets into mode-0600 runtime files, create the dedicated
encrypted custody volume and `meeting-triage` board, and install all units with
both Feature 035 activation markers absent.

Disabled verification must prove:

- existing meeting metadata and Feature 034 state remain healthy;
- discovery state remains version 2, legacy bodies are replaced by the exact
  sentinel, the body-free handoff contains no marker, and the prior worker can
  read the disabled migrated state;
- filer has no published port;
- no analyzer model/API-key Phase values, config, unit, image, or running
  container are required; the old analyzer unit/container are stopped but
  retained rollback volume/state is not deleted;
- main Titus remains healthy on its existing subscription, primary Sol route,
  and Luna delegation route;
- filer has the active project-knowledge volume, its private ledger, and only
  the named-board Kanban subtree from Titus storage plus its one bearer;
- meeting worker has custody volume but not project-knowledge/Hermes-data;
- email poller has no filer token and cannot write notes/Kanban directly;
- Titus chat, Teams chat, Matrix, email intake, Kanban, project knowledge,
  SecurityTeam, Nginx, and Ops remain healthy.

Execute the reviewed disabled-first order from the repository root:

```bash
cd tenants/hermes-titus/meeting-processor
scripts/deploy-aegis.sh install-feature-035-disabled
../email-poller/scripts/deploy-aegis.sh install
scripts/deploy-aegis.sh verify-feature-035-disabled
```

After local qualification, the unified action removes only the brief and filing
markers, stops the filer and any retired analyzer unit, and reloads the active processor and Titus
intake route without Feature 035 credentials before the first remote runtime
promotion. It preserves the Feature 034 content marker, initializes the filer
while inactive, creates and verifies the exact `00-inbox/meetings` destination,
and never deletes state or named volumes.

## 5. Enable draft generation and run Gary canary

Create only the root-owned brief-processing marker, restart only the meeting
worker, and run one bounded cycle. Do not restart or reconfigure Titus unless
the live capability/model verification itself fails.

Safe acceptance evidence:

- one `meeting-brief/v1` digest and one `pending_review` reference;
- one recipient-set value `gary+austin` and provider readback success;
- encrypted raw-custody object exists mode 0600 with ciphertext/plaintext
  digests that differ;
- one dedicated meeting session, one Luna draft, one Sol QA, zero
  non-delegation parent tool calls, and an exact `QA_PASS` before email;
- the dedicated parent and delegated child sessions are deleted and return
  not-found after terminal QA; only encrypted custody retains raw VTT;
- recording status `verified` with digest and byte count only;
- no duplicate model, email, transcript, or recording operation after restart;
- no raw excerpts or protected identifiers in logs, state views, health,
  handoff, Docker inspect, email metadata evidence, or command output.

The user receives the actual draft through AgentMail. Do not paste its contents
into issue comments or deployment logs.

## 6. Enable approval filing

Create the separate root-owned filing marker and restart only the meeting
worker and filer. The Titus poller already received its bounded review
projection when brief processing was enabled. Gary can reply with:

```bash
cd tenants/hermes-titus/meeting-filer
scripts/deploy-aegis.sh initialize
scripts/deploy-aegis.sh enable
scripts/deploy-aegis.sh verify
```

```text
APPROVE MB-XXXXXXXXXXXX
```

or:

```text
HOLD MB-XXXXXXXXXXXX
```

The first accepted terminal command wins. For approval, safe verification must
prove one create-only note path, expected board, expected task count,
idempotency keys, and no external action. Inspect content only through the
owner's normal authenticated Titus surfaces; operational evidence uses digests
and counts.

## 7. Retention qualification

Use a disposable local clock/volume fixture to prove exact 168-hour deletion.
In production, verify the next sweep reports no overdue custody object. Do not
alter the production clock. If the canary has not aged seven days, leave T for
the real-time observation open or use only the deterministic local acceptance
for the algorithm while monitoring the live expiry timestamp.

Induce a disposable deletion failure and missing-key condition. Each must set
failed health, stop all new meeting transitions, continue the retention sweep,
and emit exactly one allowlisted actionable error code. Restore the key or
filesystem, rerun the sweep, and prove health clears only after no overdue
object remains.

## 8. Rollback

Run the exact coordinated order:

```bash
cd tenants/hermes-titus/meeting-filer
scripts/deploy-aegis.sh disable
scripts/deploy-aegis.sh rollback

cd ../meeting-processor
scripts/deploy-aegis.sh disable-brief
scripts/deploy-aegis.sh retention-sweep
scripts/deploy-aegis.sh verify-feature-035-disabled
```

1. The filer disable removes filing authority and reloads the worker.
2. Brief disable removes both Feature 035 markers, stops the filer and any
   retired analyzer unit,
   and reloads the worker and Titus intake route without meeting-review values.
3. Preserve separate Feature 035 state and encrypted custody; run the root-owned
   retention-only sweep until the Feature 035 release is restored.
4. Start the prior worker against the still-version-2 discovery document and
   prove it reads the sentinel state without a down-migration.
5. Prove organizer metadata polling and all unrelated Titus channels remain
   healthy.
6. Re-enable from the exact immutable release only after the cause is resolved.

Rollback never retracts an already created note or task. Create-only filing is
intentional; corrections use a new reviewed note/task update outside this
automatic path.

## 9. Closeout

- Append the production record to suite-root `deploys.log`.
- Synchronize `overnightdesk-platform-standard` in its own branch/PR/deploy.
- Update `.specify/roadmap.md`, the Titus meeting runbook, and issue 159 with
  safe evidence.
- Open the separately scoped channel-bot/subscription feature or GitHub issue.
- Close issue 159 only when its organizer transcript, review, filing, and
  recording-custody outcomes are met; do not imply channel meetings are done.
