# Tasks: Titus Telegram-Native Guarded Email Approval

## Phase 1 - Contract and tests

- [x] T001 [P] [FR-003,FR-009] Add pure approval-policy helpers and tests for
  Telegram-only matching, content-free short fingerprints, and unique
  per-tool-call rule keys in
  `tenants/hermes-titus/plugins/approvals/titus_guarded_email/`.
- [x] T002 [P] [FR-001,FR-002,FR-004] Add RED contract tests proving the
  repo-owned plugin is enabled, installed, and constrained to the exact
  `titus_send_approved_email` mutation and Telegram session context in
  `tenants/hermes-titus/tests/test_telegram_email_approval_contract.py`.
- [x] T003 [P] [FR-005,FR-006,FR-007] Add RED MCP server tests proving Telegram
  skips the second elicitation while non-Telegram callers still use it in
  `tenants/hermes-titus/mcp-servers/guarded-agentmail/tests/test_server_contract.py`.

## Phase 2 - Implementation

- [x] T004 [FR-001,FR-002,FR-003,FR-004,FR-009] Implement the tenant Hermes
  `pre_tool_call` plugin with fail-closed Telegram matching, safe approval
  description, and a fresh tool-call-specific rule key.
- [x] T005 [FR-010] Add the plugin manifest/config entry and install every
  repo-owned plugin file during `runtime/prepare-volume.sh` without changing
  disabled-first Telegram secret projection.
- [x] T006 [FR-005,FR-006,FR-007,FR-008] Update the guarded MCP server's owner
  gate selection so only explicit Telegram gateway child sessions reuse the
  outer approval; preserve validation, screening, send, readback, and safe
  failures.

## Phase 3 - Documentation and qualification

- [x] T007 [P] [FR-002,FR-006,FR-011] Update the AgentMail skill and Titus README
  to describe native Telegram buttons and remove instructions that imply a
  second technical approval control for Telegram.
- [x] T008 [P] [FR-012] Add the Telegram approval contract, research notes,
  quickstart, and ADR evidence with no credentials or message content.
- [x] T009 [FR-012] Run focused Python tests, shell syntax, YAML parsing, AST
  checks, source secret scans, and existing Titus Telegram/guarded-email
  regression tests.
- [x] T010 [FR-012] Perform bounded code, security, interface, observability,
  and rollback review; record any out-of-scope hardening as follow-up rather
  than widening this feature.
- [x] T011 [FR-010,FR-012] Repair the Titus rollback controls so guarded-email
  rollback and restore are explicit, confirmation-gated, independently
  verified, and fail closed by restoring the read-only marker after a failed
  guarded restart; add regression coverage in
  `tenants/hermes-titus/tests/test_rollback_controls_contract.py`.

## Dependencies and ownership

- T001-T003 are RED setup and may proceed in parallel.
- T004 depends on T001; T005 depends on T002; T006 depends on T003.
- T007-T008 depend on the final contract from T004-T006.
- T009-T011 follow implementation and are lead-owned quality gates.
- No task authorizes production restart, Telegram activation, secret changes,
  provider sends, commit, push, merge, or deployment.
