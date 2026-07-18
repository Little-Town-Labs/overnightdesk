# Implementation Plan: Phase App Consolidation

**Branch**: `018-phase-app-consolidation` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/018-phase-app-consolidation/spec.md`

## Summary

Consolidate Phase around two use-case boundaries without deleting rollback
sources. Phase data is copied and fingerprint-verified before activation;
route-aware shell loaders select `timeless-tech-solutions` for Titus and
`overnightdesk` for Agent, Mitchel, and email-fetch. Those consumers use exactly
two Phase identities: the TTS service account for Titus and AgentZero for the
OvernightDesk boundary. The app rename and Aegis restarts form one coordinated
cutover after app/environment access is proven.

## Technical Context

**Language/Version**: Bash 5 on Ubuntu ARM64; existing Go 1.24.4 intake binary is unchanged

**Primary Dependencies**: Phase CLI 2.1.0, systemd, Docker, jq, sha256sum, SSH/rsync

**Storage**: Phase Cloud Production environments; root-created `/run` files; existing Docker named volumes

**Testing**: Shell syntax and contract assertions in tenant qualification scripts; existing Go unit/race/vet/build qualification; live systemd and container health checks

**Target Platform**: `aegis-prod` Ubuntu ARM64 production VM

**Project Type**: Multi-repository production configuration migration

**Performance Goals**: Secret loads finish within the existing 30-second timeout; no additional polling latency

**Constraints**: No value output; no source deletion; app-level authorization is the trust boundary; five consumers must remain individually rollbackable

**Scale/Scope**: Three Phase apps becoming two active apps; three service accounts becoming two active identities; three copied paths; five affected consumers; two Git worktrees

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Customer data and secrets**: PASS. Values stay in Phase or restrictive
  temporary files and never enter Git, logs, argv, or Docker metadata.
- **Security and least privilege**: PASS. Access is verified at App and
  Production Environment scope; paths are not treated as authorization.
- **Owner decides**: PASS. The owner accepted the ADR and authorized execution;
  destructive app deletion remains separately gated.
- **Simple over clever**: PASS. Existing loaders receive route-aware defaults
  and explicit overrides rather than a new provisioning subsystem.
- **Test-first**: PASS. Qualification assertions are changed to fail before
  loader implementation.
- **Honesty and observability**: PASS. Evidence records copy counts,
  fingerprints, secret-load results, health, and rollback readiness without
  reporting a partial copy as a cutover.

## Project Structure

### Documentation (this feature)

```text
specs/018-phase-app-consolidation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── phase-selector-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code

```text
tenants/hermes-titus/
├── runtime/load-phase-env.sh
├── scripts/qualify.sh
├── email-poller/runtime/load-phase-config.sh
├── email-poller/scripts/deploy-aegis.sh
└── email-poller/scripts/qualify.sh
```

The sibling `overnightdesk-platform-standard` Phase worktree owns canonical
app/path inventory, runbook updates, and cutover evidence. The suite-root
`deploys.log` owns production activation records.

**Structure Decision**: Keep consumer behavior with its tenant source and keep
platform facts in the standards repository. Do not introduce a shared migration
library for one coordinated cutover.

## Delivery Phases

1. **Phase preparation**: Copy and fingerprint-verify destination paths while
   preserving all sources.
2. **Consumer preparation**: Add failing route-selection assertions, implement
   route-aware selectors, and qualify the complete tenant package.
3. **Access and rename**: Verify the TTS and AgentZero identities against their
   target apps, retire `platform-cli-cloud` from active use, and verify the
   existing Azure app was renamed by stable ID.
4. **Aegis cutover**: Update the email-fetch selector, deploy tenant loaders,
   restart affected consumers one at a time, and verify health.
5. **Closeout**: Update standards, deploy evidence, and source-control PRs;
   retain `Infrastructure` for observation.

## Complexity Tracking

No constitution violations require exceptions.
