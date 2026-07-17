# Implementation Plan: Titus Email Inbox Polling

**Branch**: `014-titus-inbox-polling` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/014-titus-inbox-polling/spec.md`

## Summary

Add a supervised, email-only polling worker to the existing Hermes Titus
container. The worker reads AgentMail through its REST API, auto-replies only to
the two exact pre-approved operator addresses, and creates a durable AgentMail
draft plus email approval request for every other sender. Incoming email is
sent to OpenRouter through a separate tool-free and memory-free completion
request. SQLite state on the existing named volume provides restart safety,
keyed one-time approvals, and idempotent state transitions.

The production rollout is fail-closed: Phase configuration starts disabled,
the existing mailbox is initialized as preexisting, worker health is verified,
the AgentMail receive allowlist is removed, and polling is then enabled.

## Technical Context

**Language/Version**: Python 3.12 in `overnightdesk/hermes-agent:0.18.0-coder`

**Primary Dependencies**: Python standard library; AgentMail REST API;
OpenRouter OpenAI-compatible chat-completions API; Phase CLI on the host

**Storage**: SQLite at `/opt/data/agentmail-poller/state.db` on
`hermes-titus-data`; AgentMail drafts hold proposed external replies

**Testing**: Python `unittest`, shell syntax/contract qualification, controlled
production initialization and health verification

**Target Platform**: Rootless-in-container Linux runtime managed by systemd and
Docker on `aegis-prod`

**Project Type**: Supervised background worker inside an existing tenant runtime

**Performance Goals**: New mail classified within two 60-second polling
intervals; at most 20 new messages and ten mailbox pages inspected per cycle

**Constraints**: No published ports; read-only root filesystem; one CPU/two GiB
container budget; no original email bodies or plaintext approval tokens in
durable state or logs; no model tools or memory; bounded 15-second API calls;
polling disabled by default

**Scale/Scope**: One Titus inbox, two trusted senders/approvers, low-volume MVP

## Constitution Check

*GATE: Passed before research and re-checked after design.*

- **Spec Kit lifecycle**: PASS. Specification, clarification record, research,
  data model, contracts, tasks, and analysis precede implementation.
- **Repository boundary**: PASS. Titus-owned runtime, tests, skill, and runbook
  changes remain under `tenants/hermes-titus/`; platform facts are synchronized
  separately in `overnightdesk-platform-standard` after deployment.
- **Approval boundary**: PASS. The user's standing approval is limited to exact
  auto-replies to Gary and Austin. Every other sender needs a one-time decision
  from one of those addresses.
- **Secret handling**: PASS. Phase injects credentials at runtime; source, logs,
  state, approval notices, and tests contain no credential values.
- **Durable enforcement**: PASS. Exact sender checks, SQLite uniqueness/state
  transitions, one-time token hashes, and draft verification enforce policy in
  code rather than prompt text.
- **External integration safety**: PASS. Incoming content cannot reach Hermes
  tools or memory. AgentMail and OpenRouter calls use bounded timeouts, stable
  client identifiers, and metadata-only error evidence.
- **Observability**: PASS. Structured events plus a freshness file expose
  disabled, healthy, and stale states without email content.
- **Validation**: PASS. TDD covers classification, approval, idempotency,
  persistence, and API orchestration before production rollout.

## Project Structure

### Documentation (this feature)

```text
specs/014-titus-inbox-polling/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── email-polling.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
tenants/hermes-titus/
├── runtime/
│   ├── agentmail_policy.py
│   ├── agentmail_poller.py
│   ├── agentmail_transport.py
│   ├── agentmail-poller-health.sh
│   ├── load-phase-env.sh
│   ├── prepare-volume.sh
│   ├── run-container.sh
│   └── start-all.sh
├── tests/
│   ├── test_agentmail_policy.py
│   └── test_agentmail_poller.py
├── skills/agentmail-email/SKILL.md
├── scripts/qualify.sh
└── README.md
```

**Structure Decision**: Extend the existing tenant runtime rather than create a
new service or image. Pure policy/state logic is separated from transport and
poll-loop orchestration so security decisions are directly testable.

## Design Decisions

1. **Tool-free reply generation**: Call OpenRouter directly with a fixed system
   policy and no tools, plugins, agent memory, or conversation history. This is
   a hard execution boundary for untrusted email content.
2. **Draft-before-approval**: Create an AgentMail reply draft for untrusted mail,
   notify both approvers with its exact text, and send only that verified draft.
3. **Strict email command**: Accept only a complete first non-empty line matching
   `APPROVE|REJECT <QUEUE_ID> <TOKEN>` from an exact authorized mailbox.
4. **State before side effect**: Reserve deterministic client identifiers and
   durable states before remote creates/sends. Reconciliation can recover remote
   success after a local timeout without issuing a different side effect.
5. **Safe bootstrap**: Initialization records all currently visible messages as
   `preexisting`; activation is never the first operation against a live inbox.

## Rollout and Rollback

1. Create `/agents/hermes-titus/email` in Phase with polling disabled.
2. Deploy source/runtime changes and verify the existing container remains
   healthy with `poller_state=disabled`.
3. Run the one-shot initialization command inside Titus and verify zero sends.
4. Remove the two AgentMail receive-allow entries so outside mail can be queued.
5. Enable polling in Phase, restart only `hermes-titus.service`, and verify
   worker freshness and provider/model health.
6. Perform a trusted-sender smoke test and inspect queue behavior with a
   non-delivering fixture if no authorized third-party test address is supplied.

Rollback sets `AGENTMAIL_POLLING_ENABLED=false`, restarts Titus, verifies a
healthy disabled state, and may restore the AgentMail receive allowlist. SQLite
state and AgentMail drafts are preserved for operator review.
