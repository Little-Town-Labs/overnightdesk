from __future__ import annotations

import hashlib
import os
import time
from collections.abc import Callable, Mapping
from datetime import UTC, datetime

from guarded_email import (
    PROVIDER_IDEMPOTENCY_RETRY_SECONDS,
    AgentMailClient,
    AgentMailProvider,
    ApprovalSigner,
    Attempt,
    AttemptStore,
    Draft,
    SafeError,
    SecurityClient,
    SecurityTeamClient,
    _normalize_email_address,
)


class GuardedEmailService:
    def __init__(
        self,
        *,
        expected_inbox_id: str,
        signer: ApprovalSigner,
        store: AttemptStore,
        security_client: SecurityClient,
        agentmail_client: AgentMailProvider,
        clock: Callable[[], int | float] = time.time,
    ) -> None:
        self._expected_inbox_id = expected_inbox_id
        self._signer = signer
        self._store = store
        self._security = security_client
        self._agentmail = agentmail_client
        self._clock = clock

    def prepare_email(
        self,
        *,
        inbox_id: object,
        to: object,
        subject: object,
        text: object = None,
        html: object = None,
    ) -> dict[str, object]:
        draft = Draft.from_input(
            expected_inbox_id=self._expected_inbox_id,
            inbox_id=inbox_id,
            to=to,
            subject=subject,
            text=text,
            html=html,
        )
        approval = self._signer.prepare(draft)
        return {
            "status": "ready_for_owner_approval",
            "approval_token": approval.token,
            "draft_fingerprint": approval.draft_fingerprint,
            "expires_at": datetime.fromtimestamp(approval.expires_at, tz=UTC)
            .isoformat()
            .replace("+00:00", "Z"),
            "draft": draft.as_public_dict(),
            "next_action": (
                "Show the exact draft and obtain explicit owner approval before "
                "calling titus_send_approved_email."
            ),
        }

    def validate_approval(
        self,
        *,
        approval_token: object,
        inbox_id: object,
        to: object,
        subject: object,
        text: object = None,
        html: object = None,
    ) -> str:
        """Validate an exact prepared draft without reserving or sending it."""
        draft = Draft.from_input(
            expected_inbox_id=self._expected_inbox_id,
            inbox_id=inbox_id,
            to=to,
            subject=subject,
            text=text,
            html=html,
        )
        self._signer.verify(approval_token, draft)
        return draft.digest[:12]

    def send_approved_email(
        self,
        *,
        approval_token: object,
        inbox_id: object,
        to: object,
        subject: object,
        text: object = None,
        html: object = None,
    ) -> dict[str, object]:
        try:
            draft, logical_send_id, idempotency_key, attempt = self._reserve_attempt(
                approval_token=approval_token,
                inbox_id=inbox_id,
                to=to,
                subject=subject,
                text=text,
                html=html,
            )
        except SafeError as error:
            return _safe_failure("rejected_before_send", error.code)
        return self._continue_attempt(
            draft,
            logical_send_id,
            idempotency_key,
            attempt,
        )

    def _continue_attempt(
        self,
        draft: Draft,
        logical_send_id: str,
        idempotency_key: str,
        attempt: Attempt,
    ) -> dict[str, object]:
        if attempt.provider_message_id and attempt.provider_thread_id:
            return self._reconcile(draft, attempt)
        if attempt.state in {"failed_pre_send", "retry_refused"}:
            return _safe_failure("retry_refused", "logical_send_not_retryable")
        if attempt.state == "ambiguous_unverified":
            age_seconds = int(self._clock()) - attempt.created_at
            if age_seconds >= PROVIDER_IDEMPOTENCY_RETRY_SECONDS:
                self._store.update(
                    logical_send_id,
                    state="retry_refused",
                    safe_error_code="provider_idempotency_window_expired",
                )
                return _safe_failure(
                    "retry_refused", "provider_idempotency_window_expired"
                )
        failure = self._screen(draft, logical_send_id)
        if failure is not None:
            return failure
        return self._send_to_provider(draft, logical_send_id, idempotency_key)

    def _screen(
        self,
        draft: Draft,
        logical_send_id: str,
    ) -> dict[str, object] | None:
        try:
            self._security.screen(draft)
        except SafeError as error:
            self._store.update(
                logical_send_id,
                state="failed_pre_send",
                safe_error_code=error.code,
            )
            return _safe_failure("rejected_before_send", error.code)
        except Exception:
            self._store.update(
                logical_send_id,
                state="failed_pre_send",
                safe_error_code="security_unavailable",
            )
            return _safe_failure("rejected_before_send", "security_unavailable")
        self._store.update(logical_send_id, state="screened")
        return None

    def _send_to_provider(
        self,
        draft: Draft,
        logical_send_id: str,
        idempotency_key: str,
    ) -> dict[str, object]:
        try:
            receipt = self._agentmail.send(draft, idempotency_key)
        except SafeError as error:
            self._store.update(
                logical_send_id,
                state="ambiguous_unverified",
                safe_error_code=error.code,
            )
            return _safe_failure("ambiguous_unverified", error.code)
        except Exception:
            self._store.update(
                logical_send_id,
                state="ambiguous_unverified",
                safe_error_code="provider_unavailable",
            )
            return _safe_failure("ambiguous_unverified", "provider_unavailable")

        if not receipt.message_id or not receipt.thread_id:
            self._store.update(
                logical_send_id,
                state="ambiguous_unverified",
                safe_error_code="provider_missing_ids",
            )
            return _safe_failure("ambiguous_unverified", "provider_missing_ids")

        attempt = self._store.update(
            logical_send_id,
            state="provider_accepted",
            provider_message_id=receipt.message_id,
            provider_thread_id=receipt.thread_id,
        )
        return self._reconcile(draft, attempt)

    def _reserve_attempt(
        self,
        *,
        approval_token: object,
        inbox_id: object,
        to: object,
        subject: object,
        text: object,
        html: object,
    ) -> tuple[Draft, str, str, Attempt]:
        draft = Draft.from_input(
            expected_inbox_id=self._expected_inbox_id,
            inbox_id=inbox_id,
            to=to,
            subject=subject,
            text=text,
            html=html,
        )
        claims = self._signer.verify(approval_token, draft)
        logical_send_id = _logical_send_id(claims.nonce)
        idempotency_key = "titus-guarded-email-" + logical_send_id
        attempt, _created = self._store.reserve(
            logical_send_id=logical_send_id,
            draft_digest=claims.draft_digest,
            idempotency_key=idempotency_key,
        )
        return draft, logical_send_id, idempotency_key, attempt

    def _reconcile(self, draft: Draft, attempt: Attempt) -> dict[str, object]:
        if not attempt.provider_message_id or not attempt.provider_thread_id:
            return _safe_failure("retry_refused", "provider_ids_unavailable")
        try:
            readback = self._agentmail.get_message(
                draft.inbox_id,
                attempt.provider_message_id,
            )
            _verify_readback(
                draft,
                readback,
                expected_message_id=attempt.provider_message_id,
                expected_thread_id=attempt.provider_thread_id,
            )
        except SafeError as error:
            self._store.update(
                attempt.logical_send_id,
                state="ambiguous_unverified",
                safe_error_code=error.code,
            )
            return _safe_failure("ambiguous_unverified", error.code)
        except Exception:
            self._store.update(
                attempt.logical_send_id,
                state="ambiguous_unverified",
                safe_error_code="provider_readback_unavailable",
            )
            return _safe_failure(
                "ambiguous_unverified", "provider_readback_unavailable"
            )

        self._store.update(
            attempt.logical_send_id,
            state="verified_sent",
            provider_message_id=attempt.provider_message_id,
            provider_thread_id=attempt.provider_thread_id,
        )
        return {
            "status": "verified_sent",
            "message_id": attempt.provider_message_id,
            "thread_id": attempt.provider_thread_id,
            "verification": {
                "inbox": "matched",
                "recipients": "matched",
                "subject": "matched",
                "text": "matched_or_not_supplied",
                "html": "matched_or_not_supplied",
                "sent_state": "matched",
            },
        }


def _logical_send_id(nonce: str) -> str:
    return hashlib.sha256(
        b"overnightdesk:titus:guarded-email:logical-send:v1:" + nonce.encode("ascii")
    ).hexdigest()[:32]


def _safe_failure(status: str, code: str) -> dict[str, object]:
    return {
        "status": status,
        "error_code": code,
        "next_action": _next_action(status),
    }


def _next_action(status: str) -> str:
    if status == "rejected_before_send":
        return (
            "Do not report success. Correct the draft or service boundary and "
            "prepare a new approval."
        )
    if status == "ambiguous_unverified":
        return (
            "Do not retry or report success. Reconcile the provider record with "
            "an operator."
        )
    return (
        "Do not retry or report success. Prepare a new owner-approved logical "
        "send only after review."
    )


def _verify_readback(
    draft: Draft,
    readback: Mapping[str, object],
    *,
    expected_message_id: str,
    expected_thread_id: str,
) -> None:
    if readback.get("inbox_id") != draft.inbox_id:
        raise SafeError("provider_inbox_mismatch")
    if readback.get("message_id") != expected_message_id:
        raise SafeError("provider_message_id_mismatch")
    if readback.get("thread_id") != expected_thread_id:
        raise SafeError("provider_thread_id_mismatch")
    labels = readback.get("labels")
    if not isinstance(labels, list) or "sent" not in labels:
        raise SafeError("provider_sent_state_mismatch")
    recipients = _readback_recipients(readback.get("to"))
    if set(recipients) != set(draft.to) or len(recipients) != len(draft.to):
        raise SafeError("provider_recipient_mismatch")
    if readback.get("subject") != draft.subject:
        raise SafeError("provider_subject_mismatch")
    if draft.text is not None and readback.get("text") != draft.text:
        raise SafeError("provider_text_mismatch")
    if draft.html is not None and readback.get("html") != draft.html:
        raise SafeError("provider_html_mismatch")


def _readback_recipients(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise SafeError("provider_recipient_mismatch")
    recipients: list[str] = []
    for item in value:
        raw: object
        if isinstance(item, str):
            raw = item
        elif isinstance(item, dict):
            raw = item.get("email") or item.get("address")
        else:
            raise SafeError("provider_recipient_mismatch")
        try:
            recipients.append(_normalize_email_address(raw))
        except SafeError:
            raise SafeError("provider_recipient_mismatch") from None
    return tuple(recipients)


def build_service_from_environment() -> GuardedEmailService:
    expected_inbox_id = os.environ.get("AGENTMAIL_INBOX_ID", "")
    agentmail_api_key = os.environ.get("AGENTMAIL_API_KEY", "")
    security_token = os.environ.get("SECURITY_SERVICE_TOKEN", "")
    state_path = os.environ.get(
        "TITUS_GUARDED_EMAIL_STATE",
        "/opt/data/guarded-agentmail/attempts.sqlite3",
    )
    if state_path != "/opt/data/guarded-agentmail/attempts.sqlite3":
        raise SafeError("attempt_path_invalid")
    if not expected_inbox_id:
        raise SafeError("inbox_unavailable")
    return GuardedEmailService(
        expected_inbox_id=expected_inbox_id,
        signer=ApprovalSigner(security_token),
        store=AttemptStore(state_path),
        security_client=SecurityTeamClient(
            base_url="http://overnightdesk-securityteam:4700",
            token=security_token,
        ),
        agentmail_client=AgentMailClient(api_key=agentmail_api_key),
    )
