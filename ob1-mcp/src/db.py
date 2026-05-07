from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import Config


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
        model: str,
    ) -> dict[str, Any]:
        vec_lit = _vector_literal(embedding)
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO ace_memory.entries (category, content, tags)
                    VALUES (%s, %s, %s)
                    RETURNING id, category, content, tags, created_at
                    """,
                    (category, content, tags),
                )
                row = await cur.fetchone()
                await cur.execute(
                    """
                    INSERT INTO ace_memory.embeddings (entry_id, embedding, model)
                    VALUES (%s, %s::vector, %s)
                    """,
                    (row["id"], vec_lit, model),
                )
            await conn.commit()
        return row

    async def search(
        self,
        embedding: list[float],
        top_k: int,
        category: str | None,
        include_inactive: bool,
    ) -> list[dict[str, Any]]:
        vec_lit = _vector_literal(embedding)
        clauses = []
        params: list[Any] = [vec_lit]
        if not include_inactive:
            clauses.append("e.is_active = TRUE")
        if category:
            clauses.append("e.category = %s")
            params.append(category)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(top_k)
        sql = f"""
            SELECT e.id, e.category, e.content, e.tags, e.is_active,
                   e.created_at, e.updated_at,
                   1 - (em.embedding <=> %s::vector) AS similarity
            FROM ace_memory.embeddings em
            JOIN ace_memory.entries e ON e.id = em.entry_id
            {where}
            ORDER BY em.embedding <=> %s::vector
            LIMIT %s
        """
        # Re-bind the embedding for the ORDER BY copy.
        params.insert(-1, vec_lit)
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, params)
                return list(await cur.fetchall())

    async def list_entries(
        self, category: str | None, limit: int, include_inactive: bool
    ) -> list[dict[str, Any]]:
        clauses = []
        params: list[Any] = []
        if not include_inactive:
            clauses.append("is_active = TRUE")
        if category:
            clauses.append("category = %s")
            params.append(category)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        sql = f"""
            SELECT id, category, content, tags, is_active, created_at, updated_at
            FROM ace_memory.entries
            {where}
            ORDER BY id DESC
            LIMIT %s
        """
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, params)
                return list(await cur.fetchall())

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
                      (SELECT COUNT(*) FROM ace_memory.entries) AS total,
                      (SELECT COUNT(*) FROM ace_memory.entries WHERE is_active) AS active,
                      (SELECT COUNT(*) FROM ace_memory.embeddings) AS embeddings,
                      (SELECT COUNT(DISTINCT category) FROM ace_memory.entries) AS categories
                    """
                )
                return await cur.fetchone()


def _vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(f"{v:.6f}" for v in embedding) + "]"
