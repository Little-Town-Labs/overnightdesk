from pathlib import Path

import pytest

from tests.test_server_tools import (
    FakeEmbed,
    FakeGuard,
    FakeStore,
    _call,
    _cfg,
    _valid_judge_decision,
)

from src.server import build


def test_review_migration_defines_candidate_and_action_tables():
    sql = Path("ob1-mcp/migrations/003_judge_extender_review.sql").read_text()
    assert "CREATE TABLE IF NOT EXISTS ace_memory.review_candidates" in sql
    assert "CREATE TABLE IF NOT EXISTS ace_memory.review_actions" in sql
    assert "candidate_id" in sql
    assert "source_decision_id" in sql
    assert "result_memory_id" in sql


@pytest.mark.asyncio
async def test_record_judge_decision_materializes_review_candidates():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(
        mcp,
        "record_judge_decision",
        decision=_valid_judge_decision(
            decision_id="dec-review",
            idempotency_key="idem-review",
            memory_to_write={
                "decisions": [],
                "lessons": ["Validate contracts before adapters"],
                "failures": [],
                "constraints": ["Generated lessons require review"],
                "open_questions": [],
            },
            provenance={"default_status": "generated", "requires_review": True},
        ),
    )
    assert out["review_candidates_created"] == 2
    assert [c["candidate_kind"] for c in store.review_candidates] == ["lesson", "constraint"]
    assert {c["review_status"] for c in store.review_candidates} == {"pending"}
    assert {c["suggested_use_policy"] for c in store.review_candidates} == {
        "requires_confirmation"
    }


@pytest.mark.asyncio
async def test_list_review_queue_returns_pending_candidates():
    store, embed = FakeStore(), FakeEmbed()
    store.review_candidates.append(
        {
            "candidate_id": "rc-1",
            "source_decision_id": "dec-1",
            "workspace_id": "ws",
            "project_id": "ob1-mcp",
            "task_id": "task-1",
            "flow_id": "flow-1",
            "candidate_kind": "lesson",
            "proposed_content": "Validate contracts before adapters",
            "proposed_category": "judge_lesson",
            "proposed_tags": ["judge", "lesson"],
            "provenance_status": "generated",
            "confidence": None,
            "suggested_use_policy": "requires_confirmation",
            "visibility_scope": "project",
            "review_status": "pending",
            "review_priority": "normal",
            "reason": "judge_decision_memory_to_write",
            "created_at": None,
            "reviewed_at": None,
            "reviewed_by": None,
            "result_memory_id": None,
        }
    )
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(
        mcp,
        "list_review_queue",
        workspace_id="ws",
        project_id="ob1-mcp",
        status="pending",
        limit=10,
    )
    assert out["items"][0]["candidate_id"] == "rc-1"
    assert out["items"][0]["review_status"] == "pending"


@pytest.mark.asyncio
async def test_review_candidate_evidence_only_does_not_create_memory():
    store, embed = FakeStore(), FakeEmbed()
    store.review_candidates.append(_candidate())
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(
        mcp,
        "review_memory_candidate",
        candidate_id="rc-1",
        action="evidence_only",
        reviewer="gary",
        note="Useful history, not a standing instruction",
        new_use_policy="can_use_as_evidence",
    )
    assert out["review_status"] == "evidence_only"
    assert out["result_memory_id"] is None
    assert store.inserted == []
    assert embed.calls == []


@pytest.mark.asyncio
async def test_review_candidate_confirm_creates_instruction_grade_memory_through_guard():
    store, embed, guard = FakeStore(), FakeEmbed(), FakeGuard()
    store.review_candidates.append(_candidate())
    mcp = build(_cfg(), store, embed, guard)
    out = await _call(
        mcp,
        "review_memory_candidate",
        candidate_id="rc-1",
        action="confirm",
        reviewer="gary",
        note="Make this a standing instruction",
    )
    assert guard.content_calls == ["Validate contracts before adapters"]
    assert embed.calls == ["Validate contracts before adapters"]
    assert store.inserted[0]["provenance"] == "confirmed"
    assert store.inserted[0]["use_policy"] == "can_use_as_instruction"
    assert out["review_status"] == "confirmed"
    assert out["result_memory_id"] == store.inserted[0]["id"]


@pytest.mark.asyncio
async def test_review_candidate_rejects_unknown_action():
    store, embed = FakeStore(), FakeEmbed()
    store.review_candidates.append(_candidate())
    mcp = build(_cfg(), store, embed, FakeGuard())
    with pytest.raises(Exception) as exc_info:
        await _call(
            mcp,
            "review_memory_candidate",
            candidate_id="rc-1",
            action="bless",
            reviewer="gary",
        )
    assert "action" in str(exc_info.value)
    assert store.review_actions == []


def _candidate():
    return {
        "candidate_id": "rc-1",
        "source_decision_id": "dec-1",
        "workspace_id": "ws",
        "project_id": "ob1-mcp",
        "task_id": "task-1",
        "flow_id": "flow-1",
        "candidate_kind": "lesson",
        "proposed_content": "Validate contracts before adapters",
        "proposed_category": "judge_lesson",
        "proposed_tags": ["judge", "lesson"],
        "provenance_status": "generated",
        "confidence": None,
        "suggested_use_policy": "requires_confirmation",
        "visibility_scope": "project",
        "review_status": "pending",
        "review_priority": "normal",
        "reason": "judge_decision_memory_to_write",
        "created_at": None,
        "reviewed_at": None,
        "reviewed_by": None,
        "result_memory_id": None,
    }
