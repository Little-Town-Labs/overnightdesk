"""End-to-end tool contract tests using an in-memory fake Store.

Verifies the MCP tools wired by src.server.build:
  * pass new provenance fields through to the store on save
  * surface provenance/task fields back on read
  * route confirm / supersede / forget correctly
  * forward filter args (min_provenance, task_id) to the store

We do not exercise the FastMCP transport layer here — that's covered by the
healthz integration test on aegis-prod. Here we call the registered tool
callables directly via the FastMCP tool registry.
"""

from datetime import datetime, timezone
from typing import Any

import pytest

from src.config import Config
from src.guard import GuardRejection
from src.server import build


class FakeStore:
    def __init__(self) -> None:
        self.inserted: list[dict[str, Any]] = []
        self.search_calls: list[dict[str, Any]] = []
        self.list_calls: list[dict[str, Any]] = []
        self.confirmed_ids: list[int] = []
        self.superseded: list[dict[str, Any]] = []
        self.forgotten: list[tuple[int, bool]] = []
        self.action_proposals: list[dict[str, Any]] = []
        self.judge_decisions: list[dict[str, Any]] = []
        self.review_candidates: list[dict[str, Any]] = []
        self.review_actions: list[dict[str, Any]] = []
        self.entries: dict[int, dict[str, Any]] = {}
        self.memory_usage: dict[int, list[dict[str, Any]]] = {}
        self.superseding_entries: dict[int, list[dict[str, Any]]] = {}
        self._next_id = 100

    async def insert_entry(self, **kwargs):
        self._next_id += 1
        row = {
            "id": self._next_id,
            "is_active": True,
            "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
            "user_confirmed_at": None,
            "supersedes_id": kwargs.get("supersedes_id"),
            "use_policy": kwargs.get("use_policy"),
            **{k: v for k, v in kwargs.items() if k not in ("embedding", "embedding_model")},
        }
        self.inserted.append(row)
        return row

    async def search(self, **kwargs):
        self.search_calls.append(kwargs)
        return [
            {
                "id": 1,
                "category": "decision",
                "content": "match",
                "tags": ["x"],
                "is_active": True,
                "provenance": "confirmed",
                "source": None,
                "runtime": None,
                "reasoning_model": None,
                "channel": None,
                "task_id": kwargs.get("task_id"),
                "confidence": None,
                "use_policy": "can_use_as_instruction",
                "user_confirmed_at": None,
                "supersedes_id": None,
                "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
                "updated_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
                "similarity": 0.42,
            }
        ]

    async def list_entries(self, **kwargs):
        self.list_calls.append(kwargs)
        return []

    async def confirm(self, entry_id):
        self.confirmed_ids.append(entry_id)
        if entry_id < 0:
            return None
        return {
            "id": entry_id,
            "category": "decision",
            "content": "x",
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
            "supersedes_id": None,
            "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        }

    async def get_entry(self, entry_id):
        return self.entries.get(entry_id)

    async def supersede(self, **kwargs):
        if kwargs["old_id"] < 0:
            raise LookupError(f"entry {kwargs['old_id']} does not exist")
        self.superseded.append(kwargs)
        self._next_id += 1
        return {
            "id": self._next_id,
            "category": kwargs.get("category") or "decision",
            "content": kwargs["new_content"],
            "tags": kwargs.get("tags") or [],
            "is_active": True,
            "provenance": kwargs.get("provenance", "generated"),
            "source": kwargs.get("source"),
            "runtime": kwargs.get("runtime"),
            "reasoning_model": kwargs.get("reasoning_model"),
            "channel": kwargs.get("channel"),
            "task_id": kwargs.get("task_id"),
            "confidence": kwargs.get("confidence"),
            "use_policy": kwargs.get("use_policy"),
            "user_confirmed_at": None,
            "supersedes_id": kwargs["old_id"],
            "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        }

    async def forget(self, entry_id, hard):
        self.forgotten.append((entry_id, hard))
        return True

    async def stats(self):
        return {
            "total": 5,
            "active": 4,
            "embeddings": 5,
            "categories": 2,
            "by_provenance": {"confirmed": 2, "inferred": 2},
        }

    async def insert_action_proposal(self, proposal):
        self.action_proposals.append(proposal)
        action = proposal.get("action") or {}
        tool = proposal.get("tool") or {}
        return {
            "id": 1,
            "proposal_id": proposal.get("proposal_id") or proposal["action_id"],
            "schema_version": proposal["schema_version"],
            "workspace_id": proposal["workspace_id"],
            "project_id": proposal.get("project_id"),
            "task_id": proposal.get("task_id"),
            "flow_id": proposal.get("flow_id"),
            "action_id": proposal["action_id"],
            "idempotency_key": proposal["idempotency_key"],
            "risk_class": action.get("risk_class") or proposal.get("risk_class"),
            "tool_name": tool.get("name") or proposal.get("tool_name"),
            "target_system": tool.get("target_system") or proposal.get("target_system"),
            "proposal": proposal,
            "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        }

    async def insert_judge_decision(self, decision_doc):
        self.judge_decisions.append(decision_doc)
        judge = decision_doc.get("judge") or {}
        provenance = decision_doc.get("provenance") or {}
        return {
            "id": 2,
            "decision_id": decision_doc["decision_id"],
            "schema_version": decision_doc["schema_version"],
            "workspace_id": decision_doc["workspace_id"],
            "project_id": decision_doc.get("project_id"),
            "task_id": decision_doc.get("task_id"),
            "flow_id": decision_doc.get("flow_id"),
            "action_id": decision_doc["action_id"],
            "proposal_id": decision_doc.get("proposal_id"),
            "idempotency_key": decision_doc["idempotency_key"],
            "decision": decision_doc["decision"],
            "confidence": decision_doc.get("confidence"),
            "judge_kind": judge.get("kind"),
            "decision_doc": decision_doc,
            "memory_used": decision_doc.get("memory_used") or [],
            "memory_to_write": decision_doc.get("memory_to_write") or {},
            "requires_review": provenance.get("requires_review", True),
            "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        }

    async def create_review_candidates_for_decision(self, decision_row):
        memory_to_write = decision_row.get("memory_to_write") or {}
        created = []
        kind_map = {
            "decisions": "decision",
            "lessons": "lesson",
            "failures": "failure",
            "constraints": "constraint",
            "open_questions": "open_question",
        }
        for field, kind in kind_map.items():
            for index, content in enumerate(memory_to_write.get(field) or []):
                candidate = {
                    "candidate_id": f"{decision_row['decision_id']}:{field}:{index}",
                    "source_decision_id": decision_row["decision_id"],
                    "workspace_id": decision_row["workspace_id"],
                    "project_id": decision_row.get("project_id"),
                    "task_id": decision_row.get("task_id"),
                    "flow_id": decision_row.get("flow_id"),
                    "candidate_kind": kind,
                    "proposed_content": content,
                    "proposed_category": f"judge_{kind}",
                    "proposed_tags": ["judge", kind],
                    "provenance_status": "generated",
                    "confidence": None,
                    "suggested_use_policy": "requires_confirmation",
                    "visibility_scope": "project",
                    "review_status": "pending",
                    "review_priority": "normal",
                    "reason": "judge_decision_memory_to_write",
                    "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
                    "reviewed_at": None,
                    "reviewed_by": None,
                    "result_memory_id": None,
                }
                self.review_candidates.append(candidate)
                created.append(candidate)
        return created

    async def list_review_candidates(self, workspace_id, project_id, status, limit):
        rows = [
            c
            for c in self.review_candidates
            if c["workspace_id"] == workspace_id
            and (project_id is None or c.get("project_id") == project_id)
            and (status is None or c["review_status"] == status)
        ]
        return rows[:limit]

    async def get_review_candidate(self, candidate_id):
        for candidate in self.review_candidates:
            if candidate["candidate_id"] == candidate_id:
                return candidate
        return None

    async def apply_review_action(
        self,
        *,
        candidate_id,
        action,
        reviewer,
        note,
        edited_content,
        new_use_policy,
        new_scope,
        result_memory_id,
    ):
        candidate = await self.get_review_candidate(candidate_id)
        if candidate is None:
            return None
        status = {
            "confirm": "confirmed",
            "edit": "pending",
            "evidence_only": "evidence_only",
            "restrict_scope": "restricted",
            "mark_stale": "stale",
            "reject": "rejected",
            "dispute": "disputed",
            "supersede": "superseded",
        }[action]
        candidate["review_status"] = status
        candidate["reviewed_by"] = reviewer
        candidate["reviewed_at"] = datetime(2026, 5, 9, tzinfo=timezone.utc)
        candidate["result_memory_id"] = result_memory_id
        if edited_content is not None:
            candidate["proposed_content"] = edited_content
        if new_use_policy is not None:
            candidate["suggested_use_policy"] = new_use_policy
        if new_scope is not None:
            candidate["visibility_scope"] = new_scope
        self.review_actions.append(
            {
                "candidate_id": candidate_id,
                "action": action,
                "reviewer": reviewer,
                "note": note,
                "edited_content": edited_content,
                "new_use_policy": new_use_policy,
                "new_scope": new_scope,
                "result_memory_id": result_memory_id,
            }
        )
        return candidate

    async def get_memory_decision_usage(self, entry_id):
        return self.memory_usage.get(entry_id, [])

    async def get_review_candidates_for_memory(self, entry_id):
        return [
            candidate
            for candidate in self.review_candidates
            if candidate.get("result_memory_id") == entry_id
        ]

    async def get_superseding_entries(self, entry_id):
        return self.superseding_entries.get(entry_id, [])

    async def get_judge_decision(self, decision_id):
        if decision_id == "missing":
            return None
        return {
            "id": 2,
            "decision_id": decision_id,
            "schema_version": "openbrain.judge.decision.v1",
            "workspace_id": "ws",
            "project_id": None,
            "task_id": None,
            "flow_id": None,
            "action_id": "act-1",
            "proposal_id": None,
            "idempotency_key": "idem-decision",
            "decision": "allow",
            "confidence": "high",
            "judge_kind": "rule",
            "decision_doc": {"decision_id": decision_id},
            "memory_used": [],
            "memory_to_write": {},
            "requires_review": False,
            "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        }


class FakeEmbed:
    def __init__(self):
        self.calls: list[str] = []

    async def embed(self, text):
        self.calls.append(text)
        return [0.1, 0.2, 0.3]


class FakeGuard:
    """Drop-in for Guard. Records calls; configurable rejection."""

    def __init__(
        self,
        *,
        reject_quota: bool = False,
        reject_content: bool = False,
        reason: str = "blocked by FakeGuard",
    ):
        self.quota_calls: list[str] = []
        self.content_calls: list[str] = []
        self._reject_quota = reject_quota
        self._reject_content = reject_content
        self._reason = reason

    def check_quota(self, identity: str = "default") -> None:
        self.quota_calls.append(identity)
        if self._reject_quota:
            raise GuardRejection(self._reason)

    async def check_content(self, content: str) -> None:
        self.content_calls.append(content)
        if self._reject_content:
            raise GuardRejection(self._reason)


def _cfg() -> Config:
    return Config(
        database_url="postgresql://example",
        openrouter_api_key="dummy",
        mcp_access_key="dummy",
    )


async def _call(mcp, name, **kwargs):
    """Invoke a registered tool by name and unwrap the structured payload.

    FastMCP returns (content_blocks, structured_payload). For tools returning
    a non-dict (list, scalar) the structured payload is wrapped as
    {"result": <value>}; we unwrap that here so tests see the raw value.
    """
    result = await mcp.call_tool(name, kwargs)
    payload = result[1] if isinstance(result, tuple) and len(result) > 1 else result
    if isinstance(payload, dict) and set(payload.keys()) == {"result"}:
        return payload["result"]
    return payload


@pytest.mark.asyncio
async def test_save_thought_passes_provenance_fields():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(
        mcp,
        "save_thought",
        content="we use Postgres",
        category="decision",
        tags=["arch"],
        provenance="observed",
        source="meeting",
        runtime="hermes-agent",
        reasoning_model="anthropic/claude-opus-4.7",
        channel="cli",
        task_id="task-42",
        confidence=0.95,
        use_policy="can_use_as_evidence",
    )
    assert embed.calls == ["we use Postgres"]
    assert len(store.inserted) == 1
    saved = store.inserted[0]
    assert saved["provenance"] == "observed"
    assert saved["source"] == "meeting"
    assert saved["runtime"] == "hermes-agent"
    assert saved["reasoning_model"] == "anthropic/claude-opus-4.7"
    assert saved["channel"] == "cli"
    assert saved["task_id"] == "task-42"
    assert saved["confidence"] == 0.95
    assert saved["use_policy"] == "can_use_as_evidence"
    assert out["provenance"] == "observed"
    assert out["task_id"] == "task-42"
    assert out["use_policy"] == "can_use_as_evidence"


@pytest.mark.asyncio
async def test_save_thought_defaults_to_generated():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    await _call(mcp, "save_thought", content="x", category="env")
    assert store.inserted[0]["provenance"] == "generated"


@pytest.mark.asyncio
async def test_search_thoughts_forwards_filters():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(
        mcp,
        "search_thoughts",
        query="postgres choice",
        top_k=3,
        min_provenance=["confirmed", "observed"],
        allowed_use_policies=["can_use_as_instruction"],
        task_id="task-42",
    )
    assert store.search_calls[0]["min_provenance"] == ["confirmed", "observed"]
    assert store.search_calls[0]["allowed_use_policies"] == ["can_use_as_instruction"]
    assert store.search_calls[0]["task_id"] == "task-42"
    assert store.search_calls[0]["top_k"] == 3
    assert out[0]["similarity"] == 0.42
    assert out[0]["provenance"] == "confirmed"


@pytest.mark.asyncio
async def test_list_thoughts_forwards_filters():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    await _call(
        mcp,
        "list_thoughts",
        category="decision",
        limit=10,
        min_provenance=["confirmed"],
        allowed_use_policies=["can_use_as_instruction"],
        task_id="task-7",
    )
    call = store.list_calls[0]
    assert call["category"] == "decision"
    assert call["limit"] == 10
    assert call["min_provenance"] == ["confirmed"]
    assert call["allowed_use_policies"] == ["can_use_as_instruction"]
    assert call["task_id"] == "task-7"


@pytest.mark.asyncio
async def test_confirm_thought_promotes():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(mcp, "confirm_thought", id=7)
    assert store.confirmed_ids == [7]
    assert out["confirmed"] is True
    assert out["provenance"] == "confirmed"
    assert out["user_confirmed_at"].endswith("+00:00")


@pytest.mark.asyncio
async def test_confirm_thought_missing():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(mcp, "confirm_thought", id=-1)
    assert out["confirmed"] is False


@pytest.mark.asyncio
async def test_supersede_thought_replaces():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(
        mcp,
        "supersede_thought",
        old_id=5,
        new_content="we use Neon now",
        provenance="observed",
        runtime="hermes-agent",
        task_id="task-99",
    )
    assert store.superseded[0]["old_id"] == 5
    assert out["superseded"] is True
    assert out["replaced_id"] == 5
    assert out["supersedes_id"] == 5
    assert out["provenance"] == "observed"


@pytest.mark.asyncio
async def test_supersede_thought_missing():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(mcp, "supersede_thought", old_id=-1, new_content="x")
    assert out["superseded"] is False
    assert "does not exist" in out["reason"]


@pytest.mark.asyncio
async def test_forget_thought_routes_hard_flag():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    await _call(mcp, "forget_thought", id=3, hard=True)
    assert store.forgotten == [(3, True)]


@pytest.mark.asyncio
async def test_memory_stats_includes_breakdown():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(mcp, "memory_stats")
    assert out["by_provenance"] == {"confirmed": 2, "inferred": 2}
    assert out["total"] == 5


@pytest.mark.asyncio
async def test_list_provenance_values():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(mcp, "list_provenance_values")
    assert out == ["confirmed", "generated", "imported", "inferred", "observed"]


@pytest.mark.asyncio
async def test_list_use_policy_values():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(mcp, "list_use_policy_values")
    assert out == [
        "can_use_as_evidence",
        "can_use_as_instruction",
        "do_not_inject_automatically",
        "requires_confirmation",
    ]


def _valid_action_proposal(**overrides):
    proposal = {
        "schema_version": "openbrain.judge.action_proposal.v1",
        "workspace_id": "ws",
        "project_id": "ob1-mcp",
        "task_id": "task-1",
        "flow_id": "flow-1",
        "action_id": "act-1",
        "idempotency_key": "idem-proposal",
        "runtime": {"name": "codex", "version": None, "adapter": "local"},
        "actor": {
            "agent_id": "codex",
            "role": "coding-agent",
            "provider": "openai",
            "model": "gpt-5",
        },
        "tool": {"name": "gmail.send", "kind": "api", "target_system": "gmail"},
        "action": {
            "risk_class": "external_side_effect",
            "description": "Send an approved email",
            "target": "gmail",
            "arguments_digest": "sha256:abc",
            "full_arguments_ref": None,
        },
        "authorization": {
            "claimed_user_authorization": "User approved",
            "user_authorization_refs": [
                {
                    "kind": "user_message",
                    "uri": None,
                    "quote_or_summary": "send it",
                    "timestamp": "2026-07-08T00:00:00Z",
                }
            ],
        },
        "evidence": {
            "source_refs": [
                {
                    "kind": "message",
                    "uri": None,
                    "title": "User request",
                    "timestamp": "2026-07-08T00:00:00Z",
                    "summary": "User approved the send",
                }
            ]
        },
        "expected_consequence": {
            "summary": "Email is sent externally",
            "external_recipients": ["customer@example.com"],
            "data_exposed": [],
            "systems_changed": ["gmail"],
            "persistence": "external",
        },
        "rollback": {
            "is_reversible": False,
            "rollback_plan": None,
            "rollback_owner": None,
        },
        "sensitivity": {
            "contains_secret_like_data": False,
            "contains_customer_data": False,
            "contains_private_personal_data": False,
            "contains_financial_or_legal_data": False,
            "contains_production_system_access": False,
        },
    }
    proposal.update(overrides)
    return proposal


def _valid_judge_decision(**overrides):
    decision = {
        "schema_version": "openbrain.judge.decision.v1",
        "workspace_id": "ws",
        "project_id": "ob1-mcp",
        "task_id": "task-1",
        "flow_id": "flow-1",
        "action_id": "act-1",
        "decision_id": "dec-1",
        "proposal_id": "act-1",
        "idempotency_key": "idem-decision",
        "decision": "allow",
        "reasoning_summary": "Authorized and supported",
        "confidence": "high",
        "judge": {
            "kind": "rule",
            "provider": None,
            "model": None,
            "policy_version": "judge-v1",
        },
        "checks": {
            "authorization_check": "pass",
            "evidence_check": "pass",
            "policy_check": "pass",
            "sensitivity_check": "pass",
            "reversibility_check": "not_applicable",
            "quality_check": "pass",
        },
        "required_revision": {"summary": None, "revised_action_constraints": []},
        "escalation": {"required": False, "reason": None, "owner": None, "due_at": None},
        "memory_used": [{"memory_id": "1", "used_as": "instruction"}],
        "memory_to_write": {
            "decisions": [],
            "lessons": [],
            "failures": [],
            "constraints": [],
            "open_questions": [],
        },
        "provenance": {"default_status": "observed", "requires_review": False},
    }
    decision.update(overrides)
    return decision


@pytest.mark.asyncio
async def test_save_action_proposal_records_envelope():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(
        mcp,
        "save_action_proposal",
        proposal=_valid_action_proposal(),
    )
    assert out["proposal_id"] == "act-1"
    assert out["risk_class"] == "external_side_effect"
    assert out["tool_name"] == "gmail.send"


@pytest.mark.asyncio
async def test_save_action_proposal_rejects_invalid_envelope_before_store():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    with pytest.raises(Exception) as exc_info:
        await _call(
            mcp,
            "save_action_proposal",
            proposal=_valid_action_proposal(
                action={**_valid_action_proposal()["action"], "risk_class": "surprise"}
            ),
        )
    assert "risk_class" in str(exc_info.value)
    assert store.action_proposals == []


@pytest.mark.asyncio
async def test_record_and_get_judge_decision():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(
        mcp,
        "record_judge_decision",
        decision=_valid_judge_decision(),
    )
    assert out["decision_id"] == "dec-1"
    assert out["decision"] == "allow"
    assert out["judge_kind"] == "rule"
    assert out["requires_review"] is False

    fetched = await _call(mcp, "get_judge_decision", decision_id="dec-1")
    assert fetched["found"] is True
    assert fetched["decision_id"] == "dec-1"

    missing = await _call(mcp, "get_judge_decision", decision_id="missing")
    assert missing == {"decision_id": "missing", "found": False}


@pytest.mark.asyncio
async def test_record_judge_decision_rejects_invalid_envelope_before_store():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    with pytest.raises(Exception) as exc_info:
        await _call(
            mcp,
            "record_judge_decision",
            decision=_valid_judge_decision(decision="approve-ish"),
        )
    assert "decision" in str(exc_info.value)
    assert store.judge_decisions == []


@pytest.mark.asyncio
async def test_judge_recall_defaults_to_instruction_grade_policy():
    store, embed = FakeStore(), FakeEmbed()
    mcp = build(_cfg(), store, embed, FakeGuard())
    out = await _call(
        mcp,
        "judge_recall",
        request={
            "schema_version": "openbrain.judge.recall.v1",
            "request_id": "recall-1",
            "workspace_id": "ws",
            "project_id": "ob1-mcp",
            "task_id": "task-1",
            "flow_id": "flow-1",
            "action_id": "act-1",
            "query": {
                "summary": "Agent wants to send an email",
                "action_type": "external_side_effect",
                "tool_name": "gmail.send",
                "target_system": "gmail",
            },
            "entities": {
                "people": [],
                "orgs": [],
                "repos": [],
                "files": [],
                "customers": [],
                "systems": ["gmail"],
                "topics": ["email"],
            },
            "scope": {
                "visibility": "project",
                "include_unconfirmed": False,
                "include_disputed": False,
                "include_stale": False,
            },
            "limits": {"max_items": 3, "max_tokens": 1000, "recency_days": 30},
            "policy": {"require_source_refs": True},
        },
    )
    assert embed.calls == ["Agent wants to send an email"]
    call = store.search_calls[0]
    assert call["top_k"] == 3
    assert call["include_inactive"] is False
    assert call["task_id"] == "task-1"
    assert call["allowed_use_policies"] == ["can_use_as_instruction"]
    assert out["schema_version"] == "openbrain.judge.recall_response.v1"
    assert out["request_id"] == "recall-1"
    assert out["memories"][0]["memory_id"] == "1"
    assert out["memories"][0]["use_policy"]["policy"] == "can_use_as_instruction"


# --- Trust-layer enforcement on memory writes ---------------------------------


@pytest.mark.asyncio
async def test_save_thought_rejects_confirmed_provenance():
    store, embed, guard = FakeStore(), FakeEmbed(), FakeGuard()
    mcp = build(_cfg(), store, embed, guard)
    with pytest.raises(Exception) as exc_info:
        await _call(mcp, "save_thought", content="x", category="env", provenance="confirmed")
    assert "confirmed" in str(exc_info.value).lower()
    # Nothing should have been embedded, guard-checked, or stored.
    assert embed.calls == []
    assert guard.content_calls == []
    assert store.inserted == []


@pytest.mark.asyncio
async def test_supersede_thought_rejects_confirmed_provenance():
    store, embed, guard = FakeStore(), FakeEmbed(), FakeGuard()
    mcp = build(_cfg(), store, embed, guard)
    with pytest.raises(Exception) as exc_info:
        await _call(
            mcp, "supersede_thought", old_id=1, new_content="y", provenance="confirmed"
        )
    assert "confirmed" in str(exc_info.value).lower()
    assert embed.calls == []
    assert store.superseded == []


@pytest.mark.asyncio
async def test_save_thought_calls_guard_before_embed():
    store, embed, guard = FakeStore(), FakeEmbed(), FakeGuard()
    mcp = build(_cfg(), store, embed, guard)
    await _call(mcp, "save_thought", content="hello world", category="env")
    assert guard.quota_calls == ["default"]
    assert guard.content_calls == ["hello world"]
    assert embed.calls == ["hello world"]
    assert len(store.inserted) == 1


@pytest.mark.asyncio
async def test_save_thought_blocked_by_guard_content_check():
    store, embed = FakeStore(), FakeEmbed()
    guard = FakeGuard(reject_content=True, reason="Secret: openrouter_key")
    mcp = build(_cfg(), store, embed, guard)
    with pytest.raises(Exception) as exc_info:
        await _call(mcp, "save_thought", content="my key is sk-or-v1-...", category="env")
    assert "openrouter_key" in str(exc_info.value)
    # Embed must NOT have been called — the secret must not leave to OpenRouter.
    assert embed.calls == []
    assert store.inserted == []


@pytest.mark.asyncio
async def test_save_thought_blocked_by_quota():
    store, embed = FakeStore(), FakeEmbed()
    guard = FakeGuard(reject_quota=True, reason="100/min")
    mcp = build(_cfg(), store, embed, guard)
    with pytest.raises(Exception) as exc_info:
        await _call(mcp, "save_thought", content="x", category="env")
    assert "100/min" in str(exc_info.value)
    assert guard.content_calls == []  # quota check fires before content check
    assert embed.calls == []
    assert store.inserted == []


@pytest.mark.asyncio
async def test_supersede_thought_calls_guard():
    store, embed, guard = FakeStore(), FakeEmbed(), FakeGuard()
    mcp = build(_cfg(), store, embed, guard)
    await _call(mcp, "supersede_thought", old_id=5, new_content="new fact")
    assert guard.quota_calls == ["default"]
    assert guard.content_calls == ["new fact"]
    assert embed.calls == ["new fact"]
