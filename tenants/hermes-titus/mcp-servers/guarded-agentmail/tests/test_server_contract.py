from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
from mcp.server.fastmcp.exceptions import ToolError
from server import _elicit_owner_approval, create_server


class FakeService:
    def __init__(self) -> None:
        self.validations: list[dict[str, object]] = []
        self.sends: list[dict[str, object]] = []

    def prepare_email(self, **draft: object) -> dict[str, object]:
        return {
            "status": "ready_for_owner_approval",
            "approval_token": "opaque-token",
            "draft": draft,
        }

    def validate_approval(self, **draft: object) -> str:
        self.validations.append(draft)
        return "0123456789ab"

    def send_approved_email(
        self, *, approval_token: object, **draft: object
    ) -> dict[str, object]:
        self.sends.append({"approval_token": approval_token, **draft})
        return {
            "status": "verified_sent",
            "message_id": "msg-1",
            "thread_id": "thread-1",
            "draft": draft,
        }


async def approve_owner(_context: object, _fingerprint: str) -> bool:
    return True


def listed_tools(server: object) -> dict[str, object]:
    return {
        tool.name: tool
        for tool in asyncio.run(server.list_tools())  # type: ignore[attr-defined]
    }


def test_server_exposes_exactly_one_read_tool_and_one_mutation() -> None:
    tools = listed_tools(create_server(FakeService(), event_writer=lambda _event: None))
    assert set(tools) == {
        "titus_prepare_email_approval",
        "titus_send_approved_email",
    }

    prepare = tools["titus_prepare_email_approval"]
    assert prepare.annotations.readOnlyHint is True
    assert prepare.annotations.destructiveHint is False
    assert prepare.annotations.idempotentHint is True
    assert prepare.annotations.openWorldHint is False

    send = tools["titus_send_approved_email"]
    assert send.annotations.readOnlyHint is False
    assert send.annotations.destructiveHint is True
    assert send.annotations.idempotentHint is True
    assert send.annotations.openWorldHint is True


def test_tool_schemas_reject_unknown_fields_and_unsupported_email_surfaces() -> None:
    tools = listed_tools(create_server(FakeService(), event_writer=lambda _event: None))
    prepare_schema = tools["titus_prepare_email_approval"].inputSchema
    send_schema = tools["titus_send_approved_email"].inputSchema
    assert prepare_schema["additionalProperties"] is False
    assert send_schema["additionalProperties"] is False
    assert set(prepare_schema["properties"]) == {
        "inbox_id",
        "to",
        "subject",
        "text",
        "html",
    }
    assert set(send_schema["properties"]) == {
        "approval_token",
        "inbox_id",
        "to",
        "subject",
        "text",
        "html",
    }
    for unsupported in (
        "cc",
        "bcc",
        "attachments",
        "headers",
        "reply_to",
        "draft_id",
    ):
        assert unsupported not in prepare_schema["properties"]
        assert unsupported not in send_schema["properties"]


def test_unknown_field_value_is_rejected_without_echoing_its_value() -> None:
    server = create_server(FakeService(), event_writer=lambda _event: None)
    with pytest.raises(ToolError) as raised:
        asyncio.run(
            server.call_tool(
                "titus_prepare_email_approval",
                {
                    "inbox_id": "titus-operations@agentmail.to",
                    "to": ["owner@example.com"],
                    "subject": "Safe",
                    "text": "Safe",
                    "unexpected": "never-echo-this-sensitive-value",
                },
            )
        )
    assert "never-echo-this-sensitive-value" not in str(raised.value)


def test_server_invocation_passes_the_complete_draft_to_both_calls() -> None:
    service = FakeService()
    server = create_server(
        service,
        event_writer=lambda _event: None,
        owner_authorizer=approve_owner,
    )
    draft = {
        "inbox_id": "titus-operations@agentmail.to",
        "to": ["owner@example.com"],
        "subject": "Exact subject",
        "text": "Exact complete body",
        "html": None,
    }
    prepared = asyncio.run(server.call_tool("titus_prepare_email_approval", draft))[1]
    sent = asyncio.run(
        server.call_tool(
            "titus_send_approved_email",
            {"approval_token": "opaque-token", **draft},
        )
    )[1]
    assert prepared["draft"] == draft
    assert sent["draft"] == draft
    assert service.validations == [{"approval_token": "opaque-token", **draft}]
    assert service.sends == [{"approval_token": "opaque-token", **draft}]


def test_send_requires_owner_elicitation_acceptance_before_service_send() -> None:
    service = FakeService()
    observed_fingerprints: list[str] = []

    async def decline_owner(_context: object, fingerprint: str) -> bool:
        observed_fingerprints.append(fingerprint)
        return False

    server = create_server(
        service,
        event_writer=lambda _event: None,
        owner_authorizer=decline_owner,
    )
    result = asyncio.run(
        server.call_tool(
            "titus_send_approved_email",
            {
                "approval_token": "opaque-token",
                "inbox_id": "titus-operations@agentmail.to",
                "to": ["owner@example.com"],
                "subject": "Exact subject",
                "text": "Exact complete body",
                "html": None,
            },
        )
    )[1]
    assert result["status"] == "rejected_before_send"
    assert result["error_code"] == "owner_approval_declined"
    assert observed_fingerprints == ["0123456789ab"]
    assert service.sends == []


def test_default_owner_gate_uses_mcp_elicitation_bound_to_safe_fingerprint() -> None:
    class FakeContext:
        def __init__(self) -> None:
            self.message = ""
            self.schema: object | None = None

        async def elicit(self, *, message: str, schema: object) -> object:
            self.message = message
            self.schema = schema
            return SimpleNamespace(action="accept")

    context = FakeContext()
    approved = asyncio.run(
        _elicit_owner_approval(  # type: ignore[arg-type]
            context,
            "0123456789ab",
        )
    )
    assert approved is True
    assert "0123456789ab" in context.message
    assert "recipient@example.com" not in context.message
    assert "subject" in context.message
    assert context.schema is not None


def test_owner_elicitation_failure_fails_closed_before_service_send() -> None:
    service = FakeService()

    async def broken_owner_gate(_context: object, _fingerprint: str) -> bool:
        raise RuntimeError("approval surface failed")

    server = create_server(
        service,
        event_writer=lambda _event: None,
        owner_authorizer=broken_owner_gate,
    )
    result = asyncio.run(
        server.call_tool(
            "titus_send_approved_email",
            {
                "approval_token": "opaque-token",
                "inbox_id": "titus-operations@agentmail.to",
                "to": ["owner@example.com"],
                "subject": "Exact subject",
                "text": "Exact complete body",
                "html": None,
            },
        )
    )[1]
    assert result["status"] == "rejected_before_send"
    assert result["error_code"] == "owner_approval_unavailable"
    assert service.sends == []


def test_structured_events_never_contain_draft_or_token_values() -> None:
    events: list[dict[str, object]] = []
    server = create_server(
        FakeService(),
        event_writer=events.append,
        owner_authorizer=approve_owner,
    )
    draft = {
        "inbox_id": "titus-operations@agentmail.to",
        "to": ["secret-recipient@example.com"],
        "subject": "secret subject",
        "text": "secret complete body",
        "html": None,
    }
    asyncio.run(server.call_tool("titus_prepare_email_approval", draft))
    asyncio.run(
        server.call_tool(
            "titus_send_approved_email",
            {"approval_token": "secret-opaque-token", **draft},
        )
    )
    serialized = "\n".join(json.dumps(event, sort_keys=True) for event in events)
    assert "secret-recipient" not in serialized
    assert "secret subject" not in serialized
    assert "secret complete body" not in serialized
    assert "secret-opaque-token" not in serialized
    assert {event["event"] for event in events} == {
        "guarded_email_prepare",
        "guarded_email_send",
    }
    assert all(event["status"] == "ok" for event in events)


def test_observability_failure_does_not_replace_verified_send_result() -> None:
    def broken_writer(_event: dict[str, object]) -> None:
        raise OSError("stderr unavailable")

    server = create_server(
        FakeService(),
        event_writer=broken_writer,
        owner_authorizer=approve_owner,
    )
    result = asyncio.run(
        server.call_tool(
            "titus_send_approved_email",
            {
                "approval_token": "opaque-token",
                "inbox_id": "titus-operations@agentmail.to",
                "to": ["owner@example.com"],
                "subject": "Exact subject",
                "text": "Exact complete body",
                "html": None,
            },
        )
    )[1]
    assert result["status"] == "verified_sent"
