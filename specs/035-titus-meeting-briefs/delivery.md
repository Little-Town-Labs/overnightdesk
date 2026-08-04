# Delivery Profile: 035-titus-meeting-briefs

## Classification

- Project: `overnightdesk-feature-035-p2-followup`
- Context: `brownfield`
- Scale: `system`
- Risk: `production`
- Mode: `readonly-delegation`
- Spec Kit required: `yes`
- Mutation owner: `sol-lead`

## Model Routing

- Planning and orchestration: `codex-sol`
- Implementation: `lead-only`
- Final quality gate: `codex-sol`
- Automated remediation ceiling: one Luna remediation and one Sol delta review

## Codebase Graph

- Policy: `required-before-planning`
- Project: `home-frosted639-src-overnightdesk-suite-overnightdesk-worktrees-codex-feature-035-p2-followup`
- Status: `ready`

- get_architecture identified the hermes-titus worker boundary and 24,632 graph edges.
- search_code located both blocked-record recording predicates in `internal/worker/meeting_briefs.go`.
- trace_path confirmed `RunOnce -> processMeetingBriefs -> processOneRecording -> VerifyRecordingContent`.

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| sol-quality-gate | T085 | no | codex-luna read-only | none | Focused Go tests, `git diff --check`, and exact source/spec evidence |

Ringer `readonly.manifest.json` and `quality-gate.manifest.json` both linted
cleanly and dry-ran without mutation. Execution was attempted with the
configured Luna lane; both attempts stopped before a report because the local
Codex transport could not reach `chatgpt.com` through the proxy (HTTP 403 for
WebSocket/HTTPS). No repository, Git, or production state was changed by the
failed attempts.

## Execution Evidence

- The initial Codex assessment confirmed two P2 findings in merged PR 194: a
  terminal email rejection suppressed independent recording verification, and
  qualification had been aligned to Markdown while the active spec still
  required JSON.
- The RED regression reproduced the first finding: a permanent
  `meeting_email_rejected` left `recording` unset. The GREEN correction makes
  recording verification skip only its own terminal states and proves one
  verification plus zero replay on the next cycle.
- Codebase-memory indexing was refreshed for this correction worktree; graph
  status is `ready` with architecture, search, and trace evidence above.

## Retained-custody canary correction

- The first post-merge Gary canary reached the persisted `dispatching` boundary
  but degraded with `state_invalid` before email because the retained custody
  record lacked the new record-level source digest.
- Brief processing was disabled immediately; filing remained disabled, custody
  and rollback state were preserved, and processor/Titus/email intake health
  remained valid.
- The correction backfills a missing source digest from validated custody
  metadata and blocks a mismatch with the existing allowlisted `state_invalid`
  code. Tests prove no duplicate Titus or email request on either path.
- The correction was deployed from `f996136` disabled-first. The bounded Gary
  canary found no missing source digest, reached the private Titus endpoint,
  and was terminally rejected by the strict validator as
  `titus_output_rejected`. Safe aggregate evidence was one retained blocked
  record, zero accepted briefs, zero emails, zero missing source digests, and
  one retained custody record. The brief marker was removed immediately;
  filing remained disabled.
- The source-owned `restart-verify` check then passed with both Feature 035
  markers absent. A safe post-restart aggregate remained unchanged, proving no
  replay or duplicate Titus/email request. Processor, Hermes Titus, routed
  Titus email-intake, and SecurityTeam remained healthy.
- PR 183 (`fd4a32d`) added explicit Meeting Brief format constraints,
  prompt-aware idempotency, and a guarded reset command. The reset reopened
  exactly one terminal `titus_output_rejected` record while preserving custody
  and meeting identity. The fresh prompt-aware canary still failed strict
  validation; it was disabled immediately with zero briefs and zero emails. A
  post-canary restart remained idempotent.

## Retained-custody and production baseline

- The prior retained-custody correction preserved encrypted custody and meeting
  identity through the strict JSON rejection path. The later T057 Markdown MVP
  canary produced one accepted brief and one fixed-recipient email.
- Current live baseline remains one `pending_review`, one brief, one email, one
  retained custody record, zero errors, and a verified recording. Filing remains
  disabled and no production activation change is part of this correction.

## T057 MVP contract

- T057 uses the proven Feature 034 bounded Markdown contract for the production
  canary: one tool-free Titus request, required Summary, Decisions, Action Items,
  and Unresolved Questions headings, protected-value rejection, encrypted
  seven-day custody, and the fixed Gary/Austin email. Markdown is stored in a
  dedicated state field and emailed verbatim after local validation.
- Strict model-generated JSON, structured project routing, approval-driven
  filing, and Kanban/action-item extraction remain deferred to T058 and later.
  Filing stays disabled while the Markdown MVP is active; existing structured
  JSON state remains readable for rollback compatibility.

## Final operational closeout — 2026-08-04

- Platform-standard PR 77 merged at `d0650bf` and was fast-forwarded into the
  canonical Aegis checkout. `overnightdesk-ops` was restarted because the
  standard's WHAT/HOW/WHY directories are mounted consumers; no other service
  was restarted for the documentation sync.
- T056, T057, and T079 are complete. T057's bounded Markdown canary produced
  one accepted brief and one fixed-recipient email, retained one encrypted
  custody record, and passed restart idempotency with zero duplicate analysis
  or email events. T058 filing activation remains gated. T059 still requires a
  separately authorized normal-interval observation before it can close.
- The follow-on channel bot, channel-meeting discovery, and Graph webhook or
  subscription lifecycle remain outside Feature 035 and are tracked separately.

## T057 Markdown MVP closeout — 2026-08-04

- PR 185 (`6662ca8`) replaced the repeatedly rejected strict model-generated
  JSON canary with the proven bounded four-section Markdown contract. PR 186
  (`dfcc00e`) repaired the retained Feature 034 processed-lifecycle transition;
  PR 190 (`abbb7c9`) accepted AgentMail's opaque angle-bracket IDs; PR 192
  (`7066986`) accepted provider metadata, generated HTML, null empty fields,
  and the exact `Sent via AgentMail` footer on readback.
- The final immutable Aegis release was promoted disabled-first. One guarded
  reset reopened the existing terminal record without changing custody or
  meeting identity. The canary then completed one Titus Markdown brief and one
  AgentMail delivery to Gary and Austin only. Safe aggregate is one
  `pending_review`, one brief, one email, one retained custody record, and zero
  errors. Filing remains disabled for the T058 structured-routing boundary.
- A processor restart emitted zero duplicate analysis, brief, or email events;
  processor, Hermes Titus, SecurityTeam, and routed Titus email intake remained
  healthy. AgentMail readback compatibility is intentionally narrow: exact
  subject, text plus the provider's fixed footer, recipients, and empty
  CC/BCC/attachments are still required.

## P2 review corrections — 2026-08-04

- `meeting_email_rejected` is terminal for the stored brief. This covers
  permanent mailer-policy failures, including the 32,768-byte downstream body
  limit, so an oversized accepted Markdown result cannot remain in an endless
  `email_pending` retry loop.
- The roadmap checkpoint reports the final Markdown release and production
  evidence rather than the superseded strict-JSON canary.

## P2 follow-up corrections — 2026-08-04

- Recording verification is independent of brief email review status. A
  permanent `meeting_email_rejected` terminal state no longer prevents the
  associated recording from being streamed, hashed, and discarded. The worker
  skips only recordings whose own verification state is already terminal.
- The active Feature 035 contract is explicit in `spec.md`, `plan.md`,
  `quickstart.md`, `data-model.md`, and the requirements checklist: T057 is
  the bounded four-section Markdown MVP, while canonical Meeting Brief v1
  JSON and structured filing remain a separately gated T058+ phase.
- T083-T085 cover the regression, artifact reconciliation, qualification, and
  read-only quality gate. No production activation change is included.

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.
