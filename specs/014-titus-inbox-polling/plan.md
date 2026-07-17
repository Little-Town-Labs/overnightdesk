# Implementation Plan: Titus Email Inbox Polling

**Branch**: `014-titus-inbox-polling` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

## Summary

Build `titus-email-poller` as a standalone Go service in its own hardened Docker
container on `overnightdesk_overnightdesk`. It reads the existing Titus
AgentMail and OpenRouter values plus polling policy from Phase through a
host-materialized read-only JSON secret. It auto-replies only to Gary and
Austin, queues every other valid human sender as an immutable AgentMail draft,
and accepts one-time approve/reject commands from those same operators.

The Go service—not the Hermes container—owns polling, the durable queue, API
retry/reconciliation, and health. Hermes Titus remains the named agent and
configured model identity. Incoming email never enters the Hermes tool loop,
plugins, or memory.

## Technical Context

**Language/Version**: Go 1.24, static `CGO_ENABLED=0` binary

**Primary Dependencies**: Go standard library; AgentMail REST API; OpenRouter
OpenAI-compatible chat-completions API; Phase CLI on the host

**Storage**: Atomic JSON state at `/data/state.json` on the dedicated
`titus-email-poller-data` Docker volume; AgentMail holds reply drafts

**Testing**: `go test ./...`, shell qualification, container build/smoke tests,
controlled production initialization and health verification

**Target Platform**: Separate Docker container managed by
`titus-email-poller.service` on `aegis-prod`

**Project Type**: Single Go background-worker command

**Performance Goals**: New mail classified within two 60-second polling
intervals; at most 20 new messages processed and 10 pages inspected per cycle

**Constraints**: No published ports; read-only root filesystem; non-root UID;
capabilities dropped; no original bodies or plaintext approval tokens in state
or logs; no Hermes tools/memory; 2 MB HTTP response cap; 15-second API timeout;
disabled by default

**Scale/Scope**: One Titus inbox, two trusted senders/approvers, low-volume MVP

## Constitution Check

- **Spec Kit lifecycle**: PASS. The architecture change is recorded before Go
  implementation and tasks remain traceable to user stories.
- **Repository boundary**: PASS. Code and runtime live under
  `tenants/hermes-titus/email-poller/`; the container is still Titus-owned.
- **Approval boundary**: PASS. Only exact Gary/Austin mail is pre-approved for
  automatic replies. Every other valid human sender needs a one-time decision.
- **Secret handling**: PASS. The host reads Phase; the container receives a
  read-only JSON file. Docker config, source, logs, state, and tests contain no
  secret values.
- **Durable enforcement**: PASS. Exact parsed addresses, atomic state
  transitions, HMAC tokens, deterministic client IDs, and live draft digests
  enforce policy in Go.
- **External integration safety**: PASS. Email becomes bounded model input only;
  no tool, plugin, memory, link, attachment, or infrastructure execution path
  exists.
- **Observability**: PASS. Structured metadata-only events and a local freshness
  file drive Docker/systemd health.
- **Complexity limits**: PASS. Go files remain under 800 lines and functions
  under 50 lines; transport, policy/state, and orchestration are separated.

## Project Structure

```text
tenants/hermes-titus/email-poller/
├── Dockerfile
├── go.mod
├── cmd/titus-email-poller/main.go
├── internal/config/config.go
├── internal/policy/policy.go
├── internal/state/store.go
├── internal/transport/agentmail.go
├── internal/transport/openrouter.go
├── internal/worker/worker.go
├── internal/.../*_test.go
├── runtime/
│   ├── load-phase-config.sh
│   ├── prepare-volume.sh
│   ├── run-container.sh
│   ├── stop-container.sh
│   └── titus-email-poller.service
└── scripts/
    ├── deploy-aegis.sh
    └── qualify.sh
```

**Structure Decision**: The service is an independent process and container,
but remains in the Titus tenant directory because it owns only Titus's mailbox
policy. The Hermes runtime no longer starts or health-checks a poller.

## Design Decisions

1. **Standalone execution boundary**: Go directly calls AgentMail and OpenRouter;
   the container has no Hermes CLI, MCP tools, memory, or Control Tower token.
2. **Atomic JSON state**: One worker owns a compact state document and writes
   `fsync` plus atomic rename. This avoids CGO/database dependencies at MVP
   scale while preserving restart-safe transitions.
3. **Endpoint-specific idempotency**: Trusted replies use deterministic
   `Idempotency-Key` headers. External responses and approval notices use stable
   drafts from deterministic client IDs, then deterministic send keys.
4. **One-time email approval**: A Phase-held HMAC secret derives 256-bit tokens;
   only digests persist, and the first valid operator decision is terminal.
5. **Fail-closed rollout**: Build and deploy disabled, initialize all visible
   mail as preexisting, verify zero sends, remove the provider receive allowlist,
   then enable and restart only the Go service.

## Rollout and Rollback

1. Keep `AGENTMAIL_POLLING_ENABLED=false` in Phase.
2. Build/install `titus-email-poller`, verify disabled health, no ports, the
   OvernightDesk network, non-root execution, and a dedicated volume.
3. Run `initialize` and verify `sends=0` for the current mailbox.
4. Remove the Python poller from Hermes supervision and re-verify Hermes health.
5. Remove AgentMail's receive allowlist so arbitrary senders reach the Go queue.
6. Set polling true, restart only `titus-email-poller.service`, and verify
   freshness, trusted auto-reply behavior, and approval-queue behavior.

Rollback sets polling false, restarts only the Go service, and optionally
restores AgentMail's receive allowlist. Preserve both dedicated state and remote
drafts for review.
