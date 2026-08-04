# Delivery Profile: 035-titus-meeting-briefs

## Classification

- Project: `overnightdesk`
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
- Project: `home-frosted639-src-overnightdesk-suite-overnightdesk`
- Status: `ready`

- Canonical moderate index at de1836f contains 11936 nodes and 20935 edges.
- Graph cluster 236 identifies FetchTranscriptContent and the meeting processor state/client seam.
- Graph search identifies processOneTranscript and contentStatusFor as the current transcript and recording lifecycle boundary.
- Graph search identifies email-poller claimClean before Hermes SubmitRun as the deterministic command interception seam.
- Targeted source reads verified the main Titus API retains tools, recording content is not_applicable, and project knowledge and Kanban use separate existing volumes.

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| architecture-security-review | T003 | no | codex-luna read-only | none | `python3 /home/frosted639/src/ringer-workflows/scripts/delivery_profile.py validate-report --kind readonly --report report.md` |

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.

## Completed Read-Only Gate

- Initial Ringer review run `overnightdesk-035-titus-meeting-briefs-readonly-20260801T182318Z-p458332` passed its report contract in one attempt and identified six contract-level blockers.
- Sol corrected legacy-output migration, rollback-compatible separate state, sender-bound approval claims, exact-byte idempotency, deterministic semantic validation, and fail-closed custody rotation/retention.
- The one permitted Luna remediation run `overnightdesk-035-titus-meeting-briefs-readonly-remediation-20260801T183657Z-p465732` passed in one attempt and confirmed all six blockers resolved.
- Sol reconciled its only remaining Required wording issue: instruction-like source text is inert quoted data, while attempts to reinterpret it as executable direction or performed-action evidence fail validation.
- Scope is frozen. Mutable implementation and every production action remain Sol-owned.

## Implementation Quality Gate

- Full Sol review run `overnightdesk-035-titus-meeting-briefs-quality-gate-20260801T193502Z-p539569` requested changes after identifying crash-orphan custody, lifecycle concurrency, restart acknowledgement, exact storage, and executable deployment gaps.
- Sol used the single permitted remediation round to add orphan reconciliation and retention-only deletion, a shared lifecycle lock, restart-safe review acknowledgements and conflict replies, atomic note installation, exhaustive filer/readback checks, dedicated custody and least-privilege Kanban mounts, Feature 035 health/correlation, terminal retry stops, deterministic recording correlation, and disabled-first analyzer/filer operations.
- Local verification passes meeting-processor, email-poller, and meeting-filer unit/race/vet/build suites; the meeting processor also passes its ARM64 image and hardened-container inspection. The filer passes a native ARM64 binary build; its final image remains a deployment-time check because the pinned private Hermes base image is not present in the local cache.
- The bounded Sol delta run `overnightdesk-035-titus-meeting-briefs-quality-gate-delta-20260801T200854Z-p709405` resolved the original findings except for two Required items: coordinated fail-closed disabled installation and the FR-031 note idempotency key.
- After the permitted remediation and delta were exhausted, the accountable Sol lead explicitly kept Feature 035's frozen scope and split those two remaining findings into lead-owned corrections. No further mutable Ringer remediation was authorized.
- Note creation now derives the exact versioned `note` key, embeds it in deterministic create-only Markdown, returns it through the filer API, validates exact caller readback, and persists it in safe filing state. Triage, action, and commitment keys continue through the same canonical derivation.
- The processor now exposes one `install-feature-035-disabled` order that, after local qualification, removes only Feature 035 markers, stops analyzer and filer, and reloads the processor and Titus intake route without Feature 035 credentials before the first remote runtime promotion. It then promotes the processor/filer surfaces, initializes the inactive filer, preserves the Feature 034 marker/state, and verifies unrelated Titus/email continuity. Brief and filer activation failures invoke fail-closed cleanup, and the official runbook contains exact filer enable/verify/rollback commands.
- Final local qualification after these corrections passes all three Go unit/race/vet/build suites, processor 17-test Python/runtime/release/security coverage, filer 6-test Python/release/security coverage, shell parsing, JSON Schema/OpenAPI structural validation, leak/static checks, native ARM64 filer build, and processor ARM64 image plus hardened-container inspection (`ec9e9c21d0af`).
- Clean read-only Sol run `overnightdesk-035-titus-meeting-briefs-final-clean-20260801T205209Z-p865305` confirmed FR-031 resolved and requested two final lifecycle corrections: remove Feature 035 authority before remote promotion, and initialize the mandatory unknown-project note destination.
- The accountable Sol lead kept the frozen product scope and split those two bounded findings into lead-owned lifecycle corrections. The disabled-first order now removes authority before promotion, and filer initialization creates and verifies the exact non-symlink `00-inbox/meetings` path with owner `10000:10000` and mode `0750`. Focused regression tests prove both contracts.
- Read-only Sol delta run `overnightdesk-035-titus-meeting-briefs-final-lifecycle-delta-20260801T211231Z-p893083` confirmed the unknown-project destination resolved and identified one remaining exact postcondition: suppressed `systemctl disable --now` errors required a pre-promotion proof that analyzer/filer units and containers were stopped.
- Because the configured remediation/delta ceiling was reached, the accountable Sol lead did not start another Ringer loop. The exact lead-owned correction now requires both private units to be disabled and in `inactive`, `failed`, or `unknown` state, both canonical private containers to be absent, and active processor/intake projections to omit every Feature 035 authority field before `promote` can run. The focused 12-test security suite, shell parsing, `git diff --check`, and an executable ordering/postcondition audit pass; the accountable final delta verdict is `APPROVE`.
- Source publication is OvernightDesk PR 163. Its required Vercel and Vercel Preview Comments checks pass, and the authorized merge closes T039 without deploying Feature 035.
- Production deployment and canaries remain explicitly deferred at the user's request; T040-T046 are not complete.

## Titus Sol/Luna Architecture Correction

- The owner rejected the separate analyzer sidecar and approved Titus-owned
  interpretation: primary Sol orchestrates, Luna drafts in a background child,
  and Sol performs the accountable QA before fixed-recipient email eligibility.
- A fresh worktree `035-titus-sol-luna-meeting-briefs` was created from
  refreshed `origin/main`; the uncommitted sidecar-correction worktree remains
  untouched for evidence and recovery.
- Classification remains `brownfield` / `system` / `production`; Ringer remains
  read-only and Sol owns every source, runtime, Git, and production mutation.
- The canonical codebase graph was refreshed at `21fc062` to 12,585 nodes and
  23,208 edges. It identifies `processOneMeetingTranscript`, the analyzer
  client, brief-state validation, config projection, and deployment scripts as
  the correction seams; targeted reads verified each.
- Official Hermes docs and pinned v0.19.1 source establish the Runs/Sessions
  integration: detached delegation needs a persisted owning session; the first
  run may finish before Luna; a running child becomes unknown across restart;
  session deletion cascades delegate rows; delegation kickoff context logging
  is bounded to 500 characters.
- The frozen correction scope is T040-T054. The design gate is T041, mutable
  implementation is Sol-only T042-T050, executable qualification is T051-T052,
  and the final read-only quality gate is T053.
- The first correction design run was interrupted because its generated scout
  package pointed at canonical `main` instead of this uncommitted worktree. No
  source or production mutation occurred; it counts as the one task retry.
- Corrected read-only run
  `overnightdesk-035-titus-sol-luna-meeting-briefs-readonly-20260802T000324Z-p1032793`
  passed its report contract and identified required binding gaps. Sol folded
  them into FR-005 and FR-033 through FR-036: authenticated child lineage plus
  observed configured Luna route, local meeting/attempt/source correlation,
  canonical latest-child draft equality, exact create/run ambiguity rules,
  byte-level kickoff privacy, and fail-closed verified parent/child cleanup.
  CHK022 remains open until implementation and the final delta review prove
  those controls.
- The implemented correction was refreshed into its exact worktree graph at
  12,834 nodes and 23,888 edges. The graph traces the critical cleanup path
  from `processOneMeetingTranscript` through `cleanupAnalysis` to authenticated
  descendant enumeration and bounded API requests; targeted source reads
  verified every reported seam and rejected one unrelated cross-package `New`
  edge as an index false positive.
- Sol's five-axis review found and resolved two Required gaps before the final
  Ringer gate: cleanup now re-enumerates descendants immediately before parent
  deletion and verifies every persisted or newly observed child is absent, and
  pre-run session creation proves the parent inherited `gpt-5.6-sol` with its
  fixed system prompt and no request-scoped model snapshot. Post-run inspection
  continues to prove the Sol route while accepting Hermes's normal persisted
  runtime model snapshot. Feature 035 still sends no model or provider field.
- Pre-delta local qualification passed Go unit/race/vet/build, 19 Python
  runtime/release/security contracts, shell/static/leak checks, and the ARM64
  hardened-container build and inspection (`16c28f702636`).
- The final Ringer quality-gate run and one transport-rescope retry could not
  start their read-only Sol worker because the nested ChatGPT transport returned
  `403 Forbidden`; neither attempt mutated the repository. Per the bounded-loop
  policy, no further Ringer retry is authorized.
- The owner-approved direct read-only Sol fallback found one Critical integration
  defect: post-run inspection rejected Hermes's expected persisted runtime model
  snapshot and would have stalled every real meeting. A failing real-transition
  regression test reproduced the defect; the processor now distinguishes the
  strict pre-run no-override check from normal post-run snapshot persistence.
  Focused orchestrator/state/worker tests pass.
- The single permitted Sol delta review confirmed that Critical resolved and
  found two Required lifecycle gaps: a lost create response could remain in
  replayable `dispatch_pending`, and an older QA envelope could survive later
  parent output or delegation. With the review ceiling exhausted, the accountable
  Sol lead made only those two frozen-scope corrections. Create ambiguity now
  enters bounded `dispatch_unknown` without another create/run POST, including
  unavailable readback at the deadline; QA eligibility now requires the terminal
  non-empty parent assistant result after the final audited delegation. New
  regression tests plus focused unit/race/vet checks pass. Refreshed full
  qualification passes Go unit/race/vet/build, 19 Python runtime/release/security
  contracts, shell/static/leak checks, and the ARM64 hardened-container build and
  inspection (`54c83b7c6d4d`). With all frozen findings covered by executable
  regressions, the accountable lead verdict is `APPROVE`.
- Correction publication is OvernightDesk PR 169. Its required Vercel and
  Vercel Preview Comments checks pass; the authorized merge closes T055 without
  activating or deploying Feature 035.

## T056 Production disabled-first deployment

- T056 deployed the merged `f8a924e` release to `aegis-prod` on 2026-08-04.
  The first local attempt stopped safely because the workstation lacked the
  `docker` CLI; no production mutation occurred. The approved Podman-backed
  retry passed local qualification and completed the remote deployment.
- The corrected meeting processor is enabled and healthy as UID/GID
  `10003:10003`, read-only rootfs, no published ports, private
  `overnightdesk_overnightdesk` network, and only processor/custody mounts.
  Feature 035 brief and filing markers are absent; the Feature 034 content
  marker remains present and its content projection remains healthy.
- The meeting filer release is installed but disabled/inactive. Its reviewed
  runtime retains read-only rootfs, dropped capabilities, no-new-privileges,
  bounded CPU/memory/PID limits, no ports, and the exact project-knowledge and
  Hermes Kanban mount contract. The root-owned `00-inbox/meetings` destination
  exists with UID/GID `10000:10000` and mode `0750`.
- The shared Titus email-poller runtime is installed and healthy on the private
  network with no ports; the meeting-review path remains disabled because its
  Feature 035 projection is absent. Titus, Titus intake, Walter intake,
  Mitchel intake, SecurityTeam, communication module, Ops, and Nginx remained
  healthy.
- The retired analyzer unit and container are absent. The immutable previous
  processor release and pinned legacy analyzer image remain retained for
  rollback cooling-off; processor, custody, filer, project-knowledge, Hermes
  data, and Kanban volumes remain present. No transcript, recording, secret
  value, or message content was emitted in deployment evidence.
