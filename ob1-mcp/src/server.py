from datetime import datetime, timezone
from typing import Any

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from .config import Config
from .db import PROVENANCE_VALUES, USE_POLICY_VALUES, Store
from .embeddings import OpenRouterClient
from .guard import Guard, GuardRejection
from .judge_contracts import (
    validate_action_proposal,
    validate_judge_decision,
    validate_recall_request,
)


# Provenance values a worker may self-report on save_thought / supersede_thought.
# 'confirmed' is reserved for confirm_thought(id) — workers cannot self-elevate
# their own writes to instruction-grade.
SAVEABLE_PROVENANCE = PROVENANCE_VALUES - {"confirmed"}


INSTRUCTIONS = (
    "Persistent vector-searchable memory for Ace (hermes-agent) and other "
    "Open Brain consumers.\n\n"
    "TRUST MODEL — every entry carries a provenance label:\n"
    "  observed  = captured directly from a source (log, tool output, message)\n"
    "  inferred  = model derived this from other context           (EVIDENCE)\n"
    "  confirmed = a human explicitly confirmed it                 (INSTRUCTION)\n"
    "  imported  = migrated from an older system / transcript\n"
    "  generated = agent-produced during work (reviews, summaries)\n\n"
    "Treat use_policy='can_use_as_instruction' as instruction-grade. Treat "
    "use_policy='can_use_as_evidence' as evidence-grade, and never inject "
    "'requires_confirmation' or 'do_not_inject_automatically' as instructions.\n\n"
    "PROVENANCE INTEGRITY: save_thought / supersede_thought refuse "
    "provenance='confirmed'. Instruction-grade is set ONLY by confirm_thought(id), "
    "which models a deliberate human (or platform-trusted) endorsement.\n\n"
    "WORKFLOW:\n"
    "  1. RECALL: search_thoughts(..., "
    "allowed_use_policies=['can_use_as_instruction'])\n"
    "     before doing meaningful work.\n"
    "  2. WORK: do the thing, carrying task_id / channel / runtime context.\n"
    "  3. WRITE-BACK: save_thought(..., provenance, source, runtime, "
    "reasoning_model, channel, task_id, confidence) so the next agent can "
    "build on it. Writes pass through a trust-layer guard (rate limit + "
    "PII / secret check) before embedding.\n"
    "  4. PROMOTE: when the user confirms an inferred entry, call "
    "confirm_thought(id) to elevate it to provenance='confirmed' and "
    "use_policy='can_use_as_instruction'.\n"
    "  5. SUPERSEDE: when a fact changes, call supersede_thought(old_id, "
    "new_content, ...) instead of deleting — preserves the trail."
)


def build(cfg: Config, store: Store, embed: OpenRouterClient, guard: Guard) -> FastMCP:
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
        use_policy: str | None = Field(
            default=None,
            description=(
                "How callers may use this memory: can_use_as_instruction | "
                "can_use_as_evidence | requires_confirmation | "
                "do_not_inject_automatically. Defaults from provenance."
            ),
        ),
    ) -> dict[str, Any]:
        """Embed and store a new thought with provenance metadata."""
        if provenance not in SAVEABLE_PROVENANCE:
            raise ValueError(
                f"provenance={provenance!r} not allowed on save_thought; "
                f"allowed: {sorted(SAVEABLE_PROVENANCE)}. "
                "'confirmed' is set only via confirm_thought(id)."
            )
        if use_policy is not None and use_policy not in USE_POLICY_VALUES:
            raise ValueError(
                f"use_policy={use_policy!r} not allowed; "
                f"allowed: {sorted(USE_POLICY_VALUES)}."
            )
        try:
            guard.check_quota()
            await guard.check_content(content)
        except GuardRejection as e:
            raise ValueError(str(e)) from e
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
            use_policy=use_policy,
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
        allowed_use_policies: list[str] | None = Field(
            default=None,
            description="Restrict to entries whose use_policy is in this list.",
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
            allowed_use_policies=list(allowed_use_policies)
            if allowed_use_policies
            else None,
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
        allowed_use_policies: list[str] | None = Field(
            default=None,
            description="Restrict to use_policy values in this list.",
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
            allowed_use_policies=list(allowed_use_policies)
            if allowed_use_policies
            else None,
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
        use_policy: str | None = Field(default=None),
    ) -> dict[str, Any]:
        """Atomically replace an entry: insert new (linked via supersedes_id), soft-delete old."""
        if provenance not in SAVEABLE_PROVENANCE:
            raise ValueError(
                f"provenance={provenance!r} not allowed on supersede_thought; "
                f"allowed: {sorted(SAVEABLE_PROVENANCE)}. "
                "'confirmed' is set only via confirm_thought(id)."
            )
        if use_policy is not None and use_policy not in USE_POLICY_VALUES:
            raise ValueError(
                f"use_policy={use_policy!r} not allowed; "
                f"allowed: {sorted(USE_POLICY_VALUES)}."
            )
        try:
            guard.check_quota()
            await guard.check_content(new_content)
        except GuardRejection as e:
            raise ValueError(str(e)) from e
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
                use_policy=use_policy,
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

    @mcp.tool()
    async def list_use_policy_values() -> list[str]:
        """Enumerates allowed memory use-policy values."""
        return sorted(USE_POLICY_VALUES)

    @mcp.tool()
    async def judge_recall(
        request: dict[str, Any] = Field(
            description="OpenBrain Judge recall request envelope."
        ),
    ) -> dict[str, Any]:
        """Return scoped, provenance-labeled, use-policy-aware memory for judges."""
        recall = validate_recall_request(request)
        query = recall["query"]
        limits = recall["limits"]
        policy = recall["policy"]
        rows = await store.search(
            embedding=await embed.embed(query["summary"]),
            top_k=limits["max_items"],
            category=None,
            include_inactive=False,
            min_provenance=None,
            allowed_use_policies=policy["allowed_use_policies"],
            task_id=recall.get("task_id"),
        )
        return {
            "schema_version": "openbrain.judge.recall_response.v1",
            "request_id": recall["request_id"],
            "memories": [
                _row_to_recall_memory(
                    row,
                    workspace_id=recall["workspace_id"],
                    project_id=recall.get("project_id"),
                    visibility=recall["scope"]["visibility"],
                )
                for row in rows
                if _is_recall_eligible(row, policy["allowed_use_policies"])
            ],
            "policy_hits": [],
            "warnings": _recall_warnings(recall),
        }

    @mcp.tool()
    async def save_action_proposal(
        proposal: dict[str, Any] = Field(
            description="OpenBrain Judge action proposal envelope."
        ),
    ) -> dict[str, Any]:
        """Store an action proposal envelope idempotently by idempotency_key."""
        validated = validate_action_proposal(proposal)
        row = await store.insert_action_proposal(validated)
        return _action_proposal_to_payload(row)

    @mcp.tool()
    async def record_judge_decision(
        decision: dict[str, Any] = Field(
            description="OpenBrain Judge decision envelope."
        ),
    ) -> dict[str, Any]:
        """Store a judge decision envelope idempotently by idempotency_key."""
        validated = validate_judge_decision(decision)
        row = await store.insert_judge_decision(validated)
        candidates = await store.create_review_candidates_for_decision(row)
        payload = _judge_decision_to_payload(row)
        payload["review_candidates_created"] = len(candidates)
        return payload

    @mcp.tool()
    async def get_judge_decision(
        decision_id: str = Field(description="Judge decision id to fetch."),
    ) -> dict[str, Any]:
        """Fetch one judge decision by decision_id."""
        row = await store.get_judge_decision(decision_id)
        if row is None:
            return {"decision_id": decision_id, "found": False}
        payload = _judge_decision_to_payload(row)
        payload["found"] = True
        return payload

    @mcp.tool()
    async def list_review_queue(
        workspace_id: str = Field(description="Workspace id to list review candidates for."),
        project_id: str | None = Field(default=None, description="Optional project filter."),
        status: str | None = Field(default="pending", description="Optional review status filter."),
        limit: int = Field(default=20, ge=1, le=100),
    ) -> dict[str, Any]:
        """List review candidates awaiting or carrying human review state."""
        if status is not None and status not in REVIEW_STATUSES:
            raise ValueError(f"status={status!r} not allowed; allowed: {sorted(REVIEW_STATUSES)}")
        rows = await store.list_review_candidates(
            workspace_id=workspace_id,
            project_id=project_id,
            status=status,
            limit=limit,
        )
        return {"items": [_review_candidate_to_payload(row) for row in rows]}

    @mcp.tool()
    async def review_memory_candidate(
        candidate_id: str = Field(description="Review candidate id."),
        action: str = Field(
            description=(
                "Review action: confirm | edit | evidence_only | restrict_scope | "
                "mark_stale | reject | dispute | supersede."
            )
        ),
        reviewer: str = Field(description="Human or platform-trusted reviewer id."),
        note: str | None = Field(default=None),
        edited_content: str | None = Field(default=None),
        new_use_policy: str | None = Field(default=None),
        new_scope: str | None = Field(default=None),
    ) -> dict[str, Any]:
        """Apply a review action. Only confirm creates instruction-grade memory."""
        _validate_review_inputs(action, new_use_policy, new_scope)
        candidate = await store.get_review_candidate(candidate_id)
        if candidate is None:
            return {"candidate_id": candidate_id, "found": False}
        result_memory_id = None
        if action == "confirm":
            content = edited_content or candidate["proposed_content"]
            try:
                guard.check_quota()
                await guard.check_content(content)
            except GuardRejection as e:
                raise ValueError(str(e)) from e
            row = await store.insert_entry(
                category=candidate["proposed_category"],
                content=content,
                tags=list(candidate.get("proposed_tags") or []),
                embedding=await embed.embed(content),
                embedding_model=cfg.embedding_model,
                provenance="confirmed",
                source=f"review_candidate:{candidate_id}",
                runtime="ob1-mcp",
                reasoning_model=None,
                channel="review_queue",
                task_id=candidate.get("task_id"),
                confidence=candidate.get("confidence"),
                use_policy="can_use_as_instruction",
                user_confirmed_at=datetime.now(timezone.utc),
            )
            result_memory_id = row["id"]
        updated = await store.apply_review_action(
            candidate_id=candidate_id,
            action=action,
            reviewer=reviewer,
            note=note,
            edited_content=edited_content,
            new_use_policy=new_use_policy,
            new_scope=new_scope,
            result_memory_id=result_memory_id,
        )
        if updated is None:
            return {"candidate_id": candidate_id, "found": False}
        payload = _review_candidate_to_payload(updated)
        payload["found"] = True
        return payload

    @mcp.tool()
    async def inspect_memory(
        memory_id: int = Field(description="Memory entry id to inspect."),
    ) -> dict[str, Any]:
        """Explain one memory's source, trust status, usage, and injection eligibility."""
        row = await store.get_entry(memory_id)
        if row is None:
            return {"memory_id": memory_id, "found": False}
        used_by = await store.get_memory_decision_usage(memory_id)
        review_rows = await store.get_review_candidates_for_memory(memory_id)
        superseded_by = await store.get_superseding_entries(memory_id)
        warnings = _memory_inspector_warnings(row, superseded_by)
        return {
            "memory_id": memory_id,
            "found": True,
            "memory": _row_to_payload(row),
            "source": _memory_source(row),
            "created_by_decision": review_rows[0]["source_decision_id"] if review_rows else None,
            "used_by_decisions": [_memory_usage_to_payload(item) for item in used_by],
            "review": _review_candidate_to_payload(review_rows[0]) if review_rows else None,
            "supersedes": row.get("supersedes_id"),
            "superseded_by": [_row_to_payload(item) for item in superseded_by],
            "warnings": warnings,
            "automatic_injection_eligible": not warnings,
        }

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
        "use_policy": row.get("use_policy"),
        "user_confirmed_at": _iso(row.get("user_confirmed_at")),
        "supersedes_id": row.get("supersedes_id"),
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
    }
    if include_similarity and "similarity" in row:
        payload["similarity"] = round(float(row["similarity"]), 4)
    return payload


def _action_proposal_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "proposal_id": row["proposal_id"],
        "schema_version": row["schema_version"],
        "workspace_id": row["workspace_id"],
        "project_id": row.get("project_id"),
        "task_id": row.get("task_id"),
        "flow_id": row.get("flow_id"),
        "action_id": row["action_id"],
        "idempotency_key": row["idempotency_key"],
        "risk_class": row["risk_class"],
        "tool_name": row.get("tool_name"),
        "target_system": row.get("target_system"),
        "proposal": row.get("proposal"),
        "created_at": _iso(row.get("created_at")),
    }


def _judge_decision_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "decision_id": row["decision_id"],
        "schema_version": row["schema_version"],
        "workspace_id": row["workspace_id"],
        "project_id": row.get("project_id"),
        "task_id": row.get("task_id"),
        "flow_id": row.get("flow_id"),
        "action_id": row["action_id"],
        "proposal_id": row.get("proposal_id"),
        "idempotency_key": row["idempotency_key"],
        "decision": row["decision"],
        "confidence": row.get("confidence"),
        "judge_kind": row.get("judge_kind"),
        "decision_doc": row.get("decision_doc"),
        "memory_used": row.get("memory_used"),
        "memory_to_write": row.get("memory_to_write"),
        "requires_review": row.get("requires_review"),
        "created_at": _iso(row.get("created_at")),
    }


REVIEW_ACTIONS = {
    "confirm",
    "edit",
    "evidence_only",
    "restrict_scope",
    "mark_stale",
    "reject",
    "dispute",
    "supersede",
}
REVIEW_STATUSES = {
    "pending",
    "confirmed",
    "evidence_only",
    "restricted",
    "rejected",
    "disputed",
    "stale",
    "superseded",
}
REVIEW_SCOPES = {"personal", "project", "workspace", "org"}


def _review_candidate_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "candidate_id": row["candidate_id"],
        "source_decision_id": row["source_decision_id"],
        "workspace_id": row["workspace_id"],
        "project_id": row.get("project_id"),
        "task_id": row.get("task_id"),
        "flow_id": row.get("flow_id"),
        "candidate_kind": row["candidate_kind"],
        "proposed_content": row["proposed_content"],
        "proposed_category": row.get("proposed_category"),
        "proposed_tags": list(row.get("proposed_tags") or []),
        "provenance_status": row.get("provenance_status"),
        "confidence": row.get("confidence"),
        "suggested_use_policy": row.get("suggested_use_policy"),
        "visibility_scope": row.get("visibility_scope"),
        "review_status": row["review_status"],
        "review_priority": row.get("review_priority"),
        "reason": row.get("reason"),
        "created_at": _iso(row.get("created_at")),
        "reviewed_at": _iso(row.get("reviewed_at")),
        "reviewed_by": row.get("reviewed_by"),
        "result_memory_id": row.get("result_memory_id"),
    }


def _validate_review_inputs(
    action: str, new_use_policy: str | None, new_scope: str | None
) -> None:
    if action not in REVIEW_ACTIONS:
        raise ValueError(f"action={action!r} not allowed; allowed: {sorted(REVIEW_ACTIONS)}")
    if new_use_policy is not None and new_use_policy not in USE_POLICY_VALUES:
        raise ValueError(
            f"new_use_policy={new_use_policy!r} not allowed; "
            f"allowed: {sorted(USE_POLICY_VALUES)}"
        )
    if new_scope is not None and new_scope not in REVIEW_SCOPES:
        raise ValueError(f"new_scope={new_scope!r} not allowed; allowed: {sorted(REVIEW_SCOPES)}")


def _memory_source(row: dict[str, Any]) -> dict[str, Any]:
    source = row.get("source")
    if isinstance(source, str) and source.startswith("review_candidate:"):
        return {"kind": "review_candidate", "uri": source}
    if source:
        return {"kind": "manual_entry", "uri": source}
    return {"kind": "system_event", "uri": None}


def _memory_usage_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "decision_id": row.get("decision_id"),
        "action_id": row.get("action_id"),
        "decision": row.get("decision"),
        "used_as": row.get("used_as"),
        "created_at": _iso(row.get("created_at")),
    }


def _memory_inspector_warnings(
    row: dict[str, Any], superseded_by: list[dict[str, Any]]
) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    if not row.get("is_active", True):
        warnings.append({"code": "INACTIVE", "message": "Memory is inactive."})
    if superseded_by:
        warnings.append({"code": "SUPERSEDED", "message": "A newer memory supersedes this one."})
    if row.get("use_policy") != "can_use_as_instruction":
        warnings.append(
            {
                "code": "NOT_INSTRUCTION_GRADE",
                "message": "Memory use policy does not allow automatic instruction injection.",
            }
        )
    if row.get("provenance") not in {"confirmed", "observed"}:
        warnings.append(
            {
                "code": "UNCONFIRMED",
                "message": "Memory provenance is not instruction-grade.",
            }
        )
    return warnings


def _row_to_recall_memory(
    row: dict[str, Any],
    *,
    workspace_id: str,
    project_id: str | None,
    visibility: str,
) -> dict[str, Any]:
    source_value = row.get("source")
    return {
        "memory_id": str(row["id"]),
        "summary": _memory_summary(row),
        "content": row.get("content") or "",
        "source": {
            "kind": "manual_entry" if source_value else "system_event",
            "uri": source_value,
            "title": None,
            "timestamp": _iso(row.get("created_at")),
        },
        "provenance": {
            "status": row.get("provenance"),
            "confidence": row.get("confidence"),
            "created_by": _created_by_for_provenance(row.get("provenance")),
            "model": row.get("reasoning_model"),
            "runtime": row.get("runtime"),
        },
        "use_policy": {
            "policy": row.get("use_policy"),
            "reason": _use_policy_reason(row.get("use_policy"), row.get("provenance")),
        },
        "freshness": {
            "created_at": _iso(row.get("created_at")),
            "last_confirmed_at": _iso(row.get("user_confirmed_at")),
            "stale_after": None,
        },
        "scope": {
            "workspace_id": workspace_id,
            "project_id": project_id,
            "visibility": visibility,
        },
    }


def _is_recall_eligible(row: dict[str, Any], allowed_use_policies: list[str]) -> bool:
    if not row.get("is_active", True):
        return False
    if row.get("supersedes_id") is not None:
        # A row with supersedes_id is the replacement, not the old inactive row.
        return row.get("use_policy") in allowed_use_policies
    return row.get("use_policy") in allowed_use_policies


def _recall_warnings(recall: dict[str, Any]) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    scope = recall["scope"]
    if not scope.get("include_unconfirmed", False):
        warnings.append(
            {
                "code": "UNCONFIRMED_EXCLUDED",
                "message": "Unconfirmed future-facing memories are excluded by default.",
            }
        )
    if not scope.get("include_disputed", False):
        warnings.append(
            {
                "code": "DISPUTED_EXCLUDED",
                "message": "Disputed memories are not injected automatically.",
            }
        )
    return warnings


def _memory_summary(row: dict[str, Any]) -> str:
    content = str(row.get("content") or "")
    if len(content) <= 120:
        return content
    return content[:117].rstrip() + "..."


def _created_by_for_provenance(provenance: Any) -> str:
    if provenance == "confirmed":
        return "user"
    if provenance in {"generated", "inferred"}:
        return "agent"
    if provenance == "imported":
        return "import"
    return "system"


def _use_policy_reason(use_policy: Any, provenance: Any) -> str | None:
    if use_policy == "can_use_as_instruction":
        return "instruction-grade provenance" if provenance != "confirmed" else "human confirmed"
    if use_policy == "can_use_as_evidence":
        return "evidence only"
    if use_policy == "requires_confirmation":
        return "requires review before instruction use"
    if use_policy == "do_not_inject_automatically":
        return "restricted from automatic injection"
    return None


def _iso(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(dt)
