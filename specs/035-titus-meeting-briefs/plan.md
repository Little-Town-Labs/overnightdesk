# Implementation Plan: Titus Meeting Briefs

**Branch**: `035-titus-sol-luna-meeting-briefs` | **Date**: 2026-08-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/035-titus-meeting-briefs/spec.md`

## Summary

Extend the existing organizer-scoped meeting worker into a reviewed Meeting
Brief pipeline. The worker encrypts raw VTT for a seven-day TTL, screens it,
uses a dedicated Titus session in which Sol delegates the first draft to Luna
and performs bounded QA, sends one
SecurityTeam-screened fixed-recipient email, accepts exact approve/hold commands
from the existing email poller, and invokes a deterministic least-privilege
filer for create-only project notes and Titus Kanban tasks. Recording MP4 is
streamed, hashed, correlated, and discarded. Channel bot and webhook discovery
remain a later feature.

## Technical Context

**Language/Version**: Go 1.24 for workers/private services; pinned Hermes Agent v0.19 Runs/Sessions/delegation APIs and Kanban CLI

**Primary Dependencies**: Existing Graph/SecurityTeam/AgentMail/Hermes HTTP clients, Go standard library cryptography and HTTP, Hermes Runs/Sessions/delegation APIs, and Kanban CLI

**Storage**: Existing version-2 discovery JSON retained for rollback, separate Feature 035 version-1 atomic state, new mode-0600 encrypted raw-custody files, existing Markdown project-knowledge volume, existing Hermes Kanban SQLite via supported CLI

**Testing**: Go unit/race/vet/build, Python runtime/projection contracts, shell syntax, Ringer read-only review, ARM64 hardened-container qualification, controlled Aegis canary

**Target Platform**: ARM64 Linux containers on `aegis-prod`, private `overnightdesk_overnightdesk` Docker network, systemd-managed runtime

**Project Type**: Brownfield production background workers plus one private single-purpose filer service

**Performance Goals**: One bounded analysis at a time; constant-memory recording stream; pollable asynchronous analysis with a 20-minute reconciliation deadline; email/filer calls under 60 seconds; interactive Titus remains available while Luna works

**Constraints**: No public ports, no raw plaintext persistence, fixed recipients, strict schema, 168-hour raw TTL, no model authority, no external actions, disabled-first activation

**Scale/Scope**: Two organizer identities, low meeting volume, one brief and recording verification per discovered meeting, bounded action-item counts

## Constitution Check

### Pre-research gate

- **Untrusted output**: PASS. Transcript, provider responses, model JSON, email
  replies, and project aliases are validated at their boundaries.
- **No direct model authority**: PASS. Titus and Luna may interpret but their
  output is untrusted. The worker never resolves meeting-run tool approvals,
  audits parent tool calls, and only deterministic code can send the fixed
  internal brief or file a human-approved result.
- **Human approval for business records**: PASS. Permanent note and Kanban
  mutations require an exact authenticated Gary/Austin approval. Automatic
  internal draft email is a narrow standing authorization captured in ADR-004.
- **Data boundary**: PASS. Raw transcript uses encrypted private seven-day
  custody plus one temporary dedicated Titus session for background processing;
  the session is deleted and verified after terminal QA, never enters general
  memory, and recording bytes are streamed and discarded.
- **Recoverability**: PASS. Independent activation markers, immutable release
  trees, retained state, scoped restarts, and create-only/idempotent filing.
- **Test first**: PASS. Each vertical slice begins with failing boundary and
  orchestration tests.
- **Durable truth**: PASS. Spec Kit, ADR, runbook, roadmap, deploy log, and
  platform standard are updated through the release.

### Post-design gate

PASS with no constitution exceptions. The existing Titus runtime owns
interpretation as requested; a dedicated session, bounded delegation audit,
strict QA envelope, fixed email policy, and human filing approval preserve the
business-action boundary. The private filer remains the hard mutation boundary.

## Codebase Memory Context

- **Canonical project**: `home-frosted639-src-overnightdesk-suite-overnightdesk`
- **Status**: refreshed at `21fc062`, 12,585 nodes and 23,208 edges
- **Graph seam**: tenant runtime cluster includes `FetchTranscriptContent`,
  `processOneTranscript`, `contentStatusFor`, `claimClean`, and `Reply`.
- **Verified source reads**:
  - `meeting-processor/internal/graph/content.go` owns exact bounded VTT retrieval.
  - `meeting-processor/internal/worker/worker.go` owns lifecycle orchestration and currently marks recordings `not_applicable`.
  - `email-poller/internal/worker/worker.go` exposes a deterministic insertion point after `claimClean` and before `SubmitRun`.
  - `meeting-processor/internal/analyzer/client.go` currently calls the retired analyzer through stateless chat completion.
  - Pinned Hermes source proves Runs bind a persisted session for detached delegation, run completion is not child completion, and Sessions API history/deletion is the reconciliation seam.
  - project knowledge and Kanban live on separate volumes already mounted by Titus, so a narrow filer can receive only approved structured data.

## Architecture

```text
Graph organizer delta
        |
        v
meeting-processor ----stream/hash/discard----> recording MP4
        |
        +----encrypt/TTL----> raw-custody volume
        |
        +----SecurityTeam----> dedicated Titus meeting session
        |                           |
        |                     Sol delegates to Luna
        |                           |
        |                     Sol QA / one remediation
        |                           |
        |                    strict meeting-qa/v1 envelope
        |
        +----SecurityTeam outbound----> AgentMail ----> Gary + Austin
        ^                                               |
        |                                               v
private review API <---- clean exact command ---- email-poller
        |
        +----authenticated approved brief----> deterministic filer
                                                  |           |
                                            project note   Titus Kanban
```

The meeting worker remains the durable workflow owner. Titus owns
interpretation: Luna drafts in a background child and Sol performs the QA gate
using Titus's existing knowledge. The worker accepts only an audited,
schema-valid `QA_PASS` bound to the local meeting/attempt/source and the latest
verified Luna child draft. It discovers child lineage and the observed existing
Luna route without selecting a model, never resolves a Hermes tool approval,
and verifies parent/child not-found reads after terminal QA. The filer can mutate only two
approved storage surfaces and has no transcript, Graph, email, or model
credentials. The email poller recognizes exact commands only after its existing
dirty-to-clean SecurityTeam path.

## Project Structure

### Documentation

```text
specs/035-titus-meeting-briefs/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── delivery.md
├── checklists/requirements.md
└── contracts/
    ├── meeting-brief.schema.json
    ├── meeting-qa.schema.json
    ├── meeting-qa.schema.json
    ├── review-api.openapi.yaml
    └── filer-api.openapi.yaml
```

### Source Code

```text
tenants/hermes-titus/
├── meeting-processor/
│   ├── cmd/titus-meeting-processor/
│   └── internal/
│       ├── analyzer/       # strict brief and QA-envelope validation
│       ├── orchestrator/   # Titus Runs/Sessions client
│       ├── approval/
│       ├── custody/
│       ├── email/
│       ├── filer/
│       ├── graph/
│       ├── state/
│       └── worker/
├── meeting-filer/
│   ├── cmd/titus-meeting-filer/
│   └── internal/{api,filing,kanban,policy}/
├── email-poller/internal/{approval,config,transport,worker}/
└── scripts/
```

**Structure Decision**: Extend the existing workers and add a colocated private
filer service. Do not create a new repository, public API, dashboard surface,
database, queue, webhook receiver, or channel bot in this slice.

## Delivery Strategy

1. Define strict contracts and write failing tests.
2. Scrub legacy free-form handoff output, add rollback-compatible separate state,
   encrypted custody, and streaming recording verification.
3. Replace the analyzer client with the dedicated Titus session state machine,
   Luna draft, Sol QA, bounded remediation, strict envelope validation, and
   verified session deletion.
4. Add fixed-recipient outbound delivery and exact review-command intake.
5. Add deterministic filing and action-task creation.
6. Qualify disabled, deploy, canary Gary, enable filing, prove TTL/restart/
   rollback, merge standards, and update issue 159.

## Observability Questions

1. Which safe stage failed for a specific internal meeting reference?
2. Did any model, email, decision, or filing operation execute more than once?
3. Are any encrypted raw objects past the 168-hour retention deadline?
4. Did recording verification finish without retaining bytes?
5. Is a meeting analysis awaiting Luna, Sol QA, remediation, cleanup, or
   operator review, and did any Titus restart make its attempt unknown?

Signals are bounded structured events and aggregate health counts; no new
public metrics endpoint is justified at current volume. Production canaries
must prove the events themselves are queryable and content-free.

An overdue ciphertext or missing active/referenced custody key is a failed-
closed symptom: deletion sweeps continue, all new meeting transitions stop, and
the existing operator health monitor receives one bounded actionable code.

## Complexity Tracking

| Added surface | Why Needed | Simpler Alternative Rejected Because |
|---------------|------------|-------------------------------------|
| Dedicated Titus meeting session | Lets Titus use existing knowledge while Luna drafts without occupying the interactive conversation | Stateless chat cannot receive detached child completion and a separate analyzer violates the intended Titus ownership/model boundary |
| Private deterministic filer | Keeps Graph/model/email credentials away from project-note and Kanban write authority | Mounting both writable volumes into the meeting worker collapses content-ingestion and business-record authority |
