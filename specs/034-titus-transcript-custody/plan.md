# Implementation Plan: Titus Transcript Custody

**Branch**: `034-titus-transcript-custody` | **Date**: 2026-08-01 | **Spec**: [spec.md](spec.md)

## Summary

Extend the deployed meeting processor instead of adding another scheduler. For
each newly discovered transcript, retrieve bounded WebVTT into memory, send it
to SecurityTeam's private authenticated scan endpoint in a new stateless
block-on-review mode, and submit only the screened wrapper to Titus through a
stateless authenticated chat-completions request. Persist the bounded Titus
Markdown result and cryptographic provenance in the existing private worker
state and derived handoff. Raw and screened transcript input is never written.

## Technical Context

**Languages**: Go 1.24 for the meeting processor; TypeScript/Node 22 for the
small SecurityTeam contract extension

**Dependencies**: Standard-library HTTP clients; existing Microsoft Graph
client-credentials source; existing SecurityTeam `/scan-inbound`; existing
Hermes 0.19 authenticated API server

**Storage**: Existing `titus-meeting-processor-data` only. Version-2 JSON state
stores protected provider IDs, digests, lifecycle metadata, and bounded Titus
output. Raw and screened transcript inputs have zero durable retention.

**Target**: ARM64 Aegis Docker services managed by systemd; private
`overnightdesk_overnightdesk` network; no published ports

**Performance bounds**: One unprocessed transcript per cycle; 1,000,000 raw
bytes; 1,250,000 SecurityTeam response bytes; 64 KiB Titus output; 30-second
Graph/SecurityTeam requests; 180-second Titus request; sequential execution

## Constitution Check

- **Spec Kit lifecycle**: PASS. Spec, plan, research, contracts, tasks,
  consistency analysis, Ringer gate, TDD, review, and rollout evidence are
  required.
- **Brownfield architecture**: PASS. Codebase-memory graph results were verified
  against the meeting worker, SecurityTeam pipeline, and Hermes client source.
- **Data minimization**: PASS. Raw VTT is memory-only and screened input is not
  persisted or placed in a reusable Hermes session.
- **Trust boundary**: PASS. SecurityTeam remains the only path that converts
  external content into Titus-eligible input.
- **Hermes boundary**: PASS with explicit risk. Official Hermes documentation
  confirms API-server runs retain the full toolset and additive instructions do
  not remove tools. The design therefore requires SecurityTeam transformation,
  stateless submission, fixed no-action instructions, and existing approval
  policy; no raw transcript reaches Hermes.
- **Secrets**: PASS. The Phase service token stays host-only; Graph,
  SecurityTeam, and Hermes credentials are projected in a root-owned 0440 file
  only while content is active and never enter container environment metadata.
- **Availability**: PASS. Metadata discovery commits before content processing,
  and content failure cannot roll back Graph cursors or completed results.
- **Rollback**: PASS. A host marker disables content independently while
  retaining discovery and derived state.
- **Recording scope**: PASS. Recording discovery remains unchanged; binary
  recording content is explicitly excluded.

## Architecture

```text
Graph transcript /content
        |
        | bounded text/vtt, memory only
        v
titus-meeting-processor
        |
        | authenticated source=api, approvalMode=block
        v
SecurityTeam /scan-inbound
        |
        | screened external-content wrapper only
        v
Titus /v1/chat/completions (stateless, no session key)
        |
        | bounded Markdown
        v
private state v2 + derived handoff
```

## Repository Changes

### `overnightdesk`

- Extend meeting-processor config, Graph client, state migration, content
  orchestration, SecurityTeam client, Titus client, health/handoff, CLI, runtime
  loader, deployment lifecycle, tests, runbook, README, ADR, and roadmap.

### `overnightdesk-securityteam`

- Add optional `approvalMode: "block"` to `/scan-inbound`.
- Preserve current queue behavior when omitted.
- In block mode, any approval-required input returns blocked without invoking
  the approval adapter or retaining the content.

## Delivery Increments

1. Add the backward-compatible SecurityTeam block-on-review contract and deploy
   it before content activation.
2. Add failing transcript route/content, state migration, security, Titus,
   orchestration, redaction, and runtime tests.
3. Implement memory-only content retrieval and screening while leaving the
   activation marker absent.
4. Implement stateless Titus analysis and bounded derived handoff.
5. Qualify locally and on ARM64, deploy disabled, enable content, process Gary,
   verify restart idempotency, and synchronize the platform standard.

## Rollout and Rollback

1. Merge and deploy the SecurityTeam compatibility change; run a harmless
   block-mode canary that proves no queue write.
2. Merge the meeting-processor change and install it with content disabled.
3. Verify version-1 state migration, all four metadata cursors, absence of
   content credentials, and no content calls.
4. Create the root-owned activation marker through the reviewed deployment
   action and restart only `titus-meeting-processor`.
5. Observe one Gary transcript reach `processed`, inspect only safe aggregate
   evidence, and verify Titus/Teams/Matrix/email continuity.
6. Restart only the meeting processor and prove zero duplicate processing.
7. Roll back content by removing the marker and restarting only the meeting
   processor. Preserve all state and keep metadata discovery active.
