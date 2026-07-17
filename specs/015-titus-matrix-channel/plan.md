# Implementation Plan: Titus Matrix Communication Channel

**Branch**: `015-titus-matrix-channel` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

## Summary

Enable Hermes's native Matrix platform in the existing `hermes-titus`
container so messages from Gary in one private encrypted room enter the full
Hermes tool, memory, reasoning, progress, and approval pipeline. Extend the
existing Phase loader and generated runtime configuration, persist Matrix
crypto state on `hermes-titus-data`, add channel-aware qualification and health
evidence, and retain the standalone AgentMail poller as a separate non-tool
asynchronous workflow.

The pinned ARM64 image already contains the Matrix plugin, `mautrix`, `libolm`,
`asyncpg`, and `aiosqlite`, so the channel uses the stock native adapter without
an image rebuild. Shared-room intake is restricted to the exact approved room;
the stock adapter also permits direct messages from the exact authorized
operator as isolated room-scoped sessions.

## Technical Context

**Language/Version**: Bash 5; Python 3.13 for redacted production verification;
YAML for Hermes configuration

**Primary Dependencies**: `overnightdesk/hermes-agent:0.18.0-coder`; bundled
`matrix-platform` plugin 1.0.0; `mautrix` 0.21.0; `libolm.so.3`; `asyncpg`;
`aiosqlite`; Phase CLI 2.1.0; Docker 29.6; systemd

**Storage**: Existing `hermes-titus-data:/opt/data` volume, including Hermes
sessions and `/opt/data/platforms/matrix/store/`; no new database or volume

**Testing**: Shell qualification; configuration and secret-redaction tests;
ARM64 container smoke
tests; controlled encrypted Matrix room, approval, restart, failure, and
rollback verification

**Target Platform**: `aegis-prod`, Oracle Cloud ARM64 Linux, hardened Docker
container managed by `hermes-titus.service`

**Project Type**: Tenant runtime configuration

**Performance Goals**: New room messages visibly enter processing within 10
seconds under healthy Matrix service; terminal delivery follows agent completion
within 10 seconds; reconnect and restart recovery completes within two minutes

**Constraints**: No published ports; read-only root filesystem; non-root UID
10000; capabilities dropped; exact user and room allowlists; E2EE required and
fail-closed; requester-bound approvals; bounded 10 MiB media; no secret or
message-body telemetry; no changes to email poller data or behavior

**Scale/Scope**: One bot identity, one operator, one private Matrix room, one
Hermes tenant container, and the existing low-volume email poller

## Constitution Check

- **Spec Kit lifecycle**: PASS. Specification, clarification scan, research,
  design contracts, tasks, and analysis precede implementation.
- **Repository boundary**: PASS. Titus-owned runtime source remains under
  `tenants/hermes-titus/`; platform contract updates stay in the standards repo.
- **Data isolation**: PASS. Conversation and crypto state remain on the existing
  tenant volume; the platform database and sibling containers cannot read them.
- **Secrets management**: PASS. The bot token and recovery key live only in
  Phase and the existing root-owned `/run/hermes-titus/runtime.env` mount.
- **Least privilege**: PASS. One exact operator and one shared room are
  authorized; only that operator may also use a direct-message session. E2EE is
  required and administrative/cross-room tools remain disabled.
- **Agent authority**: PASS. Matrix changes only the trusted entry point; Titus's
  Control Tower, tool, and guarded-action authority do not expand.
- **External integration safety**: PASS. Matrix events are untrusted protocol
  input; IDs, event age, duplicates, media bounds, room, sender, and approval
  actor are enforced before or within the Hermes turn boundary.
- **Test-first imperative**: PASS. Loader, configuration,
  restart, failure, and rollback tests are explicit pre-implementation tasks.
- **Observability**: PASS. The plan defines operator questions, metadata-only
  platform status, a 120-second sync-freshness threshold, failure categories,
  and induced failure tests.
- **Simple over clever**: PASS. The installed native Hermes Matrix adapter and
  image are reused without maintaining a tenant-specific fork.

## Project Structure

### Documentation (this feature)

```text
specs/015-titus-matrix-channel/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── matrix-runtime.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
tenants/hermes-titus/
├── config/
│   └── config.yaml
├── runtime/
│   ├── load-phase-env.sh
│   ├── prepare-volume.sh
│   ├── run-container.sh
│   ├── start-all.sh
│   └── start-with-secrets.sh
├── scripts/
│   ├── deploy-aegis.sh
│   └── qualify.sh
└── README.md

docs/decisions/
└── 001-titus-matrix-primary-channel.md
```

**Structure Decision**: Matrix is a capability of the existing Titus runtime,
not a new bridge service. Runtime configuration, deployment, and rollback
continue through the existing Titus systemd and named-volume boundary.

## Design Decisions

1. **Native Hermes platform**: Use the bundled Matrix adapter so messages enter
   the same `AIAgent` path as other Hermes messaging platforms. Do not build an
   AgentMail-to-Hermes bridge or a separate Matrix service.
2. **Native authorization semantics**: Use `MATRIX_ALLOWED_USERS` and
   `MATRIX_ALLOWED_ROOMS` from the pinned adapter. This restricts shared rooms
   to the exact approved room and permits DMs only from the exact operator.
3. **Phase-gated activation**: Add `/agents/hermes-titus/matrix` with an explicit
   `MATRIX_ENABLED` switch. The host loader validates exact keys and fixed IDs;
   credentials are omitted from the generated runtime environment while
   disabled.
4. **Fail-closed encryption**: Set E2EE mode to `required`, persist the native
   Matrix store under `/opt/data`, and treat missing dependencies, stale device
   state, or invalid recovery material as channel-fatal.
5. **Stable conversation lane**: Use a room-scoped session with automatic
   synthetic threads disabled. Real Matrix threads remain isolated. Set the
   global busy-input mode to `queue`; explicit `/steer` and `/stop` remain
   operator controls.
6. **Requester-bound approvals**: Keep reaction approvals enabled and require
   the requesting sender. Matrix administrative and cross-room tools stay at
   their default disabled values.
7. **Metadata-only operations**: Extend verification around gateway/platform
   readiness, exact bot identity, encryption, a 120-second sync-freshness
   threshold, and categorized failures without logging event bodies,
   credentials, recovery material, or approval content.
8. **Email separation**: Keep `titus-email-poller.service`, its Phase path, and
   its volume unchanged. Email may acknowledge or queue drafts but does not
   become an agent command transport.

## Implementation Phases

### Phase 1 - Contract and Failing Tests

Create failing tests for Phase key validation, disabled behavior, fixed
security policy, configuration
generation, secret redaction, health states, and volume-preserving rollback.

### Phase 2 - Native Matrix Runtime

Extend Phase loading and runtime configuration, enable the native Matrix
platform conditionally, preserve the crypto store, and extend
local qualification until the new tests pass.

### Phase 3 - Controlled Production Activation

Deploy with `MATRIX_ENABLED=false`, prove the stock image and disabled state,
populate Phase out of band, confirm the room is encrypted and the bot is a
member, enable Matrix, and run authorized, unauthorized, tool, approval,
queue/control, duplicate/edit, and restart smoke tests.

### Phase 4 - Operational Closeout

Induce safe authentication and encryption failures, verify rollback and
recovery, update Titus documentation and the proposed ADR to Accepted, sync the
platform standard and its Aegis copy, append `deploys.log`, and complete the
review gate.

## Rollout and Rollback

1. Store the Matrix account token and recovery key directly in Phase; never
   expose them in chat, repository files, shell arguments, or logs.
2. Keep `MATRIX_ENABLED=false`; qualify the stock ARM64 container with both data
   volumes preserved.
3. Confirm the bot identity, membership in the exact room, and required room
   encryption using redacted diagnostics.
4. Set `MATRIX_ENABLED=true`, restart only `hermes-titus.service`, and verify
   platform connection before sending an instruction.
5. Run the complete live smoke sequence and inspect metadata-only evidence.
6. Rollback by setting `MATRIX_ENABLED=false` and restarting only Titus. Preserve
   `hermes-titus-data` and `titus-email-poller-data`; do not log the bot account
   out or delete the Matrix crypto store.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | The stock native adapter satisfies the accepted one-user, one-shared-room contract | A derived image would add an upgrade-sensitive fork solely to deny the same authorized operator a DM session |
