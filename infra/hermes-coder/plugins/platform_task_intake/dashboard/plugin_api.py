"""Least-authority Production Guardian intake for Walter's Kanban.

The API intentionally does not reuse the general Kanban POST contract. Every
authority-bearing field is absent from the request models and Pydantic rejects
extras. The server fixes board, status, assignee, workspace, and creator.
"""
from __future__ import annotations

import re
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from hermes_cli import kanban_db

router = APIRouter()

SERVICE = "overnightdesk-production-guardian"
IDEMPOTENCY = re.compile(r"^guardian:[A-Za-z0-9._:/-]{1,220}$")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(StrictModel):
    service: Literal["overnightdesk-production-guardian"]
    signal_key: str = Field(min_length=1, max_length=220)
    url: Optional[str] = Field(default=None, max_length=2048)


class CreateTask(StrictModel):
    title: str = Field(min_length=1, max_length=180)
    body: str = Field(min_length=1, max_length=12000)
    priority: int = Field(ge=0, le=100)
    idempotency_key: str = Field(min_length=10, max_length=230)
    source: Source


class ResolveTask(StrictModel):
    idempotency_key: str = Field(min_length=10, max_length=230)
    resolution: str = Field(min_length=1, max_length=2000)


def _conn():
    kanban_db.init_db(board=kanban_db.DEFAULT_BOARD)
    return kanban_db.connect(board=kanban_db.DEFAULT_BOARD)


def _validate_key(key: str, signal_key: Optional[str] = None) -> None:
    if not IDEMPOTENCY.fullmatch(key):
        raise HTTPException(status_code=400, detail="invalid idempotency key")
    if signal_key is not None and key != f"guardian:{signal_key}":
        raise HTTPException(
            status_code=400, detail="idempotency key does not match signal"
        )


def _prepare_for_resolution(conn, row) -> None:
    if row["assignee"] is not None:
        raise HTTPException(
            status_code=409, detail="Guardian task is assigned"
        )
    if row["status"] in ("done", "blocked"):
        return
    if row["status"] not in ("triage", "todo", "ready"):
        raise HTTPException(
            status_code=409, detail="Guardian task is running"
        )
    # Move the exact unassigned Guardian-owned row to blocked so it cannot
    # become or remain runnable before the audited completion call. A crash
    # leaves a safe state that the same idempotent resolution can retry.
    prepared = conn.execute(
        """
        UPDATE tasks SET status='blocked'
        WHERE id=? AND status=? AND assignee IS NULL AND created_by=?
        """,
        (row["id"], row["status"], SERVICE),
    )
    conn.commit()
    if prepared.rowcount != 1:
        raise HTTPException(
            status_code=409, detail="Guardian task state changed"
        )


@router.post("/tasks")
def create_task(request: CreateTask):
    _validate_key(request.idempotency_key, request.source.signal_key)
    with _conn() as conn:
        existing = conn.execute(
            """
            SELECT id,status,assignee,created_by
            FROM tasks
            WHERE idempotency_key=? AND status!='archived'
            ORDER BY created_at DESC LIMIT 1
            """,
            (request.idempotency_key,),
        ).fetchone()
        if existing:
            if (
                existing["created_by"] != SERVICE
                or existing["assignee"] is not None
            ):
                raise HTTPException(
                    status_code=409, detail="idempotency ownership conflict"
                )
            return {
                "task_id": existing["id"],
                "idempotency_key": request.idempotency_key,
                "created": False,
                "status": existing["status"],
                "assignee": None,
            }

        task_id = kanban_db.create_task(
            conn,
            title=request.title.strip(),
            body=request.body.strip(),
            assignee=None,
            created_by=SERVICE,
            workspace_kind="scratch",
            priority=request.priority,
            triage=True,
            idempotency_key=request.idempotency_key,
        )
        payload = {
            "task_id": task_id,
            "idempotency_key": request.idempotency_key,
            "created": True,
            "status": "triage",
            "assignee": None,
        }
        return JSONResponse(payload, status_code=201)


@router.post("/resolve")
def resolve_task(request: ResolveTask):
    _validate_key(request.idempotency_key)
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT id,status,assignee FROM tasks
            WHERE idempotency_key=? AND created_by=? AND status!='archived'
            ORDER BY created_at DESC LIMIT 1
            """,
            (request.idempotency_key, SERVICE),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Guardian task not found")
        _prepare_for_resolution(conn, row)
        if row["status"] != "done":
            completed = kanban_db.complete_task(
                conn,
                row["id"],
                result=request.resolution.strip(),
                summary="Resolved by Production Guardian source reconciliation",
                metadata={"resolved_by": SERVICE},
            )
            if not completed:
                raise HTTPException(
                    status_code=409, detail="task could not be resolved"
                )
        return {
            "task_id": row["id"],
            "idempotency_key": request.idempotency_key,
            "resolved": True,
        }
