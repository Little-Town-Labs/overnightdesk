# Delivery Profile: 035-titus-meeting-briefs

## Classification

- Project: `overnightdesk-feature-035-review-fixes`
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
- Project: `home-frosted639-src-overnightdesk-suite-overnightdesk-worktrees-codex-feature-035-review-fixes`
- Status: `ready`

- Fresh fast worktree index contains 12771 nodes and 23412 edges for the correction branch; the canonical graph was also refreshed before planning.
- search_code located both buildProcessor configuration paths and the shared internal/titus NewClient constructor.
- search_code located processOneMeetingTranscript email eligibility and the deterministic meetingReference helper.
- search_code located titus_response_invalid retry handling in processOneMeetingAnalysis; targeted source reads verified every seam.

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| review-pr175-corrections | T076 | no | codex-luna read-only | none | `go test ./internal/titus ./internal/worker ./cmd/titus-meeting-processor Report exact file and line evidence for every Critical or Required finding.` |

## Execution Evidence

- Spec Kit consistency analysis found no Critical or High contradiction across the Feature 035 correction requirements, plan, and task graph.
- The initial read-only Luna review passed and identified two Required reliability regressions: the direct Titus crash window could replay after restart, and the Feature 034 idempotency-key derivation had changed. Sol remediated both once by persisting `dispatching` before the request and restoring the exact legacy Markdown key derivation.
- Final read-only Sol delta gate `overnightdesk-feature-035-review-fixes-035-titus-meeting-briefs-quality-gate-20260804T105814Z-p2940454` returned `APPROVE` with no Critical, Required, Optional, or Nit findings.
- Full qualification passed Go unit and race tests, vet, CGO-disabled build, 19 Python runtime/release/security tests, shell and static/leak checks, and ARM64 hardened-image build and inspection.
- Focused coverage was 84.3 percent for `internal/titus` and 73.6 percent for `internal/worker`; `git diff --check` passed and no dependency manifest changed.
- This correction is code-only. Feature 035 production processing remains disabled; deployment and canary activation are outside this pull request.

## Retained-custody canary correction

- The first post-merge Gary canary reached the persisted `dispatching` boundary but degraded with `state_invalid` before email because the retained custody record lacked the new record-level source digest.
- Brief processing was disabled immediately; filing remained disabled, custody and rollback state were preserved, and processor/Titus/email intake health remained valid.
- The correction backfills a missing source digest from validated custody metadata and blocks a mismatch with the existing allowlisted `state_invalid` code. Tests prove no duplicate Titus or email request on either path.
- The correction was deployed from `f996136` disabled-first. The bounded Gary canary found no missing source digest, reached the private Titus endpoint, and was terminally rejected by the strict validator as `titus_output_rejected`. Safe aggregate evidence is one retained blocked record, zero accepted briefs, zero emails, zero missing source digests, and one retained custody record. The brief marker was removed immediately; filing remained disabled.
- The source-owned `restart-verify` check then passed with both Feature 035 markers absent. A safe post-restart aggregate remained unchanged, proving no replay or duplicate Titus/email request. Processor, Hermes Titus, routed Titus email-intake container, and SecurityTeam remained healthy.
- PR 183 (`fd4a32d`) added explicit Meeting Brief format constraints, prompt-aware idempotency, and a guarded reset command. The reset reopened exactly one terminal `titus_output_rejected` record while preserving custody and meeting identity. The fresh prompt-aware canary still failed strict validation; it was disabled immediately with zero briefs and zero emails. A post-canary restart remained idempotent.

## T057 MVP redesign

- T057 now uses the proven Feature 034 bounded Markdown contract for the
  production canary: one tool-free Titus request, required Summary, Decisions,
  Action Items, and Unresolved Questions headings, protected-value rejection,
  encrypted seven-day custody, and the fixed Gary/Austin email. Markdown is
  stored in a dedicated state field and emailed verbatim after local validation.
- Strict model-generated JSON, structured project routing, approval-driven
  filing, and Kanban/action-item extraction remain deferred to T058 and later.
  Filing stays disabled while the Markdown MVP is active; existing structured
  JSON state remains readable for rollback compatibility.

## Final operational closeout — 2026-08-04

- Platform-standard PR 77 merged at `d0650bf` and was fast-forwarded into the
  canonical Aegis checkout. `overnightdesk-ops` was restarted because the
  standard's WHAT/HOW/WHY directories are mounted consumers; no other service
  was restarted for the documentation sync.
- T056 and T079 are complete. T057 remains pending because the canary did not
  produce an accepted brief or email; this is a safety block, not business
  acceptance. T058 filing activation remains gated. T059 still requires a
  separately authorized normal-interval observation before it can close.
- The follow-on channel bot, channel-meeting discovery, and Graph webhook or
  subscription lifecycle remain outside Feature 035 and are tracked separately.

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.
