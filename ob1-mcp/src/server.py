from datetime import datetime, timezone
from typing import Any

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from .config import Config
from .db import Store
from .embeddings import OpenRouterClient


def build(cfg: Config, store: Store, embed: OpenRouterClient) -> FastMCP:
    mcp = FastMCP(
        name="open-brain",
        instructions=(
            "Persistent vector-searchable memory for Ace (hermes-agent). "
            "Use save_thought to remember a durable fact; search_thoughts "
            "to recall by semantic similarity; list_thoughts to browse a "
            "category; forget_thought to retire an entry."
        ),
        host=cfg.host,
        port=cfg.port,
        streamable_http_path="/",
    )

    @mcp.tool()
    async def save_thought(
        content: str = Field(description="The thought / fact to remember."),
        category: str = Field(
            description=(
                "Category. Suggested: person, project, decision, preference, "
                "env, procedure, infrastructure."
            )
        ),
        tags: list[str] = Field(default_factory=list, description="Optional tags."),
    ) -> dict[str, Any]:
        """Embed and store a new thought in long-term memory."""
        vec = await embed.embed(content)
        row = await store.insert_entry(
            category=category,
            content=content,
            tags=list(tags),
            embedding=vec,
            model=cfg.embedding_model,
        )
        return {
            "id": row["id"],
            "category": row["category"],
            "tags": list(row["tags"] or []),
            "created_at": _iso(row["created_at"]),
        }

    @mcp.tool()
    async def search_thoughts(
        query: str = Field(description="Natural-language search query."),
        top_k: int = Field(default=5, ge=1, le=25, description="Number of results."),
        category: str | None = Field(
            default=None, description="Restrict to one category."
        ),
        include_inactive: bool = Field(
            default=False, description="Include soft-deleted entries."
        ),
    ) -> list[dict[str, Any]]:
        """Semantic-similarity search over stored thoughts. Returns ranked matches."""
        vec = await embed.embed(query)
        rows = await store.search(
            embedding=vec,
            top_k=top_k,
            category=category,
            include_inactive=include_inactive,
        )
        return [
            {
                "id": r["id"],
                "category": r["category"],
                "content": r["content"],
                "tags": list(r["tags"] or []),
                "is_active": r["is_active"],
                "similarity": round(float(r["similarity"]), 4),
                "created_at": _iso(r["created_at"]),
            }
            for r in rows
        ]

    @mcp.tool()
    async def list_thoughts(
        category: str | None = Field(default=None, description="Filter by category."),
        limit: int = Field(default=20, ge=1, le=100),
        include_inactive: bool = Field(default=False),
    ) -> list[dict[str, Any]]:
        """List recent thoughts, newest first. Use to browse without a query."""
        rows = await store.list_entries(
            category=category, limit=limit, include_inactive=include_inactive
        )
        return [
            {
                "id": r["id"],
                "category": r["category"],
                "content": r["content"],
                "tags": list(r["tags"] or []),
                "is_active": r["is_active"],
                "created_at": _iso(r["created_at"]),
                "updated_at": _iso(r["updated_at"]),
            }
            for r in rows
        ]

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
        """Counts of entries, embeddings, and distinct categories."""
        s = await store.stats()
        return dict(s)

    return mcp


def _iso(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(dt)
