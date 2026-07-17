# Tasks: Titus Email Inbox Polling

## Phase 1: Standalone Go Foundation

- [x] T001 Create the Go module and command layout under
  `tenants/hermes-titus/email-poller/`
- [x] T002 [P] Write failing exact-sender, approval-command, HMAC-token,
  automatic-message, and reply-validation tests in `internal/policy/`
- [x] T003 [P] Write failing configuration allowlist/secret/bounds tests in
  `internal/config/`
- [x] T004 Implement policy and configuration packages until T002-T003 pass
- [x] T005 Write failing atomic-state, terminal-transition, and sensitive-field
  absence tests in `internal/state/`
- [x] T006 Implement versioned atomic JSON state and recovery validation

## Phase 2: User Story 1 - Trusted Automatic Reply

- [x] T007 Write failing AgentMail/OpenRouter contract tests with local fake HTTP
  servers in `internal/transport/`
- [x] T008 Implement bounded AgentMail and tool-free OpenRouter clients
- [x] T009 Write failing trusted reply, fallback, duplicate-cycle, burst
  pagination, and ambiguous-send tests in `internal/worker/`
- [x] T010 Implement trusted-message orchestration and metadata-only events

## Phase 3: User Story 2 - Approval Queue

- [x] T011 Write failing external draft, dual-approver notice, approve/reject,
  unauthorized command, changed draft, and first-decision-wins tests
- [x] T012 Implement immutable draft creation and deterministic notification flow
- [x] T013 Implement resumable approval claims, live draft verification, and
  deterministic idempotent sends

## Phase 4: User Story 3 - Lifecycle and Container

- [x] T014 Write failing disabled, initialization, heartbeat, and stale-health
  command tests
- [x] T015 Implement `run`, `run-once`, `initialize`, `health`, and `init-volume`
- [x] T016 Add a multi-stage static `Dockerfile` and local qualification script
- [x] T017 Add strict Phase JSON loader, dedicated-volume preparation, hardened
  Docker run/stop scripts, and `titus-email-poller.service`
- [x] T018 Add Aegis prepare/install/verify/initialize/restart/rollback actions
- [x] T019 Remove Python polling startup, health, config, and tests from the
  Hermes Titus container while retaining its interactive AgentMail skill

## Phase 5: Review and Production

- [x] T020 Update Titus and feature runbooks for the standalone Go boundary
- [x] T021 Run `go test ./...`, race tests, vet, build, shell qualification,
  secret scan, file/function limits, and code-review-and-quality gate
- [x] T022 Deploy the Go container disabled and verify isolation/health
- [x] T023 Initialize the live mailbox and prove zero sends
- [x] T024 Remove AgentMail receive allowlist, enable Go polling, verify live
  trusted behavior and intake, and prove approval-queue behavior in contract tests
- [x] T025 Sync `overnightdesk-platform-standard`, refresh its Aegis copy,
  restart `overnightdesk-ops` if required, and append `deploys.log`
- [x] T026 Commit, push, open/merge the PR as authorized, and verify production
  matches merged `main`

## Dependencies

Policy/config and state precede transport/worker. Worker behavior precedes
containerization. Production order is strict: disabled deploy -> initialization
with zero sends -> provider allowlist removal -> enable/restart. The Hermes
Python poller must be absent before the Go polling flag is enabled.
