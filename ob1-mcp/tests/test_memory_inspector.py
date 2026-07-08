from datetime import datetime, timezone

import pytest

from tests.test_server_tools import FakeEmbed, FakeGuard, FakeStore, _call, _cfg

from src.server import build


@pytest.mark.asyncio
async def test_inspect_memory_returns_trust_and_usage_context():
    store, embed = FakeStore(), FakeEmbed()
    store.entries[42] = {
        "id": 42,
        "category": "judge_lesson",
        "content": "Validate contracts before adapters",
        "tags": ["judge", "lesson"],
        "is_active": True,
        "provenance": "confirmed",
        "source": "review_candidate:rc-1",
        "runtime": "ob1-mcp",
        "reasoning_model": None,
        "channel": "review_queue",
        "task_id": "task-1",
        "confidence": None,
        "use_policy": "can_use_as_instruction",
        "user_confirmed_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        "supersedes_id": None,
        "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
    }
    store.memory_usage[42] = [
        {
            "decision_id": "dec-1",
            "action_id": "act-1",
            "decision": "allow",
            "used_as": "instruction",
            "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        }
    ]
    store.review_candidates.append(
        {
            "candidate_id": "rc-1",
            "source_decision_id": "dec-source",
            "workspace_id": "ws",
            "project_id": "ob1-mcp",
            "task_id": "task-1",
            "flow_id": None,
            "candidate_kind": "lesson",
            "proposed_content": "Validate contracts before adapters",
            "proposed_category": "judge_lesson",
            "proposed_tags": ["judge", "lesson"],
            "provenance_status": "generated",
            "confidence": None,
            "suggested_use_policy": "requires_confirmation",
            "visibility_scope": "project",
            "review_status": "confirmed",
            "review_priority": "normal",
            "reason": "judge_decision_memory_to_write",
            "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
            "reviewed_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
            "reviewed_by": "gary",
            "result_memory_id": 42,
        }
    )
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(mcp, "inspect_memory", memory_id=42)
    assert out["found"] is True
    assert out["memory"]["id"] == 42
    assert out["automatic_injection_eligible"] is True
    assert out["used_by_decisions"][0]["decision_id"] == "dec-1"
    assert out["review"]["candidate_id"] == "rc-1"
    assert out["warnings"] == []


@pytest.mark.asyncio
async def test_inspect_memory_marks_evidence_only_memory_ineligible():
    store, embed = FakeStore(), FakeEmbed()
    store.entries[7] = {
        "id": 7,
        "category": "decision",
        "content": "A blocked action happened",
        "tags": [],
        "is_active": True,
        "provenance": "generated",
        "source": None,
        "runtime": None,
        "reasoning_model": None,
        "channel": None,
        "task_id": None,
        "confidence": 0.4,
        "use_policy": "can_use_as_evidence",
        "user_confirmed_at": None,
        "supersedes_id": None,
        "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
    }
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(mcp, "inspect_memory", memory_id=7)
    assert out["automatic_injection_eligible"] is False
    assert "NOT_INSTRUCTION_GRADE" in [w["code"] for w in out["warnings"]]
    assert "UNCONFIRMED" in [w["code"] for w in out["warnings"]]


@pytest.mark.asyncio
async def test_inspect_memory_marks_superseded_memory_ineligible():
    store, embed = FakeStore(), FakeEmbed()
    store.entries[1] = {
        "id": 1,
        "category": "decision",
        "content": "Old instruction",
        "tags": [],
        "is_active": False,
        "provenance": "confirmed",
        "source": None,
        "runtime": None,
        "reasoning_model": None,
        "channel": None,
        "task_id": None,
        "confidence": None,
        "use_policy": "can_use_as_instruction",
        "user_confirmed_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        "supersedes_id": None,
        "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
    }
    store.superseding_entries[1] = [
        {
            "id": 2,
            "category": "decision",
            "content": "New instruction",
            "tags": [],
            "is_active": True,
            "provenance": "confirmed",
            "source": None,
            "runtime": None,
            "reasoning_model": None,
            "channel": None,
            "task_id": None,
            "confidence": None,
            "use_policy": "can_use_as_instruction",
            "user_confirmed_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
            "supersedes_id": 1,
            "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        }
    ]
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(mcp, "inspect_memory", memory_id=1)
    assert out["automatic_injection_eligible"] is False
    assert out["superseded_by"][0]["id"] == 2
    assert {"INACTIVE", "SUPERSEDED"}.issubset({w["code"] for w in out["warnings"]})


@pytest.mark.asyncio
async def test_inspect_memory_missing():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(mcp, "inspect_memory", memory_id=999)
    assert out == {"memory_id": 999, "found": False}
