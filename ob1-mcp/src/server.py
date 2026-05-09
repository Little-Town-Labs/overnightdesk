from datetime import datetime, timezone
from typing import Any

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from .config import Config
from .db import PROVENANCE_VALUES, Store
from .embeddings import OpenRouterClient


INSTRUCTIONS = (
    "Persistent vector-searchable memory for Ace (hermes-agent) and other "
    "Open Brain consumers.\n\n"
    "TRUST MODEL — every entry carries a provenance label:\n"
    "  observed  = captured directly from a source (log, tool output, message)\n"
    "  inferred  = model derived this from other context           (EVIDENCE)\n"
    "  confirmed = a human explicitly confirmed it                 (INSTRUCTION)\n"
    "  imported  = migrated from an older system / transcript\n"
    "  generated = agent-produced during work (reviews, summaries)\n\n"
    "Treat 'confirmed' and 'observed' as instruction-grade. Treat the rest as "
    "evidence-grade unless you intentionally widen the filter.\n\n"
    "WORKFLOW:\n"
    "  1. RECALL: search_thoughts(..., min_provenance=['confirmed','observed'])\n"
    "     before doing meaningful work.\n"
    "  2. WORK: do the thing, carrying task_id / channel / runtime context.\n"
    "  3. WRITE-BACK: save_thought(..., provenance, source, runtime, "
    "reasoning_model, channel, task_id, confidence) so the next agent can "
    "build on it.\n"
    "  4. PROMOTE: when the user confirms an inferred entry, call "
    "confirm_thought(id) to elevate it to instruction-grade.\n"
    "  5. SUPERSEDE: when a fact changes, call supersede_thought(old_id, "
    "new_content, ...) instead of deleting — preserves the trail."
)


def build(cfg: Config, store: Store, embed: OpenRouterClient) -> FastMCP:
    mcp = FastMCP(
        name="open-brain",
        instructions=INSTRUCTIONS,
        host=cfg.host,
        port=cfg.port,
        streamable_http_path="/",
    )

    @mcp.tool()
    async def save_thought(
        content: str = Field(description="The thought / fact to remember."),
        category: str = Field(
            description=(
                "Content category. Suggested: person, project, decision, "
                "preference, env, procedure, infrastructure."
            )
        ),
        tags: list[str] = Field(default_factory=list, description="Optional tags."),
        provenance: str = Field(
            default="generated",
            description=(
                "How this thought was produced: observed | inferred | confirmed "
                "| imported | generated. Defaults to 'generated'. Use "
                "'confirmed' only when a human explicitly endorsed the content."
            ),
        ),
        source: str | None = Field(
            default=None,
            description="Where it came from (URL, file path, log identifier, channel name).",
        ),
        runtime: str | None = Field(
            default=None,
            description="Which agent/runtime wrote this (e.g. hermes-agent, ace-cli).",
        ),
        reasoning_model: str | None = Field(
            default=None,
            description="The model that produced the reasoning, if any (e.g. anthropic/claude-opus-4.7).",
        ),
        channel: str | None = Field(
            default=None,
            description="Channel where the work was happening (slack, discord, github, cli, ...).",
        ),
        task_id: str | None = Field(
            default=None,
            description="Workflow / job / TaskFlow identifier this thought belongs to.",
        ),
        confidence: float | None = Field(
            default=None,
            ge=0.0,
            le=1.0,
            description="Optional 0..1 confidence score for inferred / generated entries.",
        ),
    ) -> dict[str, Any]:
        """Embed and store a new thought with provenance metadata."""
        vec = await embed.embed(content)
        row = await store.insert_entry(
            category=category,
            content=content,
            tags=list(tags),
            embedding=vec,
            embedding_model=cfg.embedding_model,
            provenance=provenance,
            source=source,
            runtime=runtime,
            reasoning_model=reasoning_model,
            channel=channel,
            task_id=task_id,
            confidence=confidence,
        )
        return _row_to_payload(row)

    @mcp.tool()
    async def search_thoughts(
        query: str = Field(description="Natural-language search query."),
        top_k: int = Field(default=5, ge=1, le=25, description="Number of results."),
        category: str | None = Field(
            default=None, description="Restrict to one content category."
        ),
        include_inactive: bool = Field(
            default=False, description="Include soft-deleted entries."
        ),
        min_provenance: list[str] | None = Field(
            default=None,
            description=(
                "Restrict to entries whose provenance is in this list. Pass "
                "['confirmed','observed'] for instruction-grade only."
            ),
        ),
        task_id: str | None = Field(
            default=None,
            description="Restrict to entries written under this task / workflow id.",
        ),
    ) -> list[dict[str, Any]]:
        """Semantic search with provenance + task filters. Returns ranked matches."""
        vec = await embed.embed(query)
        rows = await store.search(
            embedding=vec,
            top_k=top_k,
            category=category,
            include_inactive=include_inactive,
            min_provenance=list(min_provenance) if min_provenance else None,
            task_id=task_id,
        )
        return [_row_to_payload(r, include_similarity=True) for r in rows]

    @mcp.tool()
    async def list_thoughts(
        category: str | None = Field(default=None, description="Filter by content category."),
        limit: int = Field(default=20, ge=1, le=100),
        include_inactive: bool = Field(default=False),
        min_provenance: list[str] | None = Field(
            default=None,
            description="Restrict to provenance values in this list.",
        ),
        task_id: str | None = Field(
            default=None,
            description="Restrict to one task / workflow id.",
        ),
    ) -> list[dict[str, Any]]:
        """List recent thoughts, newest first. Use to browse without a query."""
        rows = await store.list_entries(
            category=category,
            limit=limit,
            include_inactive=include_inactive,
            min_provenance=list(min_provenance) if min_provenance else None,
            task_id=task_id,
        )
        return [_row_to_payload(r) for r in rows]

    @mcp.tool()
    async def confirm_thought(
        id: int = Field(description="Entry id to promote to instruction-grade."),
    ) -> dict[str, Any]:
        """Promote an entry to provenance='confirmed' (instruction-grade)."""
        row = await store.confirm(entry_id=id)
        if row is None:
            return {"id": id, "confirmed": False, "reason": "not found"}
        payload = _row_to_payload(row)
        payload["confirmed"] = True
        return payload

    @mcp.tool()
    async def supersede_thought(
        old_id: int = Field(description="Entry id being replaced."),
        new_content: str = Field(description="Replacement content."),
        category: str | None = Field(
            default=None,
            description="Optional new category; defaults to the old entry's category.",
        ),
        tags: list[str] | None = Field(
            default=None,
            description="Optional new tags; defaults to the old entry's tags.",
        ),
        provenance: str = Field(
            default="generated",
            description="Provenance for the new entry. See save_thought for values.",
        ),
        source: str | None = Field(default=None),
        runtime: str | None = Field(default=None),
        reasoning_model: str | None = Field(default=None),
        channel: str | None = Field(default=None),
        task_id: str | None = Field(default=None),
        confidence: float | None = Field(default=None, ge=0.0, le=1.0),
    ) -> dict[str, Any]:
        """Atomically replace an entry: insert new (linked via supersedes_id), soft-delete old."""
        vec = await embed.embed(new_content)
        try:
            row = await store.supersede(
                old_id=old_id,
                new_content=new_content,
                embedding=vec,
                embedding_model=cfg.embedding_model,
                category=category,
                tags=list(tags) if tags is not None else None,
                provenance=provenance,
                source=source,
                runtime=runtime,
                reasoning_model=reasoning_model,
                channel=channel,
                task_id=task_id,
                confidence=confidence,
            )
        except LookupError as e:
            return {"superseded": False, "reason": str(e)}
        payload = _row_to_payload(row)
        payload["superseded"] = True
        payload["replaced_id"] = old_id
        return payload

    @mcp.tool()
    async def forget_thought(
        id: int = Field(description="Entry id to retire."),
        hard: bool = Field(
            default=False,
            description="If true, permanently delete; otherwise soft-delete.",
        ),
    ) -> dict[str, Any]:
        """Soft-delete (default) or hard-delete a thought."""
        ok = await store.forget(entry_id=id, hard=hard)
        return {"id": id, "deleted": ok, "hard": hard}

    @mcp.tool()
    async def memory_stats() -> dict[str, Any]:
        """Counts of entries, embeddings, distinct categories, and per-provenance breakdown."""
        s = await store.stats()
        return dict(s)

    @mcp.tool()
    async def list_provenance_values() -> list[str]:
        """Enumerates allowed provenance values (for clients that want to validate)."""
        return sorted(PROVENANCE_VALUES)

    return mcp


def _row_to_payload(row: dict[str, Any], include_similarity: bool = False) -> dict[str, Any]:
    payload = {
        "id": row["id"],
        "category": row["category"],
        "content": row.get("content"),
        "tags": list(row.get("tags") or []),
        "is_active": row.get("is_active"),
        "provenance": row.get("provenance"),
        "source": row.get("source"),
        "runtime": row.get("runtime"),
        "reasoning_model": row.get("reasoning_model"),
        "channel": row.get("channel"),
        "task_id": row.get("task_id"),
        "confidence": row.get("confidence"),
        "user_confirmed_at": _iso(row.get("user_confirmed_at")),
        "supersedes_id": row.get("supersedes_id"),
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }
    if include_similarity and "similarity" in row:
        payload["similarity"] = round(float(row["similarity"]), 4)
    return payload


def _iso(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(dt)
