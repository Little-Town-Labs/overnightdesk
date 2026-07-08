import pytest

from tests.test_server_tools import (
    FakeEmbed,
    FakeGuard,
    FakeStore,
    _call,
    _cfg,
    _valid_action_proposal,
    _valid_judge_decision,
)

from src.server import build


@pytest.mark.asyncio
async def test_code_review_memory_harness_covers_four_decisions():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    outcomes = ["allow", "block", "revise", "escalate"]

    for index, outcome in enumerate(outcomes):
        result = await _run_harness_flow(
            mcp,
            action_id=f"code-review-{index}",
            decision=outcome,
            query="Agent wants to open a PR touching OB1 judge contracts",
            tool_name="github.create_pull_request",
            target_system="github",
            memory_to_write={
                "decisions": [],
                "lessons": [f"Code review harness lesson for {outcome}"],
                "failures": [],
                "constraints": [],
                "open_questions": [],
            },
        )
        assert result["decision"] == outcome
        assert result["review_candidates_created"] == 1

    assert len(store.action_proposals) == 4
    assert len(store.judge_decisions) == 4
    assert len(store.review_candidates) == 4


@pytest.mark.asyncio
async def test_taskflow_work_log_harness_records_supported_handoff():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())

    result = await _run_harness_flow(
        mcp,
        action_id="taskflow-handoff-1",
        decision="allow",
        query="Agent wants to hand off a task with blockers and constraints",
        tool_name="taskflow.handoff",
        target_system="taskflow",
        memory_to_write={
            "decisions": ["TaskFlow handoff was supported by current work log"],
            "lessons": [],
            "failures": [],
            "constraints": ["Handoff must include blockers and unresolved questions"],
            "open_questions": ["Who owns final review?"],
        },
    )

    assert result["decision"] == "allow"
    assert result["review_candidates_created"] == 3
    assert [c["candidate_kind"] for c in store.review_candidates] == [
        "decision",
        "constraint",
        "open_question",
    ]


async def _run_harness_flow(
    mcp,
    *,
    action_id: str,
    decision: str,
    query: str,
    tool_name: str,
    target_system: str,
    memory_to_write: dict[str, list[str]],
):
    await _call(
        mcp,
        "judge_recall",
        request={
            "schema_version": "openbrain.judge.recall.v1",
            "request_id": f"recall-{action_id}",
            "workspace_id": "ws",
            "project_id": "ob1-mcp",
            "task_id": "task-1",
            "flow_id": "flow-1",
            "action_id": action_id,
            "query": {
                "summary": query,
                "action_type": "external_side_effect",
                "tool_name": tool_name,
                "target_system": target_system,
            },
            "entities": {
                "people": [],
                "orgs": [],
                "repos": ["overnightdesk"],
                "files": [],
                "customers": [],
                "systems": [target_system],
                "topics": ["judge"],
            },
            "scope": {
                "visibility": "project",
                "include_unconfirmed": False,
                "include_disputed": False,
                "include_stale": False,
            },
            "limits": {"max_items": 5, "max_tokens": 2000, "recency_days": 180},
            "policy": {"allowed_use_policies": ["can_use_as_instruction"], "require_source_refs": True},
        },
    )
    await _call(
        mcp,
        "save_action_proposal",
        proposal=_valid_action_proposal(
            action_id=action_id,
            idempotency_key=f"proposal-{action_id}",
            tool={"name": tool_name, "kind": "api", "target_system": target_system},
            action={
                "risk_class": "external_side_effect",
                "description": query,
                "target": target_system,
                "arguments_digest": f"sha256:{action_id}",
                "full_arguments_ref": None,
            },
        ),
    )
    return await _call(
        mcp,
        "record_judge_decision",
        decision=_valid_judge_decision(
            action_id=action_id,
            decision_id=f"decision-{action_id}",
            idempotency_key=f"decision-{action_id}",
            decision=decision,
            memory_to_write=memory_to_write,
            provenance={"default_status": "generated", "requires_review": True},
        ),
    )
