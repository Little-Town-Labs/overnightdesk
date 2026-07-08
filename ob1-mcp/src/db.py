from datetime import datetime, timezone
from typing import Any, Iterable

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import Config

PROVENANCE_VALUES = frozenset(
    ("observed", "inferred", "confirmed", "imported", "generated")
)
USE_POLICY_VALUES = frozenset(
    (
        "can_use_as_instruction",
        "can_use_as_evidence",
        "requires_confirmation",
        "do_not_inject_automatically",
    )
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
        use_policy: str | None = None,
        user_confirmed_at: datetime | None = None,
        supersedes_id: int | None = None,
    ) -> dict[str, Any]:
        _validate_provenance(provenance)
        use_policy = use_policy or _default_use_policy(provenance)
        _validate_use_policy(use_policy)
        vec_lit = _vector_literal(embedding)
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO ace_memory.entries (
                        category, content, tags,
                        provenance, source, runtime, reasoning_model,
                        channel, task_id, confidence, use_policy,
                        user_confirmed_at, supersedes_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, category, content, tags, is_active,
                              provenance, source, runtime, reasoning_model,
                              channel, task_id, confidence, use_policy,
                              user_confirmed_at, supersedes_id, created_at,
                              updated_at
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
                        use_policy,
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
        allowed_use_policies: list[str] | None = None,
        task_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if min_provenance:
            for p in min_provenance:
                _validate_provenance(p)
        if allowed_use_policies:
            for p in allowed_use_policies:
                _validate_use_policy(p)
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
        if allowed_use_policies:
            clauses.append("e.use_policy = ANY(%s)")
            params.append(list(allowed_use_policies))
        if task_id:
            clauses.append("e.task_id = %s")
            params.append(task_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"""
            SELECT e.id, e.category, e.content, e.tags, e.is_active,
                   e.provenance, e.source, e.runtime, e.reasoning_model,
                   e.channel, e.task_id, e.confidence, e.use_policy,
                   e.user_confirmed_at, e.supersedes_id, e.created_at,
                   e.updated_at,
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
        allowed_use_policies: list[str] | None = None,
        task_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if min_provenance:
            for p in min_provenance:
                _validate_provenance(p)
        if allowed_use_policies:
            for p in allowed_use_policies:
                _validate_use_policy(p)
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
        if allowed_use_policies:
            clauses.append("use_policy = ANY(%s)")
            params.append(list(allowed_use_policies))
        if task_id:
            clauses.append("task_id = %s")
            params.append(task_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        sql = f"""
            SELECT id, category, content, tags, is_active,
                   provenance, source, runtime, reasoning_model,
                   channel, task_id, confidence, use_policy,
                   user_confirmed_at, supersedes_id, created_at, updated_at
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
                           channel, task_id, confidence, use_policy,
                           user_confirmed_at, supersedes_id, created_at,
                           updated_at
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
                           use_policy = 'can_use_as_instruction',
                           user_confirmed_at = COALESCE(user_confirmed_at, NOW()),
                           is_active = TRUE
                     WHERE id = %s
                 RETURNING id, category, content, tags, is_active,
                           provenance, source, runtime, reasoning_model,
                           channel, task_id, confidence, use_policy,
                           user_confirmed_at, supersedes_id, created_at,
                           updated_at
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
        use_policy: str | None = None,
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
            use_policy=use_policy,
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

    async def insert_action_proposal(self, proposal: dict[str, Any]) -> dict[str, Any]:
        """Store an action proposal envelope idempotently by idempotency_key."""
        fields = _proposal_fields(proposal)
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO ace_memory.action_proposals (
                        proposal_id, schema_version, workspace_id, project_id,
                        task_id, flow_id, action_id, idempotency_key, risk_class,
                        tool_name, target_system, proposal
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (idempotency_key) DO UPDATE
                       SET idempotency_key = EXCLUDED.idempotency_key
                    RETURNING id, proposal_id, schema_version, workspace_id,
                              project_id, task_id, flow_id, action_id,
                              idempotency_key, risk_class, tool_name,
                              target_system, proposal, created_at
                    """,
                    (
                        fields["proposal_id"],
                        fields["schema_version"],
                        fields["workspace_id"],
                        fields["project_id"],
                        fields["task_id"],
                        fields["flow_id"],
                        fields["action_id"],
                        fields["idempotency_key"],
                        fields["risk_class"],
                        fields["tool_name"],
                        fields["target_system"],
                        json_dumps(proposal),
                    ),
                )
                row = await cur.fetchone()
            await conn.commit()
        return row

    async def insert_judge_decision(self, decision_doc: dict[str, Any]) -> dict[str, Any]:
        """Store a judge decision envelope idempotently by idempotency_key."""
        fields = _decision_fields(decision_doc)
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO ace_memory.judge_decisions (
                        decision_id, schema_version, workspace_id, project_id,
                        task_id, flow_id, action_id, proposal_id,
                        idempotency_key, decision, confidence, judge_kind,
                        decision_doc, memory_used, memory_to_write,
                        requires_review
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
                    ON CONFLICT (idempotency_key) DO UPDATE
                       SET idempotency_key = EXCLUDED.idempotency_key
                    RETURNING id, decision_id, schema_version, workspace_id,
                              project_id, task_id, flow_id, action_id,
                              proposal_id, idempotency_key, decision,
                              confidence, judge_kind, decision_doc,
                              memory_used, memory_to_write, requires_review,
                              created_at
                    """,
                    (
                        fields["decision_id"],
                        fields["schema_version"],
                        fields["workspace_id"],
                        fields["project_id"],
                        fields["task_id"],
                        fields["flow_id"],
                        fields["action_id"],
                        fields["proposal_id"],
                        fields["idempotency_key"],
                        fields["decision"],
                        fields["confidence"],
                        fields["judge_kind"],
                        json_dumps(decision_doc),
                        json_dumps(fields["memory_used"]),
                        json_dumps(fields["memory_to_write"]),
                        fields["requires_review"],
                    ),
                )
                row = await cur.fetchone()
            await conn.commit()
        return row

    async def create_review_candidates_for_decision(
        self, decision_row: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Create review queue candidates from a judge decision's memory_to_write."""
        if not decision_row.get("requires_review", True):
            return []
        candidates = _review_candidates_from_decision(decision_row)
        if not candidates:
            return []
        created: list[dict[str, Any]] = []
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                for candidate in candidates:
                    await cur.execute(
                        """
                        INSERT INTO ace_memory.review_candidates (
                            candidate_id, source_decision_id, workspace_id,
                            project_id, task_id, flow_id, candidate_kind,
                            proposed_content, proposed_category, proposed_tags,
                            provenance_status, confidence, suggested_use_policy,
                            visibility_scope, review_status, review_priority,
                            reason
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', 'normal', %s)
                        ON CONFLICT (candidate_id) DO NOTHING
                        RETURNING id, candidate_id, source_decision_id,
                                  workspace_id, project_id, task_id, flow_id,
                                  candidate_kind, proposed_content,
                                  proposed_category, proposed_tags,
                                  provenance_status, confidence,
                                  suggested_use_policy, visibility_scope,
                                  review_status, review_priority, reason,
                                  created_at, reviewed_at, reviewed_by,
                                  result_memory_id
                        """,
                        (
                            candidate["candidate_id"],
                            candidate["source_decision_id"],
                            candidate["workspace_id"],
                            candidate["project_id"],
                            candidate["task_id"],
                            candidate["flow_id"],
                            candidate["candidate_kind"],
                            candidate["proposed_content"],
                            candidate["proposed_category"],
                            candidate["proposed_tags"],
                            candidate["provenance_status"],
                            candidate["confidence"],
                            candidate["suggested_use_policy"],
                            candidate["visibility_scope"],
                            candidate["reason"],
                        ),
                    )
                    row = await cur.fetchone()
                    if row is not None:
                        created.append(row)
            await conn.commit()
        return created

    async def list_review_candidates(
        self,
        workspace_id: str,
        project_id: str | None,
        status: str | None,
        limit: int,
    ) -> list[dict[str, Any]]:
        clauses = ["workspace_id = %s"]
        params: list[Any] = [workspace_id]
        if project_id is not None:
            clauses.append("project_id = %s")
            params.append(project_id)
        if status is not None:
            clauses.append("review_status = %s")
            params.append(status)
        params.append(limit)
        sql = f"""
            SELECT id, candidate_id, source_decision_id, workspace_id,
                   project_id, task_id, flow_id, candidate_kind,
                   proposed_content, proposed_category, proposed_tags,
                   provenance_status, confidence, suggested_use_policy,
                   visibility_scope, review_status, review_priority, reason,
                   created_at, reviewed_at, reviewed_by, result_memory_id
            FROM ace_memory.review_candidates
            WHERE {" AND ".join(clauses)}
            ORDER BY created_at DESC, id DESC
            LIMIT %s
        """
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, params)
                return list(await cur.fetchall())

    async def get_review_candidate(self, candidate_id: str) -> dict[str, Any] | None:
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, candidate_id, source_decision_id, workspace_id,
                           project_id, task_id, flow_id, candidate_kind,
                           proposed_content, proposed_category, proposed_tags,
                           provenance_status, confidence, suggested_use_policy,
                           visibility_scope, review_status, review_priority,
                           reason, created_at, reviewed_at, reviewed_by,
                           result_memory_id
                    FROM ace_memory.review_candidates
                    WHERE candidate_id = %s
                    """,
                    (candidate_id,),
                )
                return await cur.fetchone()

    async def apply_review_action(
        self,
        *,
        candidate_id: str,
        action: str,
        reviewer: str,
        note: str | None,
        edited_content: str | None,
        new_use_policy: str | None,
        new_scope: str | None,
        result_memory_id: int | None,
    ) -> dict[str, Any] | None:
        status = _review_status_for_action(action)
        if new_use_policy is not None:
            _validate_use_policy(new_use_policy)
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO ace_memory.review_actions (
                        candidate_id, action, reviewer, note, edited_content,
                        new_use_policy, new_scope, result_memory_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        candidate_id,
                        action,
                        reviewer,
                        note,
                        edited_content,
                        new_use_policy,
                        new_scope,
                        result_memory_id,
                    ),
                )
                await cur.execute(
                    """
                    UPDATE ace_memory.review_candidates
                       SET review_status = %s,
                           reviewed_at = NOW(),
                           reviewed_by = %s,
                           proposed_content = COALESCE(%s, proposed_content),
                           suggested_use_policy = COALESCE(%s, suggested_use_policy),
                           visibility_scope = COALESCE(%s, visibility_scope),
                           result_memory_id = COALESCE(%s, result_memory_id)
                     WHERE candidate_id = %s
                 RETURNING id, candidate_id, source_decision_id, workspace_id,
                           project_id, task_id, flow_id, candidate_kind,
                           proposed_content, proposed_category, proposed_tags,
                           provenance_status, confidence, suggested_use_policy,
                           visibility_scope, review_status, review_priority,
                           reason, created_at, reviewed_at, reviewed_by,
                           result_memory_id
                    """,
                    (
                        status,
                        reviewer,
                        edited_content,
                        new_use_policy,
                        new_scope,
                        result_memory_id,
                        candidate_id,
                    ),
                )
                row = await cur.fetchone()
            await conn.commit()
        return row

    async def get_memory_decision_usage(self, entry_id: int) -> list[dict[str, Any]]:
        memory_id = str(entry_id)
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT decision_id, action_id, decision, created_at, used.value->>'used_as' AS used_as
                    FROM ace_memory.judge_decisions jd
                    CROSS JOIN LATERAL jsonb_array_elements(jd.memory_used) AS used(value)
                    WHERE used.value->>'memory_id' = %s
                    ORDER BY jd.created_at DESC
                    """,
                    (memory_id,),
                )
                return list(await cur.fetchall())

    async def get_review_candidates_for_memory(
        self, entry_id: int
    ) -> list[dict[str, Any]]:
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, candidate_id, source_decision_id, workspace_id,
                           project_id, task_id, flow_id, candidate_kind,
                           proposed_content, proposed_category, proposed_tags,
                           provenance_status, confidence, suggested_use_policy,
                           visibility_scope, review_status, review_priority,
                           reason, created_at, reviewed_at, reviewed_by,
                           result_memory_id
                    FROM ace_memory.review_candidates
                    WHERE result_memory_id = %s
                    ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
                    """,
                    (entry_id,),
                )
                return list(await cur.fetchall())

    async def get_superseding_entries(self, entry_id: int) -> list[dict[str, Any]]:
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, category, content, tags, is_active,
                           provenance, source, runtime, reasoning_model,
                           channel, task_id, confidence, use_policy,
                           user_confirmed_at, supersedes_id, created_at,
                           updated_at
                    FROM ace_memory.entries
                    WHERE supersedes_id = %s
                    ORDER BY created_at DESC, id DESC
                    """,
                    (entry_id,),
                )
                return list(await cur.fetchall())

    async def get_judge_decision(self, decision_id: str) -> dict[str, Any] | None:
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT id, decision_id, schema_version, workspace_id,
                           project_id, task_id, flow_id, action_id, proposal_id,
                           idempotency_key, decision, confidence, judge_kind,
                           decision_doc, memory_used, memory_to_write,
                           requires_review, created_at
                    FROM ace_memory.judge_decisions
                    WHERE decision_id = %s
                    """,
                    (decision_id,),
                )
                return await cur.fetchone()


def _validate_provenance(value: str) -> None:
    if value not in PROVENANCE_VALUES:
        raise ValueError(
            f"invalid provenance {value!r}; expected one of {sorted(PROVENANCE_VALUES)}"
        )


def _validate_use_policy(value: str) -> None:
    if value not in USE_POLICY_VALUES:
        raise ValueError(
            f"invalid use_policy {value!r}; expected one of {sorted(USE_POLICY_VALUES)}"
        )


def _default_use_policy(provenance: str) -> str:
    if provenance in INSTRUCTION_GRADE:
        return "can_use_as_instruction"
    if provenance == "imported":
        return "can_use_as_evidence"
    return "requires_confirmation"


def _proposal_fields(proposal: dict[str, Any]) -> dict[str, Any]:
    action = proposal.get("action") or {}
    tool = proposal.get("tool") or {}
    action_id = _require_str(proposal, "action_id")
    return {
        "proposal_id": proposal.get("proposal_id") or action_id,
        "schema_version": _require_str(proposal, "schema_version"),
        "workspace_id": _require_str(proposal, "workspace_id"),
        "project_id": proposal.get("project_id"),
        "task_id": proposal.get("task_id"),
        "flow_id": proposal.get("flow_id"),
        "action_id": action_id,
        "idempotency_key": _require_str(proposal, "idempotency_key"),
        "risk_class": action.get("risk_class") or _require_str(proposal, "risk_class"),
        "tool_name": tool.get("name") or proposal.get("tool_name"),
        "target_system": tool.get("target_system") or proposal.get("target_system"),
    }


def _decision_fields(decision_doc: dict[str, Any]) -> dict[str, Any]:
    judge = decision_doc.get("judge") or {}
    provenance = decision_doc.get("provenance") or {}
    return {
        "decision_id": _require_str(decision_doc, "decision_id"),
        "schema_version": _require_str(decision_doc, "schema_version"),
        "workspace_id": _require_str(decision_doc, "workspace_id"),
        "project_id": decision_doc.get("project_id"),
        "task_id": decision_doc.get("task_id"),
        "flow_id": decision_doc.get("flow_id"),
        "action_id": _require_str(decision_doc, "action_id"),
        "proposal_id": decision_doc.get("proposal_id"),
        "idempotency_key": _require_str(decision_doc, "idempotency_key"),
        "decision": _require_str(decision_doc, "decision"),
        "confidence": decision_doc.get("confidence"),
        "judge_kind": judge.get("kind") or decision_doc.get("judge_kind"),
        "memory_used": decision_doc.get("memory_used") or [],
        "memory_to_write": decision_doc.get("memory_to_write") or {},
        "requires_review": bool(provenance.get("requires_review", True)),
    }


def _review_candidates_from_decision(
    decision_row: dict[str, Any]
) -> list[dict[str, Any]]:
    decision_doc = decision_row.get("decision_doc") or {}
    provenance = decision_doc.get("provenance") or {}
    provenance_status = provenance.get("default_status") or "generated"
    suggested_use_policy = (
        "requires_confirmation"
        if provenance_status in {"generated", "inferred"}
        else "can_use_as_evidence"
    )
    memory_to_write = decision_row.get("memory_to_write") or {}
    kind_map = {
        "decisions": "decision",
        "lessons": "lesson",
        "failures": "failure",
        "constraints": "constraint",
        "open_questions": "open_question",
    }
    candidates: list[dict[str, Any]] = []
    for field, kind in kind_map.items():
        for index, content in enumerate(memory_to_write.get(field) or []):
            if not isinstance(content, str) or not content.strip():
                continue
            candidates.append(
                {
                    "candidate_id": f"{decision_row['decision_id']}:{field}:{index}",
                    "source_decision_id": decision_row["decision_id"],
                    "workspace_id": decision_row["workspace_id"],
                    "project_id": decision_row.get("project_id"),
                    "task_id": decision_row.get("task_id"),
                    "flow_id": decision_row.get("flow_id"),
                    "candidate_kind": kind,
                    "proposed_content": content.strip(),
                    "proposed_category": f"judge_{kind}",
                    "proposed_tags": ["judge", kind],
                    "provenance_status": provenance_status,
                    "confidence": None,
                    "suggested_use_policy": suggested_use_policy,
                    "visibility_scope": "project",
                    "reason": "judge_decision_memory_to_write",
                }
            )
    return candidates


def _review_status_for_action(action: str) -> str:
    mapping = {
        "confirm": "confirmed",
        "edit": "pending",
        "evidence_only": "evidence_only",
        "restrict_scope": "restricted",
        "mark_stale": "stale",
        "reject": "rejected",
        "dispute": "disputed",
        "supersede": "superseded",
    }
    try:
        return mapping[action]
    except KeyError as e:
        raise ValueError(f"invalid review action {action!r}") from e


def _require_str(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{key} is required")
    return value


def json_dumps(value: Any) -> str:
    import json

    return json.dumps(value, separators=(",", ":"))


def _vector_literal(embedding: Iterable[float]) -> str:
    return "[" + ",".join(f"{float(v):.6f}" for v in embedding) + "]"


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
