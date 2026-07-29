# Quickstart: Titus Linear Read-Only Delivery

## Workspace and review record

- Feature worktree:
  `/home/frosted639/src/overnightdesk-suite/overnightdesk-worktrees/codex-feature-032-titus-linear-readonly`
- Branch: `032-titus-linear-readonly`
- Base: `origin/main` at `f143f0b`
- Platform-standard worktree:
  `/home/frosted639/src/overnightdesk-suite/overnightdesk-platform-standard-worktrees/codex-linear-work-management-standard`
- Ringer implementation-support run:
  `overnightdesk-feature-032-implementation-support-20260729T144040Z-p1990109`
- Initial Sol review:
  `overnightdesk-feature-032-final-review-20260729T145800Z-p2004983`
- Sol delta review:
  `overnightdesk-feature-032-delta-review-20260729T152004Z-p2021134`
- Ringer record: both bounded Luna reviews passed. Reconciled required findings
  are strict optional Phase loading, deterministic disabled/ready projection,
  provider-agnostic mutation rejection, value-safe verification, the existing
  deploy script's missing preflight action, an explicit Verification status
  before Done, and synchronization of the platform standard from OAuth/write
  planning to this approved Read-key pilot.

Official-source review confirmed the hosted read-only endpoint, Read and team
restriction options for API keys, the distinction between native GitHub
PR/commit linking and GitHub Issues synchronization, and Hermes support for
environment-backed headers on remote HTTP MCP servers.

## Test-first evidence

RED was recorded before runtime implementation:

- focused projection and registry suite: `11 passed, 28 failed`;
- all failures were the absent `apply_linear_state` behavior, absent Linear
  source entry, or absent three-argument registry boundary;
- tenant qualification stopped at the intentionally absent
  `skills/linear-technical-delivery/SKILL.md`;
- no Phase, Linear, GitHub, production, or credential state was changed.

Final GREEN after the runtime, operating-contract, and lead-controlled
re-scope:

- focused projection, Phase-loader, and registry suite: `53 passed`;
- complete Hermes Titus tenant qualification: `134 passed`;
- Bash syntax passed for the Phase loader, volume preparation, startup
  projection, and deployment script;
- source and skill metadata YAML parsed successfully;
- both repository diffs passed `git diff --check`;
- scans found no retired-connector reference, credential literal, Linear mutation path,
  webhook/bridge, Linear database/cache/ledger, semantic copy, Titus GitHub
  credential, new service, port, or public route;
- platform-standard YAML parsed and the OAuth/write-planning drift identified
  by Ringer was removed.

The first Sol gate requested five bounded changes. The single allowed
remediation round added executable optional-Phase cases, required recognizable
read tools while rejecting edit and transition variants, installed the
Gary/Austin-only Free pilot gate, and added hostile-content plus wrong-team
activation checks. The delta review resolved four findings and identified one
unsafe exception: the special revoke-only verifier could mistake an unrelated
registry failure for expected Linear unavailability. The lead-controlled
re-scope removed that nonessential verification mode. Revocation now fails
strict normal verification, and the disabled profile is the supported
rollback.

The delta report's verdict was `REQUEST CHANGES`: R1 and R3-R5 were resolved;
R2 remained unsafe. The bounded-review retry limit was reached, so no second
remediation loop was started. The release was instead narrowed by deleting the
entire special expected-unavailable verifier and deploy action. Post-re-scope
qualification is the final GREEN evidence above.

## Spec Kit cross-artifact analysis

The final specification, plan, research, data model, runtime/authority
contract, quickstart, and task list have complete requirement coverage:

- FR-001 through FR-004 map to the platform standard, direct hosted MCP
  configuration, strict runtime profile, registry tests, and operating model;
- FR-005 through FR-007 map to fail-closed loader/projection behavior,
  value-safe verification, and the untrusted-content skill boundary;
- FR-008 through FR-012 map to the role/authority model, target-environment
  Definition of Done, GitHub source boundary, and disabled GitHub Issues sync;
- FR-013 and SC-007 map to source-contract and prohibited-infrastructure scans;
- FR-014 through FR-016 map to the two-state runtime, strict normal verifier,
  supported disabled rollback, qualification matrix, runbook, and installed
  skill;
- SC-001 through SC-006 have executable or human activation tasks. The
  live-workspace reads, wrong-team check, restart, and rollback correctly
  remain in T029 because they require the human-created Linear workspace,
  team-scoped Read key, and representative issues.

No unresolved ambiguity, duplication, constitution conflict, missing
requirement mapping, or retired connector reference remains. Publication and
disabled production tasks T025-T028 are intentionally open, and human
activation T029 remains the terminal external gate.

## Publication record

- Platform-standard PR:
  `https://github.com/Little-Town-Labs/overnightdesk-platform-standard/pull/72`
- Platform-standard merge commit:
  `33955fea40dda74c902196fe0e5548fcafdd53aa`
- Platform-standard checks: repository reports no configured checks; GitHub
  reported the PR clean and mergeable before merge.
- OvernightDesk implementation PR:
  `https://github.com/Little-Town-Labs/overnightdesk/pull/151`
- OvernightDesk checks: Vercel deployment and Vercel Preview Comments passed;
  local qualification supplies the tenant-specific release evidence.

## Local qualification

```bash
tenants/hermes-titus/scripts/qualify.sh
```

Expected result:

- source configuration points only to Linear's read-only endpoint;
- the connection defaults disabled;
- exact workspace/team validation is present;
- no mutation, database, webhook, or GitHub Issues sync path exists;
- credential-literal scan and runtime projection tests pass;
- the Titus delivery skill and runbook are discoverable.

## Production preflight

Use the existing deployment script to verify current Titus state before any
change:

```bash
tenants/hermes-titus/scripts/deploy-aegis.sh preflight
```

Deploy reviewed source with Linear disabled first. Confirm Titus health, email,
project knowledge, memory, dashboard, and existing MCP registry behavior.

The source deployment gate is exact: merge both reviewed pull requests, deploy
the merged OvernightDesk commit with the Linear Phase path absent or set only
to `LINEAR_ENABLED=false`, and require `linear_state=disabled` plus
`linear_mcp=disabled`. Do not create or activate the ready profile until the
human setup gate below is complete.

## Human Linear setup gate

In Linear, a human administrator:

1. Creates or confirms workspace `Timeless Technology Solutions`.
2. Creates or confirms team key `TTS`.
3. Configures the technical-delivery statuses and target-verification Done
   policy from the tenant runbook.
4. Creates a named API key with only `Read` permission and only `TTS` team
   access.
5. Connects approved GitHub repositories for PR/commit linking, leaving GitHub
   Issues synchronization unconfigured.
6. Stores the exact enabled profile in Phase without copying values into chat,
   tickets, shell history, source, or evidence.

## Activation verification

After controlled restart:

1. Verify Titus and unrelated capabilities are healthy.
2. Verify the registered Linear MCP surface contains read tools and no mutation
   tools.
3. Ask five representative read questions and compare issue identifiers,
   status, owner, dependencies, and timestamps with Linear.
4. Attempt representative create, update, assignment, comment, transition, and
   delete requests; all must be refused with zero provider changes.
5. Verify a merged but target-unverified example is not reported Done.
6. Read a human-prepared TTS issue containing instruction-like text. Confirm
   Titus treats it only as untrusted data, performs no alternate tool action,
   reveals no credential, and makes no provider change.
7. Attempt a safe read outside the key's `TTS` team boundary. Require denial,
   zero credential disclosure, and healthy unrelated capabilities.
8. Inspect value-safe logs and evidence for credential leakage.

## Emergency credential revocation

If the Linear key must be revoked while the ready profile remains in Phase,
normal verification must fail closed. Do not classify a discovery exception as
healthy or infer that Linear caused a global registry failure. Contain the key,
diagnose using provider-side and value-safe operator evidence, then apply the
supported disabled rollback below.

## Disable rollback

Replace the Phase profile with only `LINEAR_ENABLED=false`, restart Titus, and
run normal `deploy-aegis.sh verify`. Require:

- `linear_state=disabled`;
- no Linear tools or authorization header register;
- Linear reads are reported unavailable;
- unrelated Titus capabilities remain healthy;
- no Linear records changed during activation, revocation, or rollback.
