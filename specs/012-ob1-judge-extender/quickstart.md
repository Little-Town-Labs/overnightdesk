# Quickstart: OB1 Judge Extender

This quickstart defines the local verification path for the feature. It should run without live production services.

## Prerequisites

- Work from `overnightdesk/`.
- Install OB1 dev dependencies if needed:

```bash
python3 -m venv ob1-mcp/.venv
ob1-mcp/.venv/bin/pip install -r ob1-mcp/requirements-dev.txt
```

## Baseline Verification

Run the current OB1 tests before implementation:

```bash
ob1-mcp/.venv/bin/pytest -q ob1-mcp/tests
```

Expected result: all existing tests pass.

## MVP Flow

After implementing the first slice, verify:

```bash
ob1-mcp/.venv/bin/pytest -q ob1-mcp/tests/test_judge_contracts.py ob1-mcp/tests/test_server_tools.py
```

The tests must prove:

- valid action proposals are accepted and idempotent
- invalid action proposals are rejected before storage
- valid judge decisions are accepted and idempotent
- invalid judge decisions are rejected before storage
- `judge_recall` returns only allowed memory by default
- generated and inferred memories are not injected as instructions by default

## Review Queue Flow

After implementing review queue storage:

```bash
ob1-mcp/.venv/bin/pytest -q ob1-mcp/tests/test_judge_review_queue.py
```

The tests must prove:

- generated decision lessons create pending review candidates
- pending candidates are not instruction-grade
- confirm creates instruction-grade memory through a deliberate review action
- evidence-only and restricted actions never create instruction-grade memory

## Inspector Flow

After implementing the inspector:

```bash
ob1-mcp/.venv/bin/pytest -q ob1-mcp/tests/test_memory_inspector.py
```

The tests must prove:

- source and provenance are visible
- related decisions and review status are visible
- inactive, superseded, stale, disputed, or restricted memory is clearly marked as not eligible for automatic injection

## Golden Harness Flow

After implementing fixtures:

```bash
ob1-mcp/.venv/bin/pytest -q ob1-mcp/tests/test_judge_harnesses.py
```

The tests must run local Code Review Memory and TaskFlow Work Log fixtures through recall, proposal, decision, write-back, and review candidate creation.
