from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol

APPROVAL_PURPOSE = b"overnightdesk:titus:guarded-email:approval:v1"
CANONICAL_VERSION = 1
DEFAULT_APPROVAL_TTL_SECONDS = 30 * 60
HTTP_TIMEOUT_SECONDS = 15.0
PROVIDER_IDEMPOTENCY_RETRY_SECONDS = 23 * 60 * 60
MAX_RECIPIENTS = 10
MAX_SUBJECT_CHARS = 998
MAX_TEXT_CHARS = 200_000
MAX_HTML_CHARS = 500_000
MAX_HTTP_RESPONSE_BYTES = 4_000_000
EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)
NONCE_PATTERN = re.compile(r"^[0-9a-f]{32}$")
MESSAGE_ID_PATTERN = re.compile(r"^[A-Za-z0-9@._<>+\-]{1,998}$")
THREAD_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


class SafeError(Exception):
    """An allowlisted failure that is safe to return without message content."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Draft:
    inbox_id: str
    to: tuple[str, ...]
    subject: str
    text: str | None
    html: str | None

    @classmethod
    def from_input(
        cls,
        *,
        expected_inbox_id: str,
        inbox_id: object,
        to: object,
        subject: object,
        text: object = None,
        html: object = None,
    ) -> "Draft":
        if not isinstance(inbox_id, str) or inbox_id != expected_inbox_id:
            raise SafeError("inbox_mismatch")
        if not isinstance(to, (list, tuple)) or not 1 <= len(to) <= MAX_RECIPIENTS:
            raise SafeError("invalid_recipients")

        normalized_recipients: list[str] = []
        seen: set[str] = set()
        for raw_recipient in to:
            recipient = _normalize_email_address(raw_recipient)
            if recipient in seen:
                raise SafeError("duplicate_recipient")
            seen.add(recipient)
            normalized_recipients.append(recipient)

        if not isinstance(subject, str) or not subject.strip():
            raise SafeError("blank_subject")
        if any(
            ord(character) < 32 or 0x7F <= ord(character) <= 0x9F
            for character in subject
        ):
            raise SafeError("invalid_subject")
        if len(subject) > MAX_SUBJECT_CHARS:
            raise SafeError("subject_too_long")

        normalized_text = _normalize_body(text, "text", MAX_TEXT_CHARS)
        normalized_html = _normalize_body(html, "html", MAX_HTML_CHARS)
        if normalized_text is None and normalized_html is None:
            raise SafeError("blank_body")

        return cls(
            inbox_id=inbox_id,
            to=tuple(normalized_recipients),
            subject=subject,
            text=normalized_text,
            html=normalized_html,
        )

    def canonical_dict(self) -> dict[str, object]:
        return {
            "v": CANONICAL_VERSION,
            "inbox_id": self.inbox_id,
            "to": list(self.to),
            "subject": self.subject,
            "text": self.text,
            "html": self.html,
            "attachments": [],
        }

    def as_public_dict(self) -> dict[str, object]:
        result = self.canonical_dict()
        result.pop("v")
        return result

    @property
    def canonical_bytes(self) -> bytes:
        return _canonical_json(self.canonical_dict())

    @property
    def digest(self) -> str:
        return hashlib.sha256(self.canonical_bytes).hexdigest()


def _normalize_email_address(value: object) -> str:
    if not isinstance(value, str):
        raise SafeError("invalid_recipient")
    if value != value.strip() or any(character.isspace() for character in value):
        raise SafeError("invalid_recipient")
    if len(value) > 254 or not EMAIL_PATTERN.fullmatch(value):
        raise SafeError("invalid_recipient")
    return value.lower()


def _normalize_body(value: object, field: str, maximum: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise SafeError(f"invalid_{field}")
    if not value.strip():
        raise SafeError(f"blank_{field}")
    if len(value) > maximum:
        raise SafeError(f"{field}_too_long")
    return value


def _canonical_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


@dataclass(frozen=True)
class Approval:
    token: str
    draft_fingerprint: str
    expires_at: int


@dataclass(frozen=True)
class ApprovalClaims:
    draft_digest: str
    nonce: str
    issued_at: int
    expires_at: int


class ApprovalSigner:
    def __init__(
        self,
        root_secret: bytes | str,
        *,
        ttl_seconds: int = DEFAULT_APPROVAL_TTL_SECONDS,
        clock: Callable[[], int | float] = time.time,
        nonce_factory: Callable[[], str] = lambda: secrets.token_hex(16),
    ) -> None:
        if isinstance(root_secret, str):
            root_secret = root_secret.encode("utf-8")
        if len(root_secret) < 16:
            raise SafeError("approval_secret_invalid")
        if not 60 <= ttl_seconds <= DEFAULT_APPROVAL_TTL_SECONDS:
            raise SafeError("approval_ttl_invalid")
        self._key = hmac.new(root_secret, APPROVAL_PURPOSE, hashlib.sha256).digest()
        self._ttl_seconds = ttl_seconds
        self._clock = clock
        self._nonce_factory = nonce_factory

    def prepare(self, draft: Draft) -> Approval:
        issued_at = int(self._clock())
        expires_at = issued_at + self._ttl_seconds
        nonce = self._nonce_factory()
        if not NONCE_PATTERN.fullmatch(nonce):
            raise SafeError("approval_nonce_invalid")
        payload = {
            "v": CANONICAL_VERSION,
            "iat": issued_at,
            "exp": expires_at,
            "nonce": nonce,
            "digest": draft.digest,
        }
        payload_bytes = _canonical_json(payload)
        signature = hmac.new(self._key, payload_bytes, hashlib.sha256).digest()
        return Approval(
            token=f"{_b64encode(payload_bytes)}.{_b64encode(signature)}",
            draft_fingerprint=draft.digest[:12],
            expires_at=expires_at,
        )

    def verify(self, token: object, draft: Draft) -> ApprovalClaims:
        claims = self._decode_claims(token)
        now = int(self._clock())
        if claims.issued_at > now + 60:
            raise SafeError("invalid_approval")
        if now > claims.expires_at:
            raise SafeError("approval_expired")
        if not hmac.compare_digest(claims.draft_digest, draft.digest):
            raise SafeError("approval_draft_mismatch")
        return claims

    def _decode_claims(self, token: object) -> ApprovalClaims:
        try:
            if (
                not isinstance(token, str)
                or len(token) > 2048
                or not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token)
            ):
                raise ValueError
            encoded_payload, encoded_signature = token.split(".", 1)
            payload_bytes = _b64decode(encoded_payload)
            signature = _b64decode(encoded_signature)
            expected_signature = hmac.new(
                self._key, payload_bytes, hashlib.sha256
            ).digest()
            if not hmac.compare_digest(signature, expected_signature):
                raise ValueError
            payload = json.loads(payload_bytes)
            if not isinstance(payload, dict) or set(payload) != {
                "v",
                "iat",
                "exp",
                "nonce",
                "digest",
            }:
                raise ValueError
            if payload["v"] != CANONICAL_VERSION:
                raise ValueError
            issued_at = int(payload["iat"])
            expires_at = int(payload["exp"])
            nonce = str(payload["nonce"])
            digest = str(payload["digest"])
            if (
                expires_at != issued_at + self._ttl_seconds
                or not NONCE_PATTERN.fullmatch(nonce)
                or not re.fullmatch(r"[0-9a-f]{64}", digest)
            ):
                raise ValueError
        except (TypeError, ValueError, KeyError, json.JSONDecodeError):
            raise SafeError("invalid_approval") from None

        return ApprovalClaims(
            draft_digest=digest,
            nonce=nonce,
            issued_at=issued_at,
            expires_at=expires_at,
        )


@dataclass(frozen=True)
class Attempt:
    logical_send_id: str
    draft_digest: str
    idempotency_key: str
    state: str
    safe_error_code: str | None
    provider_message_id: str | None
    provider_thread_id: str | None
    created_at: int
    updated_at: int


ALLOWED_ATTEMPT_TRANSITIONS = {
    "reserved": {"screened", "failed_pre_send"},
    "screened": {"screened", "provider_accepted", "ambiguous_unverified"},
    "failed_pre_send": {"retry_refused"},
    "provider_accepted": {
        "provider_accepted",
        "verified_sent",
        "ambiguous_unverified",
    },
    "ambiguous_unverified": {
        "screened",
        "ambiguous_unverified",
        "verified_sent",
        "retry_refused",
    },
    "verified_sent": {"verified_sent", "ambiguous_unverified"},
    "retry_refused": {"retry_refused"},
}


class AttemptStore:
    def __init__(
        self,
        path: Path | str,
        *,
        clock: Callable[[], int | float] = time.time,
    ) -> None:
        self.path = Path(path)
        self._clock = clock
        if self.path.is_symlink() or self.path.parent.is_symlink():
            raise SafeError("attempt_path_invalid")
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path.parent.chmod(0o700)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 5000")
        return connection

    def _initialize(self) -> None:
        connection = self._connect()
        try:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS guarded_send_attempts (
                    logical_send_id TEXT PRIMARY KEY,
                    draft_digest TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL UNIQUE,
                    state TEXT NOT NULL CHECK (state IN (
                        'reserved',
                        'screened',
                        'failed_pre_send',
                        'provider_accepted',
                        'ambiguous_unverified',
                        'verified_sent',
                        'retry_refused'
                    )),
                    safe_error_code TEXT,
                    provider_message_id TEXT,
                    provider_thread_id TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )
                """
            )
            connection.commit()
        finally:
            connection.close()
        self.path.chmod(0o600)

    def reserve(
        self,
        *,
        logical_send_id: str,
        draft_digest: str,
        idempotency_key: str,
    ) -> tuple[Attempt, bool]:
        now = int(self._clock())
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                """
                SELECT * FROM guarded_send_attempts
                WHERE logical_send_id = ?
                """,
                (logical_send_id,),
            ).fetchone()
            if existing:
                attempt = _attempt_from_row(existing)
                if (
                    attempt.draft_digest != draft_digest
                    or attempt.idempotency_key != idempotency_key
                ):
                    raise SafeError("attempt_binding_mismatch")
                connection.commit()
                return attempt, False
            attempt = self._insert_reserved(
                connection,
                logical_send_id=logical_send_id,
                draft_digest=draft_digest,
                idempotency_key=idempotency_key,
                now=now,
            )
            connection.commit()
            return attempt, True
        except sqlite3.IntegrityError:
            connection.rollback()
            raise SafeError("attempt_conflict") from None
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _insert_reserved(
        connection: sqlite3.Connection,
        *,
        logical_send_id: str,
        draft_digest: str,
        idempotency_key: str,
        now: int,
    ) -> Attempt:
        connection.execute(
            """
            INSERT INTO guarded_send_attempts (
                logical_send_id, draft_digest, idempotency_key, state,
                created_at, updated_at
            ) VALUES (?, ?, ?, 'reserved', ?, ?)
            """,
            (logical_send_id, draft_digest, idempotency_key, now, now),
        )
        row = connection.execute(
            "SELECT * FROM guarded_send_attempts WHERE logical_send_id = ?",
            (logical_send_id,),
        ).fetchone()
        return _attempt_from_row(row)

    def update(
        self,
        logical_send_id: str,
        *,
        state: str,
        safe_error_code: str | None = None,
        provider_message_id: str | None = None,
        provider_thread_id: str | None = None,
    ) -> Attempt:
        now = int(self._clock())
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            current = self._load_attempt(connection, logical_send_id)
            if state not in ALLOWED_ATTEMPT_TRANSITIONS[current.state]:
                raise SafeError("invalid_attempt_transition")
            connection.execute(
                """
                UPDATE guarded_send_attempts
                SET state = ?, safe_error_code = ?,
                    provider_message_id = COALESCE(?, provider_message_id),
                    provider_thread_id = COALESCE(?, provider_thread_id),
                    updated_at = ?
                WHERE logical_send_id = ?
                """,
                (
                    state,
                    safe_error_code,
                    provider_message_id,
                    provider_thread_id,
                    now,
                    logical_send_id,
                ),
            )
            row = connection.execute(
                "SELECT * FROM guarded_send_attempts WHERE logical_send_id = ?",
                (logical_send_id,),
            ).fetchone()
            connection.commit()
            return _attempt_from_row(row)
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _load_attempt(
        connection: sqlite3.Connection,
        logical_send_id: str,
    ) -> Attempt:
        row = connection.execute(
            "SELECT * FROM guarded_send_attempts WHERE logical_send_id = ?",
            (logical_send_id,),
        ).fetchone()
        if not row:
            raise SafeError("attempt_not_found")
        return _attempt_from_row(row)


def _attempt_from_row(row: sqlite3.Row) -> Attempt:
    return Attempt(**dict(row))


@dataclass(frozen=True)
class SendReceipt:
    message_id: str
    thread_id: str


HttpTransport = Callable[
    [str, str, dict[str, str], bytes | None, float],
    tuple[int, object],
]


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: object,
        code: int,
        msg: str,
        headers: object,
        newurl: str,
    ) -> None:
        return None


def _transport_url_allowed(parsed_url: urllib.parse.SplitResult) -> bool:
    agentmail = (
        parsed_url.scheme == "https"
        and parsed_url.hostname == "api.agentmail.to"
        and parsed_url.port in {None, 443}
    )
    security_team = (
        parsed_url.scheme == "http"
        and parsed_url.hostname == "overnightdesk-securityteam"
        and parsed_url.port == 4700
    )
    return agentmail or security_team


def urllib_transport(
    method: str,
    url: str,
    headers: dict[str, str],
    body: bytes | None,
    timeout: float,
) -> tuple[int, object]:
    parsed_url = urllib.parse.urlsplit(url)
    if not _transport_url_allowed(parsed_url):
        raise SafeError("transport_url_invalid")
    request = urllib.request.Request(  # noqa: S310 - URL is allowlisted above.
        url,
        data=body,
        headers=headers,
        method=method,
    )
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        _NoRedirectHandler,
    )
    try:
        with opener.open(  # noqa: S310 - URL is allowlisted and redirects disabled.
            request,
            timeout=timeout,
        ) as response:
            status = response.status
            payload_bytes = response.read(MAX_HTTP_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        status = error.code
        payload_bytes = error.read(MAX_HTTP_RESPONSE_BYTES + 1)
    if len(payload_bytes) > MAX_HTTP_RESPONSE_BYTES:
        raise SafeError("transport_response_too_large")
    payload: object = {}
    if payload_bytes:
        try:
            payload = json.loads(payload_bytes)
        except json.JSONDecodeError:
            payload = None
    return status, payload


class SecurityClient(Protocol):
    def screen(self, draft: Draft) -> None: ...


class AgentMailProvider(Protocol):
    def send(self, draft: Draft, idempotency_key: str) -> SendReceipt: ...

    def get_message(self, inbox_id: str, message_id: str) -> dict[str, object]: ...


class SecurityTeamClient:
    def __init__(
        self,
        *,
        base_url: str,
        token: str,
        transport: HttpTransport = urllib_transport,
        timeout: float = HTTP_TIMEOUT_SECONDS,
    ) -> None:
        if base_url != "http://overnightdesk-securityteam:4700":
            raise SafeError("security_url_invalid")
        if not token:
            raise SafeError("security_credential_unavailable")
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._transport = transport
        self._timeout = timeout

    @staticmethod
    def screened_content(draft: Draft) -> str:
        return _canonical_json(
            {
                "v": CANONICAL_VERSION,
                "subject": draft.subject,
                "text": draft.text,
                "html": draft.html,
                "attachments": [],
            }
        ).decode("utf-8")

    def screen(self, draft: Draft) -> None:
        screened_content = self.screened_content(draft)
        payload = {
            "kind": "send_email",
            "content": screened_content,
            "channel": "dm",
            "targetId": ",".join(draft.to),
        }
        try:
            status, response = self._transport(
                "POST",
                self._base_url + "/check-outbound",
                {
                    "Authorization": "Bearer " + self._token,
                    "Content-Type": "application/json",
                },
                _canonical_json(payload),
                self._timeout,
            )
        except (TimeoutError, urllib.error.URLError):
            raise SafeError("security_timeout") from None
        except Exception:
            raise SafeError("security_unavailable") from None

        if status >= 500:
            raise SafeError("security_unavailable")
        if not isinstance(response, dict):
            raise SafeError("security_malformed_response")
        if status != 200 or response.get("allowed") is not True:
            raise SafeError("security_denied")
        if not isinstance(response.get("content"), str):
            raise SafeError("security_malformed_response")
        if not hmac.compare_digest(
            response["content"].encode("utf-8"),
            screened_content.encode("utf-8"),
        ):
            raise SafeError("security_content_changed")


class AgentMailClient:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://api.agentmail.to/v0",
        transport: HttpTransport = urllib_transport,
        timeout: float = HTTP_TIMEOUT_SECONDS,
    ) -> None:
        if base_url != "https://api.agentmail.to/v0":
            raise SafeError("provider_url_invalid")
        if not api_key:
            raise SafeError("provider_credential_unavailable")
        self._api_key = api_key
        self._base_url = base_url
        self._transport = transport
        self._timeout = timeout

    def send(self, draft: Draft, idempotency_key: str) -> SendReceipt:
        payload: dict[str, object] = {
            "to": list(draft.to),
            "subject": draft.subject,
        }
        if draft.text is not None:
            payload["text"] = draft.text
        if draft.html is not None:
            payload["html"] = draft.html
        url = (
            self._base_url
            + "/inboxes/"
            + urllib.parse.quote(draft.inbox_id, safe="")
            + "/messages/send"
        )
        try:
            status, response = self._transport(
                "POST",
                url,
                {
                    "Authorization": "Bearer " + self._api_key,
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotency_key,
                },
                _canonical_json(payload),
                self._timeout,
            )
        except (TimeoutError, urllib.error.URLError):
            raise SafeError("provider_timeout") from None
        except Exception:
            raise SafeError("provider_unavailable") from None
        if status == 409:
            raise SafeError("provider_idempotency_conflict")
        if not 200 <= status < 300:
            raise SafeError("provider_rejected")
        return _parse_send_receipt(response)

    def get_message(self, inbox_id: str, message_id: str) -> dict[str, object]:
        url = (
            self._base_url
            + "/inboxes/"
            + urllib.parse.quote(inbox_id, safe="")
            + "/messages/"
            + urllib.parse.quote(message_id, safe="")
        )
        try:
            status, response = self._transport(
                "GET",
                url,
                {"Authorization": "Bearer " + self._api_key},
                None,
                self._timeout,
            )
        except (TimeoutError, urllib.error.URLError):
            raise SafeError("provider_readback_timeout") from None
        except Exception:
            raise SafeError("provider_readback_unavailable") from None
        if status != 200:
            raise SafeError("provider_readback_unavailable")
        if not isinstance(response, dict):
            raise SafeError("provider_readback_malformed")
        return response


def _parse_send_receipt(response: object) -> SendReceipt:
    if not isinstance(response, dict):
        raise SafeError("provider_malformed_response")
    message_id = response.get("message_id")
    thread_id = response.get("thread_id")
    if message_id is not None and (
        not isinstance(message_id, str) or not MESSAGE_ID_PATTERN.fullmatch(message_id)
    ):
        raise SafeError("provider_invalid_message_id")
    if thread_id is not None and (
        not isinstance(thread_id, str) or not THREAD_ID_PATTERN.fullmatch(thread_id)
    ):
        raise SafeError("provider_invalid_thread_id")
    return SendReceipt(
        message_id=message_id if isinstance(message_id, str) else "",
        thread_id=thread_id if isinstance(thread_id, str) else "",
    )
