# Implementation Plan: Titus Telegram-Native Guarded Email Approval

**Branch**: `agent/codex/titus-telegram-email-approval` | **Date**: 2026-08-18 | **Spec**: [spec.md](spec.md)

## Summary

Add a small tenant-owned Hermes approval plugin that escalates only
Telegram-initiated `titus_send_approved_email` calls to Hermes's existing
gateway approval queue. The native Telegram adapter already renders
authorized inline buttons and resolves the waiting session. The guarded MCP
server will treat that gateway decision as the Telegram owner gate and will
retain MCP elicitation for non-Telegram callers.

## Technical Context

**Language/Version**: Python 3.11+ for the tenant plugin and MCP server; Bash/YAML for runtime projection and config.

**Primary Dependencies**: Pinned Hermes `pre_tool_call` hook and
`request_tool_approval` contract; pinned Telegram `send_exec_approval` and
`resolve_gateway_approval` contract; existing FastMCP, guarded email service,
SecurityTeam, and AgentMail integrations.

**Storage**: No new store. Existing content-free guarded-send SQLite ledger
remains authoritative for attempts and provider identities.

**Testing**: Pure policy tests, plugin AST/runtime contract tests, guarded MCP
server tests, config/runtime projection tests, shell syntax, focused Titus
qualification, and source/log secret scans.

**Constraints**: Telegram-only gateway change; one-time approval key per tool
call; fail closed on hook or gateway failure; no provider contract change;
production staging/deployment is not authorized by this feature work.

## Constitution Check

- **Customer/prospect data**: PASS. No new data copy or content ledger is
  introduced; prompts use a short fingerprint and the existing conversation.
- **Security and least privilege**: PASS. The hook gates exactly one mutation,
  uses the existing authorized private-DM callback path, and preserves local
  draft/token validation and provider checks.
- **Owner decides**: PASS. Telegram's native human approval resolves one unique
  tool call; silence, replay, and unauthorized callbacks fail closed.
- **Observability**: PASS. Safe event/result codes remain content-free and the
  plugin must not log tool arguments or tokens.
- **Recoverability**: PASS. Disabling the plugin/channel or restoring the
  existing guarded-email read-only mode is reversible; no production mutation
  is included.

## Architecture Decisions

1. **Reuse the native gateway queue**: the pinned Hermes runtime already has
   the sync-to-async queue and Telegram inline callback implementation, so the
   tenant only supplies a pre-tool policy and runtime projection.
2. **Gate by Telegram session context**: the plugin returns an approval
   directive only when `HERMES_SESSION_PLATFORM=telegram` and the exact guarded
   send tool is being called. Other channels retain their current gate.
3. **Unique approval grain**: the plugin supplies a tool-call-specific rule
   key, preventing `[session]` or `[always]` choices from authorizing a later
   identical email call.
4. **Single gate per Telegram call**: the child MCP server skips its internal
   elicitation only after consuming a fresh content-free handoff marker created
   by the approval hook for the same session and fingerprint; its local
   cryptographic and provider safety checks remain mandatory.

## Project Structure

```text
specs/041-titus-telegram-email-approval/
├── spec.md
├── plan.md
├── tasks.md
├── research.md
├── quickstart.md
├── contracts/telegram-approval.md
└── checklists/requirements.md

tenants/hermes-titus/
├── plugins/approvals/titus_guarded_email/
├── mcp-servers/guarded-agentmail/server.py
├── mcp-servers/guarded-agentmail/tests/test_server_contract.py
├── runtime/prepare-volume.sh
├── skills/agentmail-email/SKILL.md
└── tests/test_telegram_email_approval_contract.py
```

## Delivery Sequence

1. Add the policy and RED tests for exact tool/session matching, content-free
   fingerprinting, and unique approval keys.
2. Add the Hermes plugin manifest and implementation, project it into the
   Titus volume, and enable it in source config.
3. Make the MCP server recognize the already-resolved Telegram gateway gate
   without issuing a second elicitation; retain the non-Telegram default.
4. Update the email skill, README, runbook, contract, quickstart, and ADR.
5. Run focused tests, syntax/config checks, source scans, and review. Do not
   stage secrets, restart production, send email, or change Aegis state.

## Rollback

Source rollback removes the approval plugin from `plugins.enabled` and its
volume projection. Operational rollback is the explicit Feature 025
`rollback-email` transition, which installs the durable read-only marker before
restarting Titus, removes the local guarded mutation server while retaining
hosted read-only inbox tools and the attempt ledger, and verifies the result.
`restore-email` removes the marker only after a healthy read-only restart and
restores the marker if the guarded restart fails. The generic `rollback`
command remains the separate dashboard/OIDC rollback.
