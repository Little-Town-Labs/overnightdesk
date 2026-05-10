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
            "user_confirmed_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
            "supersedes_id": None,
            "created_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 5, 9, tzinfo=timezone.utc),
        }

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
    assert out["provenance"] == "observed"
    assert out["task_id"] == "task-42"


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
        task_id="task-42",
    )
    assert store.search_calls[0]["min_provenance"] == ["confirmed", "observed"]
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
        task_id="task-7",
    )
    call = store.list_calls[0]
    assert call["category"] == "decision"
    assert call["limit"] == 10
    assert call["min_provenance"] == ["confirmed"]
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
