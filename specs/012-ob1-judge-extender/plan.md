# Implementation Plan: OB1 Judge Extender

**Branch**: `012-ob1-judge-extender` | **Date**: 2026-07-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-ob1-judge-extender/spec.md`

## Summary

Extend `ob1-mcp` from provenance-aware memory plus basic judge write-back into a governed judge continuity layer. The implementation remains MCP-first and builds on existing `ace_memory` storage, adding contract validation, a policy-aware `judge_recall` tool, DB-backed review candidates, an inspector read path, and local golden harnesses.

## Technical Context

**Language/Version**: Python 3.x for `ob1-mcp`

**Primary Dependencies**: FastMCP, Pydantic, psycopg, psycopg-pool, pytest

**Storage**: PostgreSQL `ace_memory` schema in tenet0-postgres; tests use the existing fake in-memory store pattern

**Testing**: pytest under `ob1-mcp/tests`

**Target Platform**: Linux container on aegis-prod, local WSL development

**Project Type**: MCP web service

**Performance Goals**: Recall defaults should cap result count and token budget; new validation must add negligible local overhead relative to embedding and database calls.

**Constraints**: Preserve existing MCP tool behavior, existing provenance values, existing `confirmed` semantics, existing idempotency keys, and existing deployed migrations. Do not store raw transcripts, model reasoning traces, or full tool arguments by default.

**Scale/Scope**: One OB1 service, one Postgres schema, local harnesses for two runtime scenarios, no production adapter rollout in this feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Data is sacred: PASS. The plan keeps compact judgment events, rejects raw transcripts and secret-like payloads, and relies on existing guard behavior.
- Security is a feature: PASS. Validation happens at MCP boundaries; unsafe payloads are rejected before storage.
- The ops agent acts; the owner decides: PASS. Generated and inferred lessons require review before instruction-grade use.
- Simple over clever: PASS. MCP-first, additive storage, no new orchestrator or runtime layer.
- Owner time protected: PASS. Inspector and review queue are designed to make future debugging and approvals explicit.
- Platform quality drives retention: PASS. Golden tests and quickstart keep the workflow verifiable before production rollout.

Post-design re-check: PASS. The data model and contracts preserve existing OB1 boundaries and avoid runtime-specific orchestration logic.

## Project Structure

### Documentation (this feature)

```text
specs/012-ob1-judge-extender/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── mcp-tools.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
ob1-mcp/
├── migrations/
│   └── 003_judge_extender_review.sql
├── src/
│   ├── db.py
│   ├── judge_contracts.py
│   └── server.py
└── tests/
    ├── test_judge_contracts.py
    ├── test_judge_review_queue.py
    ├── test_memory_inspector.py
    ├── test_judge_harnesses.py
    └── test_server_tools.py
```

**Structure Decision**: Keep all implementation inside `ob1-mcp` because existing judge storage primitives and tests already live there. Use documentation under `specs/012-ob1-judge-extender/` as the durable implementation guide.

## Architecture Decisions

- MCP remains the first integration surface. REST endpoints can wrap these contracts later.
- OB1 remains a continuity layer. It does not execute tools, schedule work, or own judge engines.
- Validation models live in `ob1-mcp/src/judge_contracts.py` so both server tools and unit tests share contract semantics.
- Review candidates get durable DB storage because review state, actions, and resulting memory links must survive retries and restarts.
- Inspector is a read model assembled from memory entries, judge decisions, review candidates, review actions, and supersession links.
- Runtime examples start as local pytest harness fixtures, not production adapters.

## Phase 0 Research

See [research.md](research.md).

## Phase 1 Design

See:

- [data-model.md](data-model.md)
- [contracts/mcp-tools.md](contracts/mcp-tools.md)
- [quickstart.md](quickstart.md)

## Complexity Tracking

No constitution violations identified.
