# Requirements Checklist: Titus Meeting Briefs

**Purpose**: Validate security, authority, retention, and operational completeness before implementation and release.
**Created**: 2026-08-01
**Feature**: [spec.md](../spec.md)

## Product Contract

- [x] CHK001 Fixed recipients are exactly Gary and Austin.
- [x] CHK002 Raw transcript retention is exactly seven days and recording retention is zero.
- [x] CHK003 Approval and hold commands are exact and either authorized owner may decide.
- [x] CHK004 Known projects receive internal notes; unknown projects and all internal actions receive Kanban tracking.
- [x] CHK005 External commitments become internal work only and no external execution is authorized.
- [x] CHK006 Channel bot and webhook/subscription work are explicitly separated.

## Trust and Data Boundaries

- [x] CHK007 Model output is strict JSON and untrusted until deterministic validation.
- [x] CHK008 Hermes analysis has a hard no-tool/no-memory/no-session runtime boundary.
- [x] CHK009 Raw transcript is encrypted before durable write and plaintext never enters general state or telemetry.
- [x] CHK010 Filer authority is separated from Graph, email, and model credentials.
- [x] CHK011 Project paths and Kanban boards come only from exact operator configuration.
- [x] CHK012 Email commands pass sender policy and SecurityTeam before deterministic parsing.
- [x] CHK012A Legacy free-form output is scrubbed and Feature 035 state is rollback-compatible with the version-2 discovery reader.
- [x] CHK012B Review actor is derived from a signed sender fingerprint rather than accepted from request data.

## Interface Quality

- [x] CHK013 Meeting Brief JSON Schema rejects unknown fields and bounds every collection/string.
- [x] CHK014 Review and filer APIs use bearer authentication, idempotency, consistent error shapes, and typed requests/results.
- [x] CHK015 Lifecycle transitions and terminal conflict behavior are explicit.
- [x] CHK016 Provider retries and ambiguous outcomes have readback/idempotency rules.
- [x] CHK016A Private API and Kanban idempotency keys have exact committed byte derivations and conflict behavior.
- [x] CHK016B Semantic string/date/timestamp validation and untrusted quoted-data rendering are deterministic.

## Operations

- [x] CHK017 Deployment is disabled-first with independent processing and filing gates.
- [x] CHK018 Rollback preserves state/ciphertext and avoids unrelated service restarts.
- [x] CHK019 On-call questions map to content-free structured events and aggregate health.
- [x] CHK019A Overdue ciphertext or missing keys stop new transitions while deletion sweeps and actionable safe health continue.
- [x] CHK020 Gary-only production acceptance is explicit while Austin is unavailable.
- [x] CHK021 Platform-standard, roadmap, issue, deploy-log, and follow-on channel work are closeout requirements.

## Implementation Gate

- [x] CHK022 Read-only Ringer architecture/security review has no unresolved Critical or Required finding.
- [x] CHK023 Every functional requirement maps to at least one executable test or production acceptance step in `tasks.md`.
- [ ] CHK024 Production Phase configuration is present and verified without exposing values.
- [ ] CHK025 Final Sol quality gate and production canary pass before issue closeout.
