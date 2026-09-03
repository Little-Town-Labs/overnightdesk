# Delivery Profile: 042-buzz-private-pilot

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
- Project: `overnightdesk-buzz-042`
- Status: `ready`

- Fast index completed with 13,910 nodes and 26,890 edges for the active worktree.
- Architecture inspection confirms existing Nginx and Hermes boundaries and an existing /v1/runs route.
- Targeted source reads confirm POST /v1/runs uses session and idempotency headers and runtime capability checks require approval-response support.
- Targeted source reads confirm runtime credentials are projected per intake rather than embedded in source.

## Current Gate

Gate 0 is blocked at T057. T056 and T058-T061 are complete, but no maintained
object store and initializer currently pass the admission contract, so T062
and implementation cannot advance. The historical MinIO images, Garage v2.3.0,
and RustFS `1.0.0-rc.5` are rejected; no supported no-S3 mode was found. No
address, route, listener, DNS
record, certificate, identity, admission, container, or deployment was created.

The owner accepted the existing tailnet-wide policy and five owner-controlled
devices for this bounded pilot. Participant authorization is enforced by
separate Nostr identities and the closed-relay roster. Walter, Titus, and
Mitchel/Trevor retain their existing Hermes tools, memory, model routing, and
human-approval policy behind exact signed-owner/channel intake checks.

## Cross-Artifact Analysis

The 2026-09-02 Spec Kit consistency pass found no unresolved Critical or High
finding and no uncovered functional requirement or success criterion. It
remediated stale SecurityTeam routing text and made same-channel replies,
fail-closed named-runtime mapping, cross-runtime credential denial,
deduplication-only state, bot-trigger denial, and non-bypassable human approval
explicit across the spec, contracts, and tasks.

Codex review of PR #253 then found three execution-contract defects. The
remediation keeps intake workers off the shared production network behind a
fixed-target Nginx egress broker, narrows revocation to unsubmitted/future-work
rejection plus late-result suppression because Hermes has no cancellation API,
and uses the host's existing `systemd-socket-proxyd` instead of an impossible
reload-time Docker port publication. No review finding remains undisposed.

The active set contains 27 functional requirements, 14 success criteria, nine
preserved historical tasks, and 45 contiguous continuation tasks T055-T099.
The simpler design does not require a temporary Tailscale OAuth credential,
device tag, grant, or policy rewrite.

The 2026-09-03 object-store review added no new pilot capability. It clarified
FR-016 and the existing T057/T070/T073/T078/T081 gates: generic
“S3-compatible” claims and probe-disable are insufficient; a maintained store
must pass the exact path-style, media, Git, conditional-write, version,
community-deletion, storage-sweep, persistence, and recovery contracts.
ADR-009 is the durable decision record.

## Delegated Tasks

| Task | Spec Kit IDs | Mutable | Lane | Owned paths | Verification |
|---|---|---:|---|---|---|
| gate0-image-readiness | T057 | no | codex-luna read-only | none | `python3 -m unittest infra/buzz/tests/test_candidate_images.py` |
| gate0-contract-readiness | T062 | no | codex-luna read-only | none | `specify check` |

The generated read-only and quality-gate manifests both linted clean and
completed dry runs. They were not executed; no worker or production mutation
was started.

## Scope and Safety Gates

- `spec.md` is the scope ceiling, `plan.md` is the architecture boundary, and `tasks.md` is the authorized execution list.
- Workers may not commit, push, edit `.git`, update canonical task status, or widen scope.
- New requirements, dependencies, public interfaces, schemas, migrations, architecture decisions, or file surfaces require `SCOPE CHANGE REQUIRED`.
- Sensitive and production mutation remains with Sol or the accountable human lead.

## Pull Request Context

The pull request must record this classification, important graph discoveries,
delegated ownership, verification evidence, risk and rollback information, and
links to any ADR, runbook, roadmap, or Spec Kit artifact that remains durable.

## Reactivation Preconditions

1. Finish T057 and T062 without changing production.
2. Pass local contracts before requesting the separately approved route
   coexistence experiment.
3. Keep address assignment, route advertisement/approval, DNS/certificate
   work, listener activation, owner admission, and each named-agent admission
   as separate owner decisions.
4. Keep merge completion separate from production activation.
