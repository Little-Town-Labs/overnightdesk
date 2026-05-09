from datetime import datetime, timezone
from typing import Any, Iterable

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import Config

PROVENANCE_VALUES = frozenset(
    ("observed", "inferred", "confirmed", "imported", "generated")
)
INSTRUCTION_GRADE = frozenset(("observed", "confirmed"))


class Store:
    def __init__(self, cfg: Config):
        self._cfg = cfg
        self._pool: AsyncConnectionPool | None = None

    async def open(self) -> None:
        self._pool = AsyncConnectionPool(
            conninfo=self._cfg.database_url,
            min_size=1,
            max_size=4,
            kwargs={"row_factory": dict_row},
            open=False,
        )
        await self._pool.open()
        await self._pool.wait()

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()

    async def insert_entry(
        self,
        category: str,
        content: str,
        tags: list[str],
        embedding: list[float],
        embedding_model: str,
        provenance: str = "generated",
        source: str | None = None,
        runtime: str | None = None,
        reasoning_model: str | None = None,
        channel: str | None = None,
        task_id: str | None = None,
        confidence: float | None = None,
        user_confirmed_at: datetime | None = None,
        supersedes_id: int | None = None,
    ) -> dict[str, Any]:
        _validate_provenance(provenance)
        vec_lit = _vector_literal(embedding)
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO ace_memory.entries (
                        category, content, tags,
                        provenance, source, runtime, reasoning_model,
                        channel, task_id, confidence, user_confirmed_at,
                        supersedes_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, category, content, tags, is_active,
                              provenance, source, runtime, reasoning_model,
                              channel, task_id, confidence, user_confirmed_at,
                              supersedes_id, created_at, updated_at
                    """,
                    (
                        category,
                        content,
                        tags,
                        provenance,
                        source,
                        runtime,
                        reasoning_model,
                        channel,
                        task_id,
                        confidence,
                        user_confirmed_at,
                        supersedes_id,
                    ),
                )
                row = await cur.fetchone()
                await cur.execute(
                    """
                    INSERT INTO ace_memory.embeddings (entry_id, embedding, model)
                    VALUES (%s, %s::vector, %s)
                    """,
                    (row["id"], vec_lit, embedding_model),
                )
            await conn.commit()
        return row

    async def search(
        self,
        embedding: list[float],
        top_k: int,
        category: str | None,
        include_inactive: bool,
        min_provenance: list[str] | None = None,
        task_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if min_provenance:
            for p in min_provenance:
                _validate_provenance(p)
        vec_lit = _vector_literal(embedding)
        clauses: list[str] = []
        params: list[Any] = [vec_lit]
        if not include_inactive:
            clauses.append("e.is_active = TRUE")
        if category:
            clauses.append("e.category = %s")
            params.append(category)
        if min_provenance:
            clauses.append("e.provenance = ANY(%s)")
            params.append(list(min_provenance))
        if task_id:
            clauses.append("e.task_id = %s")
            params.append(task_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"""
            SELECT e.id, e.category, e.content, e.tags, e.is_active,
                   e.provenance, e.source, e.runtime, e.reasoning_model,
                   e.channel, e.task_id, e.confidence, e.user_confirmed_at,
                   e.supersedes_id, e.created_at, e.updated_at,
                   1 - (em.embedding <=> %s::vector) AS similarity
            FROM ace_memory.embeddings em
            JOIN ace_memory.entries e ON e.id = em.entry_id
            {where}
            ORDER BY em.embedding <=> %s::vector
            LIMIT %s
        """
        # Two more bind slots: ORDER BY embedding, LIMIT.
        params.extend([vec_lit, top_k])
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, params)
                return list(await cur.fetchall())

    async def list_entries(
        self,
        category: str | None,
        limit: int,
        include_inactive: bool,
        min_provenance: list[str] | None = None,
        task_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if min_provenance:
            for p in min_provenance:
                _validate_provenance(p)
        clauses: list[str] = []
        params: list[Any] = []
        if not include_inactive:
            clauses.append("is_active = TRUE")
        if category:
            clauses.append("category = %s")
            params.append(category)
        if min_provenance:
            clauses.append("provenance = ANY(%s)")
            params.append(list(min_provenance))
        if task_id:
            clauses.append("task_id = %s")
            params.append(task_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        sql = f"""
            SELECT id, category, content, tags, is_active,
                   provenance, source, runtime, reasoning_model,
                   channel, task_id, confidence, user_confirmed_at,
                   supersedes_id, created_at, updated_at
            FROM ace_memory.entries
            {where}
            ORDER BY id DESC
            LIMIT %s
        """
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, params)
                return list(await cur.fetchall())

    async def get_entry(self, entry_id: int) -> dict[str, Any] | None:
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, category, content, tags, is_active,
                           provenance, source, runtime, reasoning_model,
                           channel, task_id, confidence, user_confirmed_at,
                           supersedes_id, created_at, updated_at
                    FROM ace_memory.entries WHERE id = %s
                    """,
                    (entry_id,),
                )
                return await cur.fetchone()

    async def confirm(self, entry_id: int) -> dict[str, Any] | None:
        """Promote an entry to instruction-grade (provenance='confirmed')."""
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    UPDATE ace_memory.entries
                       SET provenance = 'confirmed',
                           user_confirmed_at = COALESCE(user_confirmed_at, NOW()),
                           is_active = TRUE
                     WHERE id = %s
                 RETURNING id, category, content, tags, is_active,
                           provenance, source, runtime, reasoning_model,
                           channel, task_id, confidence, user_confirmed_at,
                           supersedes_id, created_at, updated_at
                    """,
                    (entry_id,),
                )
                row = await cur.fetchone()
            await conn.commit()
        return row

    async def supersede(
        self,
        old_id: int,
        new_content: str,
        embedding: list[float],
        embedding_model: str,
        category: str | None = None,
        tags: list[str] | None = None,
        provenance: str = "generated",
        source: str | None = None,
        runtime: str | None = None,
        reasoning_model: str | None = None,
        channel: str | None = None,
        task_id: str | None = None,
        confidence: float | None = None,
    ) -> dict[str, Any]:
        """Replace an entry: insert new linked to old, soft-delete old."""
        _validate_provenance(provenance)
        old = await self.get_entry(old_id)
        if old is None:
            raise LookupError(f"entry {old_id} does not exist")
        new_category = category or old["category"]
        new_tags = list(tags) if tags is not None else list(old["tags"] or [])
        new_row = await self.insert_entry(
            category=new_category,
            content=new_content,
            tags=new_tags,
            embedding=embedding,
            embedding_model=embedding_model,
            provenance=provenance,
            source=source,
            runtime=runtime,
            reasoning_model=reasoning_model,
            channel=channel,
            task_id=task_id,
            confidence=confidence,
            supersedes_id=old_id,
        )
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE ace_memory.entries SET is_active = FALSE WHERE id = %s",
                    (old_id,),
                )
            await conn.commit()
        return new_row

    async def forget(self, entry_id: int, hard: bool) -> bool:
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                if hard:
                    await cur.execute(
                        "DELETE FROM ace_memory.entries WHERE id = %s", (entry_id,)
                    )
                else:
                    await cur.execute(
                        "UPDATE ace_memory.entries SET is_active = FALSE WHERE id = %s",
                        (entry_id,),
                    )
                deleted = cur.rowcount
            await conn.commit()
        return deleted > 0

    async def stats(self) -> dict[str, Any]:
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM ace_memory.entries)                     AS total,
                      (SELECT COUNT(*) FROM ace_memory.entries WHERE is_active)     AS active,
                      (SELECT COUNT(*) FROM ace_memory.embeddings)                  AS embeddings,
                      (SELECT COUNT(DISTINCT category) FROM ace_memory.entries)     AS categories
                    """
                )
                base = await cur.fetchone()
                await cur.execute(
                    """
                    SELECT provenance::text AS provenance, COUNT(*) AS n
                    FROM ace_memory.entries
                    WHERE is_active
                    GROUP BY provenance
                    """
                )
                rows = await cur.fetchall()
        base["by_provenance"] = {r["provenance"]: r["n"] for r in rows}
        return base


def _validate_provenance(value: str) -> None:
    if value not in PROVENANCE_VALUES:
        raise ValueError(
            f"invalid provenance {value!r}; expected one of {sorted(PROVENANCE_VALUES)}"
        )


def _vector_literal(embedding: Iterable[float]) -> str:
    return "[" + ",".join(f"{float(v):.6f}" for v in embedding) + "]"


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
