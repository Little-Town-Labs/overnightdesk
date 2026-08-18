# Cross-Artifact Analysis: Titus Telegram-Native Guarded Email Approval

**Analyzed**: 2026-08-18

## Requirement coverage

| Requirement group | Plan/tasks coverage | Evidence surface |
| --- | --- | --- |
| Telegram-only native approval | T001, T002, T004, T005 | approval plugin, config, contract tests |
| Exact one-call binding | T001, T004, T006 | rule-key policy and guarded MCP server |
| Handoff integrity and bypass resistance | T001, T003, T004, T006 | transient marker, denial cleanup, stale expiry, yolo/off fail-closed tests |
| Authorized private-DM resolution | T002, T004, T009 | existing Hermes adapter contract plus runtime tests |
| Existing email safety preserved | T003, T006, T009 | guarded server and Feature 025 regression suite |
| Fail-closed expiry/replay/failure | T001-T003, T004, T009 | policy tests and native queue qualification |
| Content-free observability | T001, T004, T007-T009 | source scans and safe descriptions |
| Reversible runtime projection | T002, T005, T008-T010 | config/install tests and rollback docs |

## Consistency findings

- The spec's MVP is limited to the existing `titus_send_approved_email`
  mutation, the existing Gary private Telegram boundary, and native Hermes
  approval callbacks. The plan and tasks do not add a new service or provider
  surface.
- T004 must use Hermes session context rather than a process-global stale
  environment value when deciding whether a hook applies. The child MCP
  process may use the bridged `HERMES_SESSION_PLATFORM` value only to suppress
  the duplicate elicitation after the outer gate has resolved.
- T004 must generate a fresh rule key for every hook invocation, even when the
  canonical draft fingerprint repeats. This is what makes the native
  `Session`/`Always` compatibility buttons harmless for later calls.
- The spec says “Approve Once” semantically. Hermes's generic plugin approval
  renderer also exposes session/permanent compatibility choices; the unique
  per-call rule key prevents those choices from authorizing another call. This
  is an implementation constraint, not scope expansion.
- T006 must check the Telegram context only after local `validate_approval`
  succeeds, preserving the exact-draft/token boundary before trusting the outer
  approval to proceed to SecurityTeam or AgentMail.

## Scope and risk gate

- Context: brownfield
- Scale: feature
- Risk: sensitive (agent action and external email integration)
- Mutation owner: Sol/lead only; no mutable worker delegation
- Production status: source-only; no Aegis restart, secret change, Telegram
  activation, or email send authorized

## Analysis result

PASS. No blocking contradiction or missing dependency was found. The only
external dependency is the pinned Hermes hook/native Telegram contract; its
symbols were verified read-only in the active production image and are covered
by drift-detection contract tests/documentation. The implementation can begin
with T001-T003.
