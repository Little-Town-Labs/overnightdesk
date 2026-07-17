#!/usr/bin/env python3
"""Pure authorization and content policy for the Titus AgentMail poller."""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
from email.utils import getaddresses
from typing import Iterable


MAX_REPLY_CHARS = 1200
QUEUE_RE = r"TITUS-[A-F0-9]{12}"
TOKEN_RE = r"[A-Za-z0-9_-]{43}"
COMMAND_RE = re.compile(rf"^(APPROVE|REJECT) ({QUEUE_RE}) ({TOKEN_RE})$")
MAILBOX_RE = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$")
SECRET_PATTERNS = (
    re.compile(r"authorization\s*:\s*bearer\s+\S{12,}", re.IGNORECASE),
    re.compile(r"\bsk-or-" r"v1-[A-Za-z0-9_-]{12,}\b", re.IGNORECASE),
    re.compile(r"\bam" r"_[A-Za-z0-9_-]{12,}\b", re.IGNORECASE),
)


class ConfigError(ValueError):
    """Raised when a security-sensitive poller setting is invalid."""


def normalize_single_sender(value: object) -> str | None:
    """Return one normalized mailbox or None for ambiguous/invalid input."""
    if not isinstance(value, str) or not value or "\r" in value or "\n" in value:
        return None
    parsed = [(name, address) for name, address in getaddresses([value]) if name or address]
    if len(parsed) != 1:
        return None
    address = parsed[0][1]
    if not address or not MAILBOX_RE.fullmatch(address):
        return None
    local, domain = address.rsplit("@", 1)
    if ".." in local or ".." in domain or domain.startswith(".") or domain.endswith("."):
        return None
    return f"{local}@{domain}".lower()


def parse_address_set(raw: str) -> set[str]:
    """Parse a comma-separated set of bare mailbox addresses."""
    if not isinstance(raw, str):
        raise ConfigError("address set must be a string")
    values: set[str] = set()
    for part in raw.split(","):
        candidate = part.strip()
        normalized = normalize_single_sender(candidate)
        if not candidate or normalized is None or candidate.lower() != normalized:
            raise ConfigError("address sets require bare normalized mailboxes")
        values.add(normalized)
    if not values:
        raise ConfigError("address set cannot be empty")
    return values


def require_exact_addresses(actual: Iterable[str], expected: Iterable[str], name: str) -> frozenset[str]:
    actual_set = frozenset(actual)
    expected_set = frozenset(expected)
    if actual_set != expected_set:
        raise ConfigError(f"{name} must contain the exact approved mailbox set")
    return actual_set


def classify_sender(sender: str | None, trusted_senders: Iterable[str]) -> str:
    if sender is None:
        return "invalid_sender"
    return "trusted" if sender in set(trusted_senders) else "external"


def queue_id_for(message_id: str) -> str:
    digest = hashlib.sha256(message_id.encode("utf-8")).hexdigest()[:12].upper()
    return f"TITUS-{digest}"


def deterministic_client_id(kind: str, message_id: str) -> str:
    safe_kind = re.sub(r"[^a-z0-9-]", "-", kind.lower()).strip("-")[:24]
    digest = hashlib.sha256(f"{kind}\0{message_id}".encode("utf-8")).hexdigest()[:24]
    return f"titus-{safe_kind}-{digest}"


def approval_token(queue_id: str, signing_secret: str) -> str:
    if len(signing_secret.encode("utf-8")) < 32:
        raise ConfigError("approval signing secret must be at least 32 bytes")
    digest = hmac.new(
        signing_secret.encode("utf-8"),
        f"titus-agentmail-approval-v1\0{queue_id}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def parse_approval_command(text: object) -> tuple[str, str, str] | None:
    if not isinstance(text, str):
        return None
    first = next((line.strip() for line in text.splitlines() if line.strip()), "")
    match = COMMAND_RE.fullmatch(first)
    if not match:
        return None
    return match.group(1).lower(), match.group(2), match.group(3)


def draft_digest(recipient: str, source_message_id: str, text: str) -> str:
    canonical = f"{recipient}\0{source_message_id}\0{text}".encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def validate_reply(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().replace("\x00", "")
    if not normalized or len(normalized) > MAX_REPLY_CHARS:
        return None
    if any(pattern.search(normalized) for pattern in SECRET_PATTERNS):
        return None
    return normalized


def bounded_email_text(message: dict[str, object], limit: int = 6000) -> str:
    """Return a plain-text excerpt without attachments or remote content."""
    for key in ("extracted_text", "text", "preview"):
        value = message.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:limit]
    return ""


def is_automated_message(message: dict[str, object]) -> bool:
    """Detect common automatic/bulk mail signals to prevent reply loops."""
    raw_headers = message.get("headers")
    if not isinstance(raw_headers, dict):
        return False
    headers = {str(key).lower(): str(value).strip().lower() for key, value in raw_headers.items()}
    auto_submitted = headers.get("auto-submitted", "")
    if auto_submitted and auto_submitted != "no":
        return True
    if headers.get("precedence", "") in {"bulk", "junk", "list"}:
        return True
    return any(
        key in headers
        for key in ("x-autoreply", "x-autorespond", "x-auto-response-suppress")
    )
