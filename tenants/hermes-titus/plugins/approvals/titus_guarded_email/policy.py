"""Fail-closed, content-free approval policy for Titus outbound email."""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import time
from collections.abc import Mapping
from pathlib import Path
from typing import Any


GUARDED_SEND_TOOL = "titus_send_approved_email"
_CANONICAL_VERSION = 1
_MARKER_TTL_SECONDS = 15 * 60
_MARKER_DIR = "/opt/data/guarded-agentmail/approval-gates"
_pending_markers: dict[str, Path] = {}


def _current_platform() -> str:
    """Read the current Hermes session without trusting a stale global mirror."""

    try:
        from gateway.session_context import get_session_env

        return get_session_env("HERMES_SESSION_PLATFORM", "").strip().casefold()
    except Exception:
        return os.environ.get("HERMES_SESSION_PLATFORM", "").strip().casefold()


def _approval_bypass_active() -> bool:
    """Never let yolo/off approval modes authorize outbound email."""

    try:
        from tools.approval import is_approval_bypass_active

        return bool(is_approval_bypass_active())
    except Exception:
        return False


def _canonical_review_fields(args: Mapping[str, Any]) -> dict[str, Any]:
    """Build only the non-secret fields needed for a stable review digest."""

    recipients = args.get("to")
    if isinstance(recipients, (list, tuple)):
        normalized_recipients = [
            value.casefold() if isinstance(value, str) else value
            for value in recipients
        ]
    else:
        normalized_recipients = recipients

    def optional_body(name: str) -> str | None:
        value = args.get(name)
        if not isinstance(value, str) or not value.strip():
            return None
        return value

    return {
        "v": _CANONICAL_VERSION,
        "inbox_id": args.get("inbox_id"),
        "to": normalized_recipients,
        "subject": args.get("subject"),
        "text": optional_body("text"),
        "html": optional_body("html"),
        "attachments": [],
    }


def draft_fingerprint(args: Mapping[str, Any]) -> str:
    """Return a short digest without retaining or displaying the draft."""

    encoded = json.dumps(
        _canonical_review_fields(args),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:12]


def _unique_rule_key(tool_call_id: str) -> str:
    """Make session/permanent compatibility choices specific to one call."""

    source = tool_call_id.strip() or secrets.token_hex(32)
    return "titus-email:" + hashlib.sha256(source.encode("utf-8")).hexdigest()


def _session_key() -> str:
    try:
        from gateway.session_context import get_session_env

        return get_session_env("HERMES_SESSION_KEY", "").strip()
    except Exception:
        return os.environ.get("HERMES_SESSION_KEY", "").strip()


def _marker_prefix(session_key: str, fingerprint: str, approval_token: object) -> str:
    token_digest = hashlib.sha256(str(approval_token).encode("utf-8")).hexdigest()
    return hashlib.sha256(
        f"{session_key}\0{fingerprint}\0{token_digest}".encode("utf-8")
    ).hexdigest()


def _record_pending_gateway_gate(
    session_key: str, fingerprint: str, approval_token: object, rule_key: str
) -> bool:
    """Record a content-free handoff for the child MCP process."""

    if not session_key:
        return False
    directory = Path(
        os.environ.get("TITUS_GUARDED_EMAIL_APPROVAL_MARKER_DIR", _MARKER_DIR)
    )
    try:
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        now = time.time()
        prefix = _marker_prefix(session_key, fingerprint, approval_token)
        for stale in directory.glob(f"{prefix}.*"):
            try:
                if now - stale.stat().st_mtime > _MARKER_TTL_SECONDS:
                    stale.unlink()
            except FileNotFoundError:
                continue
        marker = directory / f"{prefix}.{secrets.token_hex(16)}"
        marker.touch(mode=0o600, exist_ok=False)
        _pending_markers[rule_key] = marker
        return True
    except (FileExistsError, OSError):
        return False


def on_pre_tool_call(
    *,
    tool_name: str = "",
    args: Any = None,
    tool_call_id: str = "",
    **_: Any,
) -> dict[str, str] | None:
    """Escalate only Telegram-initiated guarded email sends."""

    if (
        tool_name != GUARDED_SEND_TOOL
        or _current_platform() != "telegram"
        or _approval_bypass_active()
    ):
        return None
    fields = args if isinstance(args, Mapping) else {}
    fingerprint = draft_fingerprint(fields)
    rule_key = _unique_rule_key(tool_call_id)
    if not _record_pending_gateway_gate(
        _session_key(), fingerprint, fields.get("approval_token"), rule_key
    ):
        return {
            "action": "block",
            "message": "BLOCKED: Telegram approval handoff is unavailable.",
        }
    return {
        "action": "approve",
        "rule_key": rule_key,
        "message": (
            "Approve the exact Titus outbound email draft with fingerprint "
            f"{fingerprint} shown in this Telegram conversation. Verify the "
            "recipients, subject, complete body, and attachments=[] before "
            "choosing Approve Once."
        ),
    }


def on_post_approval_response(
    *,
    pattern_key: str = "",
    choice: str = "",
    **_: Any,
) -> None:
    """Remove an unapproved marker so a denial cannot be replayed later."""

    rule_key = pattern_key.removeprefix("plugin_rule:")
    marker = _pending_markers.pop(rule_key, None)
    if marker is None or choice in {"once", "session", "always"}:
        return
    try:
        marker.unlink()
    except FileNotFoundError:
        pass
    except OSError:
        return


def register(ctx: Any) -> None:
    """Register the policy with Hermes's pre-tool approval hook."""

    ctx.register_hook("pre_tool_call", on_pre_tool_call)
    ctx.register_hook("post_approval_response", on_post_approval_response)
