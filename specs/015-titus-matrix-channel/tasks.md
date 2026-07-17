# Tasks: Titus Matrix Communication Channel

**Input**: Design documents from `specs/015-titus-matrix-channel/`

**Tests**: Required by FR-025 and the project constitution. Runtime behavior is
qualified before production activation and verified again on Aegis.

## Phase 1: Contract and Preflight

- [x] T001 Specify the exact bot, operator, shared room, E2EE, session, approval,
  secret, recovery, and email-coexistence requirements in `spec.md`.
- [x] T002 Confirm the installed ARM64 image contains the native Matrix plugin,
  `mautrix`, `libolm`, `asyncpg`, `aiosqlite`, and durable crypto-store support.
- [x] T003 Record the native adapter's shared-room and authorized-operator DM
  semantics in `research.md`, `plan.md`, and the runtime contract.
- [x] T004 Capture a read-only production baseline for both Titus services,
  containers, volumes, image, and Phase path.

## Phase 2: Fail-Closed Runtime

- [x] T005 Add failing Matrix Phase-path, secret, policy, config, and production
  verification assertions to `tenants/hermes-titus/scripts/qualify.sh`.
- [x] T006 Implement strict lowercase `/agents/hermes-titus/matrix` loading,
  exact-key validation, disabled omission, fixed identity checks, and
  `TITUS_MATRIX_STATE` in `runtime/load-phase-env.sh`.
- [x] T007 Add disabled-by-default native Matrix configuration and queued busy
  input in `config/config.yaml`.
- [x] T008 Enable Matrix only when the Phase state is ready and pin E2EE,
  session, approval, administration, notice, and 10 MiB media policy in
  `runtime/start-with-secrets.sh`.
- [x] T009 Make shell syntax, static contracts, secret scans, and qualification
  pass.

## Phase 3: Controlled Production Activation

- [x] T010 Extend `scripts/deploy-aegis.sh` to prove exact bot identity, joined
  encrypted room, crypto-store initialization, Docker secret redaction,
  container hardening, volume preservation, and email-poller continuity.
- [x] T011 Deploy with `MATRIX_ENABLED=false` and verify Hermes and email remain
  healthy.
- [x] T012 Resolve the case-sensitive Phase path, preserving the existing access
  token and recovery key without printing their values.
- [x] T013 Set `MATRIX_ENABLED=true`, restart only `hermes-titus.service`, and
  pass redacted production verification.
- [x] T014 Send an authorized room instruction requiring a harmless Control
  Tower read and verify visible activity plus exactly one terminal response.
- [x] T014a Replace the Element-collided device with fresh dedicated Matrix
  device `HERMESTITUS01`, preserve the collided crypto store as a backup, and
  verify the new token/device binding without exposing credentials.
- [x] T014b Add the source-owned Titus identity and fixed-purpose
  `/opt/data/bin/control-tower-session` helper, then verify an authenticated
  Matrix-originated `/v1/session` read without exposing the bearer token.
- [ ] T015 Verify a follow-up retains the room session and a real Matrix thread
  remains isolated.
- [ ] T016 Verify an unauthorized sender and unapproved shared room create zero
  agent turns; verify an authorized-user DM uses a separate session.

## Phase 4: Controls and Recovery

- [ ] T017 Verify queue, status, steer, stop, requester-bound approve-once, and
  deny behavior in the encrypted room.
- [ ] T018 Verify restart continuity, duplicate/edit/old-event suppression, and
  sync recovery without deleting the crypto store.
- [ ] T019 Exercise reversible invalid-token, lost-membership, and required-E2EE
  failures, restore the healthy state, and record metadata-only evidence.
- [ ] T020 Verify rollback disables Matrix while preserving
  `hermes-titus-data`, `titus-email-poller-data`, the bot session, and email
  health; then restore the active channel.

## Phase 5: Durable Closeout

- [x] T021 Document Phase records, channel behavior, security policy,
  activation, verification, and recovery in `tenants/hermes-titus/README.md`.
- [x] T022 Accept ADR-001 with the implemented stock-adapter decision.
- [x] T023 Run the complete code-review-and-quality gate and final qualification.
- [x] T024 Update `../overnightdesk-platform-standard/WHAT/hermes.yaml`,
  `WHAT/services.yaml`, `WHAT/secrets.yaml`, `WHAT/network.yaml`, and
  `HOW/deployment.md`; validate, commit, push, refresh Aegis, and restart
  `overnightdesk-ops` if required by its runbook.
- [x] T025 Append the production record to `../deploys.log` and capture final
  evidence in `quickstart.md`.
- [x] T026 Route Titus through `x-ai/grok-4.3` with medium Hermes reasoning,
  restart only Titus, and pass Matrix, Control Tower, AgentMail, memory, and
  hardening verification.
- [x] T027 Route Hermes sub-agent delegation through `x-ai/grok-build-0.1`,
  preserve the vision slot until a compatible model is approved, and pass the
  complete production verifier after a Titus-only restart.

## Current Checkpoint

The native Matrix MVP is active and passes identity, membership, encryption,
crypto-store, hardening, service-continuity, agent identity, encrypted operator
intake, visible processing, authenticated Control Tower read, and terminal-
response verification. Grok main/delegation routing is active and verified. P2
controls and P3 induced-failure drills remain follow-up tasks.
