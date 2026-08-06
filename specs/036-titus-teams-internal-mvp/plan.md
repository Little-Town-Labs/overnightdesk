# Implementation Plan: Titus TTS-Internal Channel MVP

**Branch**: `036-titus-teams-internal-mvp` | **Date**: 2026-08-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/036-titus-teams-internal-mvp/spec.md` and Issue #165.

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Enable Titus to handle explicit `@Titus` interactions in exactly one Teams
channel, `TTS-Internal`. Gary and Austin are independently authorized; separate
project channels are excluded before Titus processing; ordinary non-mentioned
messages are ignored; durable memory requires an explicit request; and existing
action approvals remain authoritative.

The implementation wraps the existing Hermes Teams adapter with a repo-owned
platform plugin override and uses the existing `hermes-titus` runtime and Teams
Phase path. It does not request all-message RSC delivery and adds no new agent,
service, queue, database, meeting pipeline, Graph meeting identity, file
capability, or production activation path.

## Technical Context

<!-- removed placeholder comment
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Existing tenant configuration and contract surfaces (YAML, POSIX shell, Python tests) plus the pinned Hermes Agent 0.19.1 Teams adapter; no new application language.

**Primary Dependencies**: Hermes Teams adapter/plugin registry, Microsoft Teams/Bot Framework delivery, existing Titus runtime, Phase secret projection, and existing Nginx TLS route.

**Storage**: Existing `hermes-titus-data` runtime and memory volumes only; no new database, queue, event ledger, or durable channel-message store.

**Testing**: Existing Python contract/security tests, shell syntax checks, static manifest/config validation, mocked activity routing tests, replay/restart fixtures, and owner-approved Teams canary checks.

**Target Platform**: Linux Titus runtime on Aegis behind public HTTPS ingress to internal port 3978; Teams client and Microsoft Teams tenant.

**Project Type**: Brownfield tenant integration and runtime configuration feature.

**Performance Goals**: At least 95% of valid interactive test messages receive a response or safe refusal within 30 seconds under normal service health; ordinary non-mentioned messages must not trigger model inference or visible replies.

**Constraints**: Exact Team/channel and sender allowlists; `TEAMS_ALLOW_ALL_USERS=false`; secrets only through Phase; no all-message RSC permission; no protected-content logging; no ordinary-message ingestion, attachments, project-channel ingestion, meeting artifacts, Graph meeting webhooks, or new action authority.

**Scale/Scope**: One `TTS-Internal` channel, two authorized operators, one Titus runtime, one Teams app installation, and one controlled canary. Additional channels/users are separate follow-up scope.

## Constitution Check

*GATE: Pass before Phase 0 research and re-check after Phase 1 design.*

- **Business data and use-case boundaries**: PASS. Titus remains the shared TTS runtime; the channel, users, memory source, and meeting identity are explicit and separate.
- **Least privilege**: PASS. The plan uses exact user/channel policy, no all-message RSC permission, Phase secrets, and no broad Graph artifact access.
- **Agents assist; people decide**: PASS. `@Titus` is required for all Titus processing; existing approval controls remain authoritative.
- **Named workloads**: PASS. The plan extends the named `hermes-titus` runtime and does not add dynamic hosting or a sidecar service.
- **Operational truth**: PASS. Source contracts, runbook evidence, safe health signals, and deployment/rollback records are required.
- **Recoverability**: PASS. Teams remains disabled-first with independent rollback and no destructive state cleanup.
- **Workspace quality**: PASS. Authorized and denied users/channels are tested independently and ambiguity fails closed.

## Project Structure

### Documentation (this feature)

```text
specs/036-titus-teams-internal-mvp/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 routing and runtime contracts
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
tenants/hermes-titus/
├── config/config.yaml                         # Teams platform mode
├── config/SOUL.md                             # Titus interaction policy
├── runtime/load-phase-env.sh                  # exact Phase projection
├── plugins/platforms/titus_teams/              # repo-owned adapter boundary
│   ├── adapter.py                              # narrow Hermes wrapper
│   ├── policy.py                               # pure routing policy
│   └── plugin.yaml                             # plugin registration
├── skills/titus-teams-channel/SKILL.md        # channel trust/memory behavior
├── teams/manifest.template.json               # no secrets or live IDs
├── tests/test_teams_runtime_contract.py       # projection and leak checks
├── tests/test_teams_channel_policy.py         # routing and authorization checks
├── README.md                                  # activation boundary
└── runbooks/teams-internal-channel.md        # qualification and rollback

specs/036-titus-teams-internal-mvp/
├── spec.md                                    # approved feature boundary
├── plan.md                                    # implementation architecture
├── research.md                                # source and architecture decisions
├── data-model.md                              # policy and event entities
├── quickstart.md                              # qualification procedure
└── contracts/teams-channel-routing.md         # inbound routing contract
```

**Structure Decision**: Extend the existing Titus tenant source and deployment
contract. Use a source-controlled Hermes platform plugin to wrap the native
Teams adapter before dispatch, plus one source-controlled manifest template. Do
not create a new repository, public API, database, queue, event ledger, meeting
processor, Graph meeting receiver, attachment pipeline, or channel-specific
runtime for the MVP. Actual live Team/channel IDs and secrets remain in the
approved runtime/secret store and are never committed.

## Phase 0: Research complete

Research decisions are recorded in [research.md](research.md). The remaining
implementation qualification is bounded to verifying the pinned Hermes adapter,
the real Team/channel activity IDs, the mention-routing seam, and the exact
project-channel exclusion behavior.

## Phase 1: Design complete

- [data-model.md](data-model.md) defines the policy, message, context, memory,
  and action entities without introducing a new schema.
- [contracts/teams-channel-routing.md](contracts/teams-channel-routing.md)
  defines accepted activity, routing, output, and safe-evidence behavior.
- [quickstart.md](quickstart.md) defines local checks, qualification evidence,
  stop conditions, and the separate production decision.

## Post-design Constitution Check

PASS. The design preserves the existing Titus identity and memory boundary,
keeps Microsoft Graph meeting credentials separate, limits processing to explicit
mentions in the approved channel, prevents unmentioned processing, and adds no
unreviewed production authority or state service.

## Complexity Tracking

No constitution violations or complexity exceptions require justification.
