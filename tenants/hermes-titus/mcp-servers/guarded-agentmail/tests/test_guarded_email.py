from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from guarded_email import (
    AgentMailClient,
    ApprovalSigner,
    AttemptStore,
    Draft,
    SafeError,
    SecurityTeamClient,
    SendReceipt,
)
from service import GuardedEmailService

INBOX = "titus-operations@agentmail.to"
SUBJECT = "Guarded email qualification"
TEXT = "This is a harmless guarded email qualification message."


class FakeSecurityTeam:
    def __init__(self, error_code: str | None = None) -> None:
        self.error_code = error_code
        self.screens: list[Draft] = []

    def screen(self, draft: Draft) -> None:
        self.screens.append(draft)
        if self.error_code:
            raise SafeError(self.error_code)


class FakeAgentMail:
    def __init__(self) -> None:
        self.sends: list[tuple[Draft, str]] = []
        self.reads: list[tuple[str, str]] = []
        self.receipt = SendReceipt(message_id="msg-1", thread_id="thread-1")
        self.readback: dict[str, object] | None = None
        self.send_error: SafeError | None = None

    def send(self, draft: Draft, idempotency_key: str) -> SendReceipt:
        self.sends.append((draft, idempotency_key))
        if self.send_error:
            raise self.send_error
        return self.receipt

    def get_message(self, inbox_id: str, message_id: str) -> dict[str, object]:
        self.reads.append((inbox_id, message_id))
        if self.readback is None:
            raise SafeError("provider_readback_unavailable")
        return self.readback


def valid_readback(
    *,
    subject: str = SUBJECT,
    text: str | None = TEXT,
    html: str | None = None,
    to: list[object] | None = None,
    labels: list[str] | None = None,
) -> dict[str, object]:
    return {
        "inbox_id": INBOX,
        "message_id": "msg-1",
        "thread_id": "thread-1",
        "labels": labels if labels is not None else ["sent"],
        "to": to if to is not None else [{"email": "owner@example.com"}],
        "subject": subject,
        "text": text,
        "html": html,
    }


@pytest.fixture
def clock() -> list[int]:
    return [1_800_000_000]


@pytest.fixture
def signer(clock: list[int]) -> ApprovalSigner:
    return ApprovalSigner(
        b"test-security-service-token",
        clock=lambda: clock[0],
        nonce_factory=lambda: "00112233445566778899aabbccddeeff",
    )


@pytest.fixture
def store(tmp_path: Path, clock: list[int]) -> AttemptStore:
    return AttemptStore(tmp_path / "attempts.sqlite3", clock=lambda: clock[0])


@pytest.fixture
def security() -> FakeSecurityTeam:
    return FakeSecurityTeam()


@pytest.fixture
def agentmail() -> FakeAgentMail:
    client = FakeAgentMail()
    client.readback = valid_readback()
    return client


@pytest.fixture
def service(
    signer: ApprovalSigner,
    store: AttemptStore,
    security: FakeSecurityTeam,
    agentmail: FakeAgentMail,
    clock: list[int],
) -> GuardedEmailService:
    return GuardedEmailService(
        expected_inbox_id=INBOX,
        signer=signer,
        store=store,
        security_client=security,
        agentmail_client=agentmail,
        clock=lambda: clock[0],
    )


def draft_input(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "inbox_id": INBOX,
        "to": ["Owner@Example.COM"],
        "subject": SUBJECT,
        "text": TEXT,
        "html": None,
    }
    value.update(overrides)
    return value


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"inbox_id": "other@agentmail.to"}, "inbox_mismatch"),
        ({"to": []}, "invalid_recipients"),
        ({"to": [f"user{i}@example.com" for i in range(11)]}, "invalid_recipients"),
        ({"to": ["a" * 243 + "@example.com"]}, "invalid_recipient"),
        ({"to": ["Owner <owner@example.com>"]}, "invalid_recipient"),
        ({"to": ["owner@example.com", "OWNER@example.com"]}, "duplicate_recipient"),
        ({"subject": "   "}, "blank_subject"),
        ({"subject": "safe\r\nBcc: hidden@example.com"}, "invalid_subject"),
        ({"subject": "safe\x00unsafe"}, "invalid_subject"),
        ({"subject": "x" * 999}, "subject_too_long"),
        ({"text": None, "html": None}, "blank_body"),
        ({"text": " \n ", "html": None}, "blank_text"),
        ({"text": TEXT, "html": " \n "}, "blank_html"),
        ({"text": " \n ", "html": "<p>safe</p>"}, "blank_text"),
        ({"text": "x" * 200_001}, "text_too_long"),
        ({"text": None, "html": "x" * 500_001}, "html_too_long"),
    ],
)
def test_draft_validation_fails_closed(overrides: dict[str, object], code: str) -> None:
    with pytest.raises(SafeError) as raised:
        Draft.from_input(expected_inbox_id=INBOX, **draft_input(**overrides))
    assert raised.value.code == code


def test_draft_normalizes_addresses_and_preserves_approved_content() -> None:
    draft = Draft.from_input(expected_inbox_id=INBOX, **draft_input())
    assert draft.to == ("owner@example.com",)
    assert draft.subject == SUBJECT
    assert draft.text == TEXT
    assert draft.html is None
    assert draft.as_public_dict()["attachments"] == []


def test_preparation_exposes_a_utc_expiry(
    service: GuardedEmailService,
) -> None:
    approval = service.prepare_email(**draft_input())
    assert approval["expires_at"] == "2027-01-15T08:30:00Z"


def test_approval_token_is_bound_to_exact_draft(
    signer: ApprovalSigner,
) -> None:
    draft = Draft.from_input(expected_inbox_id=INBOX, **draft_input())
    approval = signer.prepare(draft)
    claims = signer.verify(approval.token, draft)
    assert claims.draft_digest == draft.digest
    assert claims.nonce == "00112233445566778899aabbccddeeff"
    assert approval.expires_at == 1_800_001_800

    changed = Draft.from_input(
        expected_inbox_id=INBOX,
        **draft_input(subject="Changed after approval"),
    )
    with pytest.raises(SafeError) as raised:
        signer.verify(approval.token, changed)
    assert raised.value.code == "approval_draft_mismatch"


def test_approval_token_rejects_tampering_and_expiry(
    signer: ApprovalSigner,
    clock: list[int],
) -> None:
    draft = Draft.from_input(expected_inbox_id=INBOX, **draft_input())
    approval = signer.prepare(draft)
    with pytest.raises(SafeError) as raised:
        signer.verify(approval.token[:-1] + "A", draft)
    assert raised.value.code == "invalid_approval"

    clock[0] = approval.expires_at + 1
    with pytest.raises(SafeError) as raised:
        signer.verify(approval.token, draft)
    assert raised.value.code == "approval_expired"


def test_approval_token_rejects_noncanonical_base64(
    signer: ApprovalSigner,
) -> None:
    draft = Draft.from_input(expected_inbox_id=INBOX, **draft_input())
    approval = signer.prepare(draft)
    with pytest.raises(SafeError) as raised:
        signer.verify("!" + approval.token, draft)
    assert raised.value.code == "invalid_approval"


def test_validate_approval_is_content_bound_and_has_no_external_side_effects(
    service: GuardedEmailService,
    security: FakeSecurityTeam,
    agentmail: FakeAgentMail,
) -> None:
    approval = service.prepare_email(**draft_input())
    assert (
        service.validate_approval(
            approval_token=approval["approval_token"],
            **draft_input(),
        )
        == approval["draft_fingerprint"]
    )
    assert security.screens == []
    assert agentmail.sends == []

    with pytest.raises(SafeError) as raised:
        service.validate_approval(
            approval_token=approval["approval_token"],
            **draft_input(subject="Changed after preparation"),
        )
    assert raised.value.code == "approval_draft_mismatch"
    assert security.screens == []
    assert agentmail.sends == []


def test_attempt_store_schema_contains_no_message_content(
    store: AttemptStore,
) -> None:
    columns = {
        row[1]
        for row in sqlite3.connect(store.path).execute(
            "PRAGMA table_info(guarded_send_attempts)"
        )
    }
    assert columns == {
        "logical_send_id",
        "draft_digest",
        "idempotency_key",
        "state",
        "safe_error_code",
        "provider_message_id",
        "provider_thread_id",
        "created_at",
        "updated_at",
    }
    forbidden = {"to", "recipient", "subject", "text", "html", "body", "content"}
    assert columns.isdisjoint(forbidden)
    assert store.path.stat().st_mode & 0o777 == 0o600


def test_attempt_store_rejects_symlink_path(tmp_path: Path) -> None:
    target = tmp_path / "target"
    target.write_text("not a database")
    link = tmp_path / "attempts.sqlite3"
    link.symlink_to(target)
    with pytest.raises(SafeError) as raised:
        AttemptStore(link)
    assert raised.value.code == "attempt_path_invalid"


def test_attempt_store_reuses_one_logical_send_and_idempotency_key(
    store: AttemptStore,
) -> None:
    first, created = store.reserve(
        logical_send_id="logical-1",
        draft_digest="digest-1",
        idempotency_key="idempotency-1",
    )
    second, created_again = store.reserve(
        logical_send_id="logical-1",
        draft_digest="digest-1",
        idempotency_key="idempotency-1",
    )
    assert created is True
    assert created_again is False
    assert second == first

    with pytest.raises(SafeError) as raised:
        store.reserve(
            logical_send_id="logical-1",
            draft_digest="different",
            idempotency_key="idempotency-1",
        )
    assert raised.value.code == "attempt_binding_mismatch"


@pytest.mark.parametrize(
    "code",
    [
        "security_denied",
        "security_timeout",
        "security_malformed_response",
        "security_content_changed",
        "security_unavailable",
    ],
)
def test_security_failure_never_calls_agentmail(
    signer: ApprovalSigner,
    store: AttemptStore,
    agentmail: FakeAgentMail,
    clock: list[int],
    code: str,
) -> None:
    service = GuardedEmailService(
        expected_inbox_id=INBOX,
        signer=signer,
        store=store,
        security_client=FakeSecurityTeam(code),
        agentmail_client=agentmail,
        clock=lambda: clock[0],
    )
    approval = service.prepare_email(**draft_input())
    result = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    assert result["status"] == "rejected_before_send"
    assert result["error_code"] == code
    assert agentmail.sends == []


def test_changed_or_expired_approval_never_calls_external_services(
    service: GuardedEmailService,
    security: FakeSecurityTeam,
    agentmail: FakeAgentMail,
    clock: list[int],
) -> None:
    approval = service.prepare_email(**draft_input())
    changed = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(subject="Changed after approval"),
    )
    assert changed["error_code"] == "approval_draft_mismatch"
    assert security.screens == []
    assert agentmail.sends == []

    clock[0] = 1_800_001_801
    expired = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    assert expired["error_code"] == "approval_expired"
    assert security.screens == []
    assert agentmail.sends == []


@pytest.mark.parametrize(
    ("readback", "code"),
    [
        (
            {**valid_readback(), "inbox_id": "other@agentmail.to"},
            "provider_inbox_mismatch",
        ),
        (
            {**valid_readback(), "message_id": "msg-other"},
            "provider_message_id_mismatch",
        ),
        (
            {**valid_readback(), "thread_id": "thread-other"},
            "provider_thread_id_mismatch",
        ),
        (valid_readback(subject="Wrong"), "provider_subject_mismatch"),
        (valid_readback(text="Wrong"), "provider_text_mismatch"),
        (
            valid_readback(to=[{"email": "other@example.com"}]),
            "provider_recipient_mismatch",
        ),
        (valid_readback(labels=["inbox"]), "provider_sent_state_mismatch"),
    ],
)
def test_provider_readback_mismatch_never_reports_success(
    service: GuardedEmailService,
    agentmail: FakeAgentMail,
    readback: dict[str, object],
    code: str,
) -> None:
    agentmail.readback = readback
    approval = service.prepare_email(**draft_input())
    result = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    assert result["status"] == "ambiguous_unverified"
    assert result["error_code"] == code
    assert len(agentmail.sends) == 1


def test_missing_provider_ids_is_ambiguous_and_retry_is_refused(
    service: GuardedEmailService,
    agentmail: FakeAgentMail,
) -> None:
    agentmail.receipt = SendReceipt(message_id="", thread_id="")
    approval = service.prepare_email(**draft_input())
    first = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    agentmail.receipt = SendReceipt(message_id="msg-1", thread_id="thread-1")
    second = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    assert first["status"] == "ambiguous_unverified"
    assert first["error_code"] == "provider_missing_ids"
    assert second["status"] == "verified_sent"
    assert len(agentmail.sends) == 2
    assert agentmail.sends[0][1] == agentmail.sends[1][1]


def test_ambiguous_timeout_retries_same_key_while_approval_is_valid(
    service: GuardedEmailService,
    agentmail: FakeAgentMail,
) -> None:
    approval = service.prepare_email(**draft_input())
    agentmail.send_error = SafeError("provider_timeout")
    first = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    agentmail.send_error = None
    second = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    assert first["status"] == "ambiguous_unverified"
    assert second["status"] == "verified_sent"
    assert len(agentmail.sends) == 2
    assert agentmail.sends[0][1] == agentmail.sends[1][1]


def test_ambiguous_attempt_never_retries_after_approval_expiry(
    service: GuardedEmailService,
    agentmail: FakeAgentMail,
    clock: list[int],
) -> None:
    approval = service.prepare_email(**draft_input())
    agentmail.send_error = SafeError("provider_timeout")
    first = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    clock[0] = 1_800_001_801
    second = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    assert first["status"] == "ambiguous_unverified"
    assert second["status"] == "rejected_before_send"
    assert second["error_code"] == "approval_expired"
    assert len(agentmail.sends) == 1


def test_exact_readback_is_the_only_verified_success_and_retry_does_not_send(
    service: GuardedEmailService,
    agentmail: FakeAgentMail,
) -> None:
    approval = service.prepare_email(**draft_input())
    first = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    second = service.send_approved_email(
        approval_token=approval["approval_token"],
        **draft_input(),
    )
    assert first == second
    assert first == {
        "status": "verified_sent",
        "message_id": "msg-1",
        "thread_id": "thread-1",
        "verification": {
            "inbox": "matched",
            "recipients": "matched",
            "subject": "matched",
            "text": "matched_or_not_supplied",
            "html": "matched_or_not_supplied",
            "sent_state": "matched",
        },
    }
    assert len(agentmail.sends) == 1
    assert len(agentmail.reads) == 2
    assert agentmail.sends[0][1].startswith("titus-guarded-email-")


def test_securityteam_client_requires_explicit_unchanged_allow() -> None:
    draft = Draft.from_input(expected_inbox_id=INBOX, **draft_input())

    def transport(
        method: str,
        url: str,
        headers: dict[str, str],
        body: bytes | None,
        timeout: float,
    ) -> tuple[int, dict[str, object]]:
        assert method == "POST"
        assert url.endswith("/check-outbound")
        assert headers["Authorization"] == "Bearer security-token"
        assert timeout == 15
        assert body is not None
        payload = json.loads(body)
        assert payload["targetId"] == "owner@example.com"
        content = SecurityTeamClient.screened_content(draft)
        assert payload["content"] == content
        assert "owner@example.com" not in content
        assert INBOX not in content
        assert SUBJECT in content
        assert TEXT in content
        return 200, {"allowed": True, "content": content}

    SecurityTeamClient(
        base_url="http://overnightdesk-securityteam:4700",
        token="security-token",
        transport=transport,
    ).screen(draft)


def test_securityteam_client_allows_exact_unicode_content() -> None:
    draft = Draft.from_input(
        expected_inbox_id=INBOX,
        **draft_input(subject="Café qualification", text="Hello, 世界."),
    )
    content = SecurityTeamClient.screened_content(draft)
    SecurityTeamClient(
        base_url="http://overnightdesk-securityteam:4700",
        token="security-token",
        transport=lambda *_args: (200, {"allowed": True, "content": content}),
    ).screen(draft)


@pytest.mark.parametrize(
    ("response", "code"),
    [
        ((401, {"allowed": False}), "security_denied"),
        ((403, {"allowed": False}), "security_denied"),
        ((500, {}), "security_unavailable"),
        ((200, {"allowed": False}), "security_denied"),
        ((200, []), "security_malformed_response"),
        ((200, {"allowed": True}), "security_malformed_response"),
        ((200, {"allowed": True, "content": "changed"}), "security_content_changed"),
    ],
)
def test_securityteam_client_fails_closed(
    response: tuple[int, object],
    code: str,
) -> None:
    draft = Draft.from_input(expected_inbox_id=INBOX, **draft_input())
    client = SecurityTeamClient(
        base_url="http://overnightdesk-securityteam:4700",
        token="security-token",
        transport=lambda *_args: response,
    )
    with pytest.raises(SafeError) as raised:
        client.screen(draft)
    assert raised.value.code == code


def test_agentmail_client_sends_all_approved_fields_and_reads_exact_message() -> None:
    requests: list[tuple[str, str, dict[str, str], bytes | None, float]] = []

    def transport(
        method: str,
        url: str,
        headers: dict[str, str],
        body: bytes | None,
        timeout: float,
    ) -> tuple[int, dict[str, object]]:
        requests.append((method, url, headers, body, timeout))
        if method == "POST":
            return 200, {"message_id": "msg-1", "thread_id": "thread-1"}
        return 200, valid_readback()

    draft = Draft.from_input(expected_inbox_id=INBOX, **draft_input())
    client = AgentMailClient(api_key="agentmail-token", transport=transport)
    receipt = client.send(draft, "stable-key")
    readback = client.get_message(INBOX, receipt.message_id)
    assert receipt == SendReceipt(message_id="msg-1", thread_id="thread-1")
    assert readback["subject"] == SUBJECT
    post = requests[0]
    assert post[0] == "POST"
    assert post[2]["Authorization"] == "Bearer agentmail-token"
    assert post[2]["Idempotency-Key"] == "stable-key"
    assert post[4] == 15
    assert b'"subject":"Guarded email qualification"' in (post[3] or b"")
    assert b'"text":"This is a harmless guarded email qualification message."' in (
        post[3] or b""
    )
    assert requests[1][0] == "GET"
    assert requests[1][1].endswith(
        "/inboxes/titus-operations%40agentmail.to/messages/msg-1"
    )


@pytest.mark.parametrize(
    ("response", "code"),
    [
        ((409, {}), "provider_idempotency_conflict"),
        ((500, {}), "provider_rejected"),
        ((200, []), "provider_malformed_response"),
        (
            (200, {"message_id": "invalid id", "thread_id": "thread-1"}),
            "provider_invalid_message_id",
        ),
        (
            (200, {"message_id": "msg-1", "thread_id": "invalid thread"}),
            "provider_invalid_thread_id",
        ),
        ((200, {}), None),
    ],
)
def test_agentmail_client_classifies_provider_failures(
    response: tuple[int, object],
    code: str | None,
) -> None:
    draft = Draft.from_input(expected_inbox_id=INBOX, **draft_input())
    client = AgentMailClient(
        api_key="agentmail-token",
        transport=lambda *_args: response,
    )
    if code is None:
        assert client.send(draft, "stable-key") == SendReceipt("", "")
    else:
        with pytest.raises(SafeError) as raised:
            client.send(draft, "stable-key")
        assert raised.value.code == code


def test_agentmail_client_classifies_timeout_without_exposing_request() -> None:
    def timeout_transport(*_args: object) -> tuple[int, object]:
        raise TimeoutError

    draft = Draft.from_input(expected_inbox_id=INBOX, **draft_input())
    client = AgentMailClient(
        api_key="agentmail-token",
        transport=timeout_transport,
    )
    with pytest.raises(SafeError) as raised:
        client.send(draft, "stable-key")
    assert raised.value.code == "provider_timeout"


def test_html_readback_mismatch_is_ambiguous(
    signer: ApprovalSigner,
    store: AttemptStore,
    security: FakeSecurityTeam,
    agentmail: FakeAgentMail,
    clock: list[int],
) -> None:
    agentmail.readback = valid_readback(text=None, html="<p>Wrong</p>")
    service = GuardedEmailService(
        expected_inbox_id=INBOX,
        signer=signer,
        store=store,
        security_client=security,
        agentmail_client=agentmail,
        clock=lambda: clock[0],
    )
    html_draft = draft_input(text=None, html="<p>Exact</p>")
    approval = service.prepare_email(**html_draft)
    result = service.send_approved_email(
        approval_token=approval["approval_token"],
        **html_draft,
    )
    assert result["status"] == "ambiguous_unverified"
    assert result["error_code"] == "provider_html_mismatch"
