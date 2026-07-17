#!/usr/bin/env python3
"""Durable, fail-closed AgentMail polling for the Hermes Titus tenant."""

from __future__ import annotations

import argparse
import hmac
import json
import os
import sqlite3
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from agentmail_policy import (
    ConfigError,
    approval_token,
    bounded_email_text,
    classify_sender,
    deterministic_client_id,
    draft_digest,
    is_automated_message,
    normalize_single_sender,
    parse_address_set,
    parse_approval_command,
    queue_id_for,
    require_exact_addresses,
    token_digest,
    validate_reply,
)
from agentmail_transport import AgentMailClient, ApiError, OpenRouterClient


APPROVED_ADDRESSES = frozenset(
    {"garyb@timelesstechs.com", "austin@timelesstechs.com"}
)
FALLBACK_REPLY = (
    "Thank you. I received your email and will follow up shortly.\n\n"
    "Best,\nTitus"
)
INVALID_APPROVAL_REPLY = (
    "I could not validate that approval command. Please use the exact APPROVE "
    "or REJECT line from the latest Titus approval request.\n\nBest,\nTitus"
)
def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def emit(event: str, status: str, **fields: Any) -> None:
    allowed = {
        "cycle_id",
        "message_id_hash",
        "queue_id",
        "classification",
        "attempt",
        "error_code",
        "duration_ms",
        "count",
        "state",
    }
    payload: dict[str, Any] = {"timestamp": utc_now(), "event": event, "status": status}
    payload.update({key: value for key, value in fields.items() if key in allowed})
    print(json.dumps(payload, separators=(",", ":"), sort_keys=True), flush=True)


@dataclass(frozen=True)
class PollerConfig:
    enabled: bool
    inbox_id: str
    inbox_address: str
    trusted_senders: frozenset[str]
    approvers: frozenset[str]
    signing_secret: str
    poll_interval: int
    max_messages: int
    database_path: str
    health_path: str
    agentmail_api_key: str = ""
    openrouter_api_key: str = ""
    model: str = ""
    agentmail_base_url: str = "https://api.agentmail.to/v0"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    api_timeout: int = 15

    @classmethod
    def from_env(cls) -> "PollerConfig":
        enabled_raw = os.environ.get("AGENTMAIL_POLLING_ENABLED", "false")
        if enabled_raw not in {"true", "false"}:
            raise ConfigError("AGENTMAIL_POLLING_ENABLED must be true or false")
        trusted = require_exact_addresses(
            parse_address_set(os.environ["AGENTMAIL_AUTO_REPLY_ALLOWED_SENDERS"]),
            APPROVED_ADDRESSES,
            "automatic reply sender set",
        )
        approvers = require_exact_addresses(
            parse_address_set(os.environ["AGENTMAIL_APPROVAL_ALLOWED_SENDERS"]),
            APPROVED_ADDRESSES,
            "approval sender set",
        )
        interval = _bounded_int("AGENTMAIL_POLL_INTERVAL_SECONDS", 30, 300)
        maximum = _bounded_int("AGENTMAIL_MAX_MESSAGES_PER_CYCLE", 1, 20)
        inbox_address = normalize_single_sender(os.environ.get("AGENTMAIL_EMAIL_ADDRESS"))
        if inbox_address is None:
            raise ConfigError("AGENTMAIL_EMAIL_ADDRESS is invalid")
        secret = os.environ.get("AGENTMAIL_APPROVAL_SIGNING_SECRET", "")
        if len(secret.encode("utf-8")) < 32:
            raise ConfigError("AGENTMAIL_APPROVAL_SIGNING_SECRET must be at least 32 bytes")
        required = {
            "AGENTMAIL_INBOX_ID": os.environ.get("AGENTMAIL_INBOX_ID", ""),
            "AGENTMAIL_API_KEY": os.environ.get("AGENTMAIL_API_KEY", ""),
            "OPENROUTER_API_KEY": os.environ.get("OPENROUTER_API_KEY", ""),
            "HERMES_DEFAULT_MODEL": os.environ.get("HERMES_DEFAULT_MODEL", ""),
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise ConfigError("required runtime setting unavailable: " + ", ".join(missing))
        return cls(
            enabled=enabled_raw == "true",
            inbox_id=required["AGENTMAIL_INBOX_ID"],
            inbox_address=inbox_address,
            trusted_senders=trusted,
            approvers=approvers,
            signing_secret=secret,
            poll_interval=interval,
            max_messages=maximum,
            database_path=os.environ.get(
                "AGENTMAIL_POLLER_DATABASE_PATH", "/opt/data/agentmail-poller/state.db"
            ),
            health_path=os.environ.get(
                "AGENTMAIL_POLLER_HEALTH_PATH", "/opt/data/agentmail-poller/health.json"
            ),
            agentmail_api_key=required["AGENTMAIL_API_KEY"],
            openrouter_api_key=required["OPENROUTER_API_KEY"],
            model=required["HERMES_DEFAULT_MODEL"],
        )


def _bounded_int(name: str, minimum: int, maximum: int) -> int:
    try:
        value = int(os.environ[name])
    except (KeyError, ValueError) as exc:
        raise ConfigError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise ConfigError(f"{name} must be between {minimum} and {maximum}")
    return value


class StateStore:
    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def _initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS message_processing (
                    message_id TEXT PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    sender TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    classification TEXT NOT NULL,
                    state TEXT NOT NULL,
                    client_id TEXT NOT NULL UNIQUE,
                    reply_text TEXT,
                    remote_id TEXT,
                    attempt_count INTEGER NOT NULL DEFAULT 0,
                    last_error_code TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS approval_request (
                    queue_id TEXT PRIMARY KEY,
                    source_message_id TEXT NOT NULL UNIQUE
                        REFERENCES message_processing(message_id),
                    draft_id TEXT UNIQUE,
                    draft_client_id TEXT NOT NULL UNIQUE,
                    notification_draft_id TEXT UNIQUE,
                    notification_client_id TEXT NOT NULL UNIQUE,
                    recipient TEXT NOT NULL,
                    in_reply_to TEXT NOT NULL,
                    draft_text TEXT NOT NULL,
                    draft_digest TEXT NOT NULL,
                    token_digest TEXT NOT NULL,
                    state TEXT NOT NULL,
                    decided_by TEXT,
                    decision_message_id TEXT,
                    sent_message_id TEXT,
                    created_at TEXT NOT NULL,
                    decided_at TEXT
                );
                CREATE TABLE IF NOT EXISTS poller_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )
            connection.execute(
                "INSERT OR IGNORE INTO poller_metadata(key, value) VALUES('schema_version', '1')"
            )

    def reserve_message(self, message: dict[str, Any], classification: str) -> bool:
        now = utc_now()
        sender = normalize_single_sender(message.get("from")) or "invalid"
        subject = str(message.get("subject") or "")[:300]
        client_id = deterministic_client_id(classification, str(message["message_id"]))
        with self.connect() as connection:
            cursor = connection.execute(
                """INSERT OR IGNORE INTO message_processing(
                    message_id, thread_id, sender, subject, classification, state,
                    client_id, created_at, updated_at
                ) VALUES(?, ?, ?, ?, ?, 'processing', ?, ?, ?)""",
                (
                    str(message["message_id"]),
                    str(message.get("thread_id") or "unknown"),
                    sender,
                    subject,
                    classification,
                    client_id,
                    now,
                    now,
                ),
            )
            return cursor.rowcount == 1

    def mark_preexisting(self, message: dict[str, Any]) -> bool:
        inserted = self.reserve_message(message, "preexisting")
        if inserted:
            self.update_message(str(message["message_id"]), state="preexisting")
        return inserted

    def get_message(self, message_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM message_processing WHERE message_id = ?", (message_id,)
            ).fetchone()
        return dict(row) if row else None

    def update_message(self, message_id: str, **values: Any) -> None:
        allowed = {"state", "reply_text", "remote_id", "last_error_code", "attempt_count"}
        updates = {key: value for key, value in values.items() if key in allowed}
        updates["updated_at"] = utc_now()
        clauses = ", ".join(f"{key} = ?" for key in updates)
        with self.connect() as connection:
            connection.execute(
                f"UPDATE message_processing SET {clauses} WHERE message_id = ?",
                (*updates.values(), message_id),
            )

    def create_approval(
        self,
        *,
        queue_id: str,
        source_message_id: str,
        recipient: str,
        draft_text: str,
        draft_digest_value: str,
        token_digest_value: str,
    ) -> bool:
        now = utc_now()
        with self.connect() as connection:
            cursor = connection.execute(
                """INSERT OR IGNORE INTO approval_request(
                    queue_id, source_message_id, draft_client_id,
                    notification_client_id, recipient, in_reply_to, draft_text,
                    draft_digest, token_digest, state, created_at
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'preparing', ?)""",
                (
                    queue_id,
                    source_message_id,
                    deterministic_client_id("approval-draft", source_message_id),
                    deterministic_client_id("approval-notice", source_message_id),
                    recipient,
                    source_message_id,
                    draft_text,
                    draft_digest_value,
                    token_digest_value,
                    now,
                ),
            )
            return cursor.rowcount == 1

    def get_approval(self, queue_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM approval_request WHERE queue_id = ?", (queue_id,)
            ).fetchone()
        return dict(row) if row else None

    def update_approval(self, queue_id: str, **values: Any) -> None:
        allowed = {
            "draft_id",
            "notification_draft_id",
            "state",
            "decided_by",
            "decision_message_id",
            "sent_message_id",
            "decided_at",
        }
        updates = {key: value for key, value in values.items() if key in allowed}
        clauses = ", ".join(f"{key} = ?" for key in updates)
        with self.connect() as connection:
            connection.execute(
                f"UPDATE approval_request SET {clauses} WHERE queue_id = ?",
                (*updates.values(), queue_id),
            )

    def claim_decision(self, queue_id: str, decision: str, actor: str, message_id: str) -> bool:
        state = "approving" if decision == "approve" else "rejecting"
        with self.connect() as connection:
            cursor = connection.execute(
                """UPDATE approval_request
                   SET state = ?, decided_by = ?, decision_message_id = ?, decided_at = ?
                   WHERE queue_id = ? AND state = 'pending'""",
                (state, actor, message_id, utc_now(), queue_id),
            )
            return cursor.rowcount == 1

    def set_metadata(self, key: str, value: str) -> None:
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO poller_metadata(key, value) VALUES(?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value""",
                (key, value),
            )


class Poller:
    def __init__(
        self,
        config: PollerConfig,
        store: StateStore,
        agentmail: Any,
        model: Any,
    ):
        self.config = config
        self.store = store
        self.agentmail = agentmail
        self.model = model

    def initialize(self, leave_latest_trusted: bool = False) -> dict[str, Any]:
        count = 0
        inbound = [
            item
            for item in self._list_messages(maximum=1000, max_pages=100)
            if self._is_inbound(item)
        ]
        excluded_id = self._latest_trusted_candidate(inbound) if leave_latest_trusted else None
        for item in inbound:
            if item.get("message_id") == excluded_id:
                continue
            if self.store.mark_preexisting(item):
                count += 1
        timestamp = utc_now()
        self.store.set_metadata("initialized_at", timestamp)
        self._write_health("disabled" if not self.config.enabled else "initialized")
        emit("poller.initialize", "ok", count=count)
        return {"preexisting": count, "eligible": 1 if excluded_id else 0, "sends": 0}

    def _latest_trusted_candidate(self, inbound: list[dict[str, Any]]) -> str:
        if not inbound:
            raise ConfigError("no inbound message is available for controlled processing")
        latest = inbound[0]
        sender = normalize_single_sender(latest.get("from"))
        labels = {str(value).lower() for value in latest.get("labels", [])}
        if sender not in self.config.trusted_senders or "unread" not in labels:
            raise ConfigError("latest inbound message is not an unread trusted-sender message")
        return str(latest["message_id"])

    def run_once(self) -> dict[str, Any]:
        if not self.config.enabled:
            self.store.set_metadata("enabled", "false")
            self._write_health("disabled")
            emit("poller.cycle", "ok", state="disabled", count=0)
            return {"state": "disabled", "processed": 0}
        cycle_id = str(int(time.time() * 1000))
        started = time.monotonic()
        self.store.set_metadata("enabled", "true")
        self.store.set_metadata("last_cycle_started_at", utc_now())
        processed = 0
        try:
            for summary in self._list_messages(maximum=200, max_pages=10):
                if processed >= self.config.max_messages:
                    break
                if not self._is_inbound(summary):
                    continue
                message_id = str(summary.get("message_id") or "")
                if not message_id or self._is_terminal(message_id):
                    continue
                full = self.agentmail.get_message(message_id)
                if self.process_message(full):
                    processed += 1
            self.store.set_metadata("last_cycle_completed_at", utc_now())
            self.store.set_metadata("last_success_at", utc_now())
            self._write_health("healthy")
            emit(
                "poller.cycle",
                "ok",
                cycle_id=cycle_id,
                count=processed,
                duration_ms=int((time.monotonic() - started) * 1000),
            )
            return {"state": "healthy", "processed": processed}
        except Exception as exc:
            code = exc.code if isinstance(exc, ApiError) else "cycle_error"
            self.store.set_metadata("last_error_code", code)
            self._write_health("error", code)
            emit("poller.cycle", "error", cycle_id=cycle_id, error_code=code)
            raise

    def run(self) -> None:
        while True:
            try:
                self.run_once()
            except Exception:
                pass
            time.sleep(self.config.poll_interval)

    def process_message(self, message: dict[str, Any]) -> bool:
        message_id = str(message.get("message_id") or "")
        sender = normalize_single_sender(message.get("from"))
        text = bounded_email_text(message)
        command = parse_approval_command(text)
        if command and sender in self.config.approvers:
            return self._process_approval_command(message, sender, command)
        if sender is None or is_automated_message(message):
            classification = "invalid_sender" if sender is None else "automated"
            if not self.store.get_message(message_id):
                self.store.reserve_message(message, classification)
                self.store.update_message(message_id, state="suppressed")
                emit(
                    "message.suppress",
                    "ok",
                    message_id_hash=queue_id_for(message_id),
                    classification=classification,
                )
                return True
            return False
        classification = classify_sender(sender, self.config.trusted_senders)
        existing = self.store.get_message(message_id)
        if existing and existing["state"] != "processing":
            return False
        if not existing:
            self.store.reserve_message(message, classification)
        if classification == "trusted":
            invalid_approval = str(message.get("subject") or "").lower().startswith(
                "re: [titus approval"
            )
            self._process_trusted(message, INVALID_APPROVAL_REPLY if invalid_approval else None)
        else:
            self._process_external(message, sender)
        return True

    def _process_trusted(self, message: dict[str, Any], fixed_reply: str | None = None) -> None:
        message_id = str(message["message_id"])
        row = self.store.get_message(message_id)
        assert row is not None
        reply = fixed_reply or row["reply_text"] or self._generate_reply(message)
        if row["reply_text"] != reply:
            self.store.update_message(message_id, reply_text=reply)
        client_id = row["client_id"]
        if row["remote_id"]:
            draft_id = str(row["remote_id"])
        else:
            draft = self.agentmail.create_draft(
                in_reply_to=message_id,
                text=reply,
                client_id=client_id,
            )
            draft_id = str(draft["draft_id"])
            self._verify_draft(draft, normalize_single_sender(message.get("from")), message_id, reply)
            self.store.update_message(message_id, remote_id=draft_id)
        result = self.agentmail.send_draft(draft_id)
        self.store.update_message(message_id, state="replied", remote_id=result.get("message_id", draft_id))
        emit("message.reply", "sent", message_id_hash=queue_id_for(message_id), classification="trusted")

    def _process_external(self, message: dict[str, Any], sender: str) -> None:
        message_id = str(message["message_id"])
        queue_id = queue_id_for(message_id)
        approval = self.store.get_approval(queue_id)
        if approval and approval["state"] in {"pending", "approved", "rejected", "failed"}:
            return
        token = approval_token(queue_id, self.config.signing_secret)
        if approval is None:
            reply = self._generate_reply(message)
            self.store.create_approval(
                queue_id=queue_id,
                source_message_id=message_id,
                recipient=sender,
                draft_text=reply,
                draft_digest_value=draft_digest(sender, message_id, reply),
                token_digest_value=token_digest(token),
            )
            approval = self.store.get_approval(queue_id)
        assert approval is not None
        if not approval["draft_id"]:
            draft = self.agentmail.create_draft(
                in_reply_to=message_id,
                text=approval["draft_text"],
                client_id=approval["draft_client_id"],
            )
            self._verify_draft(draft, sender, message_id, approval["draft_text"])
            self.store.update_approval(queue_id, draft_id=str(draft["draft_id"]))
            approval = self.store.get_approval(queue_id)
        assert approval is not None
        if not approval["notification_draft_id"]:
            notice = self.agentmail.create_draft(
                to=sorted(self.config.approvers),
                subject=f"[Titus approval {queue_id}] Reply requested: {str(message.get('subject') or '')[:120]}",
                text=self._approval_notice(approval, token, str(message.get("subject") or "")),
                client_id=approval["notification_client_id"],
            )
            self.store.update_approval(queue_id, notification_draft_id=str(notice["draft_id"]))
            approval = self.store.get_approval(queue_id)
        assert approval is not None
        self.agentmail.send_draft(str(approval["notification_draft_id"]))
        self.store.update_approval(queue_id, state="pending")
        self.store.update_message(message_id, state="pending_approval", remote_id=approval["draft_id"])
        emit("message.queue", "pending", message_id_hash=queue_id, queue_id=queue_id, classification="external")

    def _process_approval_command(
        self,
        message: dict[str, Any],
        sender: str,
        command: tuple[str, str, str],
    ) -> bool:
        decision, queue_id, presented_token = command
        message_id = str(message["message_id"])
        existing_message = self.store.get_message(message_id)
        if existing_message and existing_message["state"] != "processing":
            return False
        if not existing_message:
            self.store.reserve_message(message, "approval_command")
        approval = self.store.get_approval(queue_id)
        if (
            not self._approval_is_valid(approval, queue_id, presented_token)
            or not self._claim_or_resume_decision(
                approval, queue_id, decision, sender, message_id
            )
        ):
            self.store.update_message(message_id, state="command_processed", last_error_code="invalid_command")
            emit("approval.command", "rejected", queue_id=queue_id, error_code="invalid_command")
            return True
        if decision == "reject":
            self.store.update_approval(queue_id, state="rejected")
            self.store.update_message(message_id, state="command_processed")
            emit("approval.command", "rejected_by_operator", queue_id=queue_id)
            return True
        claimed = self.store.get_approval(queue_id)
        assert claimed is not None
        result = self._send_approved_draft(queue_id, claimed)
        if result is None:
            self.store.update_message(message_id, state="command_processed", last_error_code="draft_mismatch")
            return True
        self.store.update_approval(
            queue_id, state="approved", sent_message_id=result.get("message_id", "reconciled")
        )
        self.store.update_message(message_id, state="command_processed")
        emit("approval.command", "approved", queue_id=queue_id)
        return True

    def _approval_is_valid(
        self, approval: dict[str, Any] | None, queue_id: str, presented_token: str
    ) -> bool:
        if approval is None:
            return False
        expected = approval_token(queue_id, self.config.signing_secret)
        return hmac.compare_digest(expected, presented_token) and hmac.compare_digest(
            approval["token_digest"], token_digest(presented_token)
        )

    def _claim_or_resume_decision(
        self,
        approval: dict[str, Any] | None,
        queue_id: str,
        decision: str,
        sender: str,
        message_id: str,
    ) -> bool:
        if self.store.claim_decision(queue_id, decision, sender, message_id):
            return True
        if approval is None:
            return False
        resumable = {"approving", "sending"} if decision == "approve" else {"rejecting"}
        return (
            approval["state"] in resumable
            and approval["decided_by"] == sender
            and approval["decision_message_id"] == message_id
        )

    def _send_approved_draft(
        self, queue_id: str, claimed: dict[str, Any]
    ) -> dict[str, Any] | None:
        try:
            if claimed["state"] == "approving":
                draft = self.agentmail.get_draft(claimed["draft_id"])
                self._verify_draft(
                    draft, claimed["recipient"], claimed["in_reply_to"], claimed["draft_text"]
                )
                live_digest = draft_digest(
                    claimed["recipient"], claimed["in_reply_to"], draft["text"]
                )
                if not hmac.compare_digest(claimed["draft_digest"], live_digest):
                    raise ValueError("draft_digest_mismatch")
                self.store.update_approval(queue_id, state="sending")
            result = self.agentmail.send_draft(claimed["draft_id"])
        except ValueError:
            self.store.update_approval(queue_id, state="failed")
            emit("approval.command", "error", queue_id=queue_id, error_code="draft_mismatch")
            return None
        return result

    def _generate_reply(self, message: dict[str, Any]) -> str:
        try:
            candidate = self.model.generate_reply(
                str(message.get("subject") or "")[:300], bounded_email_text(message)
            )
            return validate_reply(candidate) or FALLBACK_REPLY
        except Exception:
            return FALLBACK_REPLY

    def _verify_draft(
        self,
        draft: dict[str, Any],
        expected_recipient: str | None,
        source_message_id: str,
        text: str,
    ) -> None:
        recipients = {
            normalized
            for item in draft.get("to", [])
            if (normalized := normalize_single_sender(item)) is not None
        }
        if expected_recipient is None or recipients != {expected_recipient}:
            raise ValueError("draft_recipient_mismatch")
        if draft.get("in_reply_to") != source_message_id or draft.get("text") != text:
            raise ValueError("draft_content_mismatch")

    def _approval_notice(self, approval: dict[str, Any], token: str, subject: str) -> str:
        return (
            "Titus queued a reply for approval.\n\n"
            f"From: {approval['recipient']}\n"
            f"Subject: {subject[:200]}\n"
            f"Queue: {approval['queue_id']}\n\n"
            "Proposed reply:\n---\n"
            f"{approval['draft_text']}\n"
            "---\n\nReply with exactly one of these as the first non-empty line:\n"
            f"APPROVE {approval['queue_id']} {token}\n"
            f"REJECT {approval['queue_id']} {token}"
        )

    def _list_messages(self, maximum: int, max_pages: int) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        page_token: str | None = None
        for _ in range(max_pages):
            response = self.agentmail.list_messages(
                page_token=page_token, limit=min(20, maximum - len(items))
            )
            items.extend(response.get("messages") or [])
            if len(items) >= maximum:
                break
            page_token = response.get("next_page_token")
            if not page_token:
                break
        return items[:maximum]

    def _is_inbound(self, message: dict[str, Any]) -> bool:
        labels = {str(item).lower() for item in message.get("labels", [])}
        if labels.intersection({"sent", "draft", "spam", "trash"}):
            return False
        return normalize_single_sender(message.get("from")) != self.config.inbox_address

    def _is_terminal(self, message_id: str) -> bool:
        row = self.store.get_message(message_id)
        return bool(row and row["state"] != "processing")

    def _write_health(self, state: str, error_code: str | None = None) -> None:
        path = Path(self.config.health_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "state": state,
            "timestamp": utc_now(),
            "timestamp_epoch": int(time.time()),
            "error_code": error_code,
        }
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, path)


def health_status(path: str, now_epoch: int | None = None, max_age: int = 180) -> tuple[bool, str]:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        state = payload["state"]
        if state == "disabled":
            return True, "disabled"
        age = (int(time.time()) if now_epoch is None else now_epoch) - int(payload["timestamp_epoch"])
        if state in {"healthy", "initialized"} and 0 <= age <= max_age:
            return True, state
        return False, "stale"
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return False, "missing"


def build_poller(config: PollerConfig) -> Poller:
    return Poller(
        config,
        StateStore(config.database_path),
        AgentMailClient(config),
        OpenRouterClient(config),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Hermes Titus AgentMail poller")
    parser.add_argument("command", choices=("initialize", "run", "run-once", "health"))
    parser.add_argument(
        "--leave-latest-trusted",
        action="store_true",
        help="during initialization, leave exactly the newest unread trusted message eligible",
    )
    args = parser.parse_args()
    try:
        config = PollerConfig.from_env()
        if args.command == "health":
            healthy, state = health_status(
                config.health_path, max_age=max(180, config.poll_interval * 3)
            )
            print(f"agentmail_poller={state}")
            return 0 if healthy else 1
        poller = build_poller(config)
        if args.command == "initialize":
            result = poller.initialize(leave_latest_trusted=args.leave_latest_trusted)
            print(json.dumps(result, separators=(",", ":")))
        elif args.command == "run-once":
            poller.run_once()
        else:
            poller.run()
        return 0
    except (ConfigError, KeyError) as exc:
        emit("poller.start", "error", error_code="configuration_error")
        print(f"agentmail poller configuration error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
