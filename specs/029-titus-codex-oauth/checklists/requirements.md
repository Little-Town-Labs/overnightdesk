# Requirements Checklist: Titus Codex OAuth Migration

**Purpose**: Validate specification completeness before planning and
implementation.
**Created**: 2026-07-26
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] CHK001 The specification describes user and operator outcomes without
  prescribing code structure.
- [x] CHK002 Every user story is independently testable and prioritized.
- [x] CHK003 Scope explicitly excludes identity, authority, route, volume,
  channel, tool, and memory-backend changes.
- [x] CHK004 Assumptions and external provider dependencies are stated.

## Requirement Completeness

- [x] CHK005 The primary provider, model, base URL, and reasoning effort are
  exact and testable.
- [x] CHK006 The delegation provider, model, base URL, effort, and execution
  bounds are exact and testable.
- [x] CHK007 OAuth ownership, active-provider, auth-mode, and secret-handling
  requirements are explicit.
- [x] CHK008 The independent memory LLM and embedding projections are explicit.
- [x] CHK009 Rollback, observation, and unrelated-runtime protections are
  explicit.
- [x] CHK010 No unresolved clarification marker remains.

## Acceptance Coverage

- [x] CHK011 Success criteria cover primary inference, delegation, memory,
  health, observation, restart isolation, and secret scanning.
- [x] CHK012 Failure cases cover invalid OAuth, subscription limits, missing
  memory settings, unsafe ordering, and accidental secret output.
- [x] CHK013 Production canaries are constrained to read-only or no-tool
  operations.

## Notes

- Specification validation passed on 2026-07-26.
- Live preflight established the Walter/Mitchel pattern and identified the
  primary-model/memory-model coupling addressed by FR-007 through FR-009.
