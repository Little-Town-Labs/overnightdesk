from __future__ import annotations

import json
import sys
import time
from collections.abc import Awaitable, Callable
from typing import Protocol, cast

from guarded_email import SafeError
from mcp.server.fastmcp import Context, FastMCP
from mcp.types import ToolAnnotations
from pydantic import BaseModel, ConfigDict, Field
from service import build_service_from_environment


class GuardedService(Protocol):
    def prepare_email(self, **draft: object) -> dict[str, object]: ...

    def validate_approval(self, **draft: object) -> str: ...

    def send_approved_email(
        self, *, approval_token: object, **draft: object
    ) -> dict[str, object]: ...


EventWriter = Callable[[dict[str, object]], None]
OwnerAuthorizer = Callable[[Context, str], Awaitable[bool]]


class OwnerApprovalResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmation: bool | None = Field(
        default=None,
        description=(
            "Use the approval control to accept or decline; this optional field "
            "is not used as authorization."
        ),
    )


class ServiceResolver:
    def __init__(self, service: GuardedService | None) -> None:
        self._service = service

    def get(self) -> GuardedService:
        if self._service is None:
            self._service = cast(GuardedService, build_service_from_environment())
        if self._service is None:
            raise RuntimeError("guarded email service initialization failed")
        return cast(GuardedService, self._service)


async def _elicit_owner_approval(context: Context, fingerprint: str) -> bool:
    result = await context.elicit(
        message=(
            "Approve the exact outbound Titus email draft with fingerprint "
            f"{fingerprint} shown in this conversation. Decline unless the "
            "recipients, subject, complete body, and attachments=[] are exact."
        ),
        schema=OwnerApprovalResponse,
    )
    return result.action == "accept"


def _write_event(event: dict[str, object]) -> None:
    sys.stderr.write(json.dumps(event, separators=(",", ":"), sort_keys=True) + "\n")
    sys.stderr.flush()


def _failure(code: str) -> dict[str, object]:
    return {
        "status": "rejected_before_send",
        "error_code": code,
        "next_action": (
            "Do not report success. Correct the draft or service boundary and "
            "prepare a new approval."
        ),
    }


def _emit(writer: EventWriter, event: str, result: dict[str, object]) -> None:
    status = result.get("status")
    try:
        writer(
            {
                "event": event,
                "status": (
                    "ok"
                    if status in {"ready_for_owner_approval", "verified_sent"}
                    else "failed"
                ),
                "result_status": status if isinstance(status, str) else "unknown",
                "error_code": (
                    result.get("error_code")
                    if isinstance(result.get("error_code"), str)
                    else None
                ),
                "timestamp": int(time.time()),
            }
        )
    except Exception:
        return


def _prepare_handler(
    resolver: ServiceResolver,
    writer: EventWriter,
) -> Callable[..., dict[str, object]]:
    def handle(
        inbox_id: str,
        to: list[str],
        subject: str,
        text: str | None = None,
        html: str | None = None,
    ) -> dict[str, object]:
        try:
            result = resolver.get().prepare_email(
                inbox_id=inbox_id,
                to=to,
                subject=subject,
                text=text,
                html=html,
            )
        except SafeError as error:
            result = _failure(error.code)
        except Exception:
            result = _failure("guarded_service_unavailable")
        _emit(writer, "guarded_email_prepare", result)
        return result

    return handle


async def _send_result(
    resolver: ServiceResolver,
    authorizer: OwnerAuthorizer,
    *,
    approval_token: str,
    inbox_id: str,
    to: list[str],
    subject: str,
    text: str | None,
    html: str | None,
    context: Context | None,
) -> dict[str, object]:
    draft = {
        "approval_token": approval_token,
        "inbox_id": inbox_id,
        "to": to,
        "subject": subject,
        "text": text,
        "html": html,
    }
    try:
        if context is None:
            raise SafeError("owner_approval_unavailable")
        fingerprint = resolver.get().validate_approval(**draft)
    except SafeError as error:
        return _failure(error.code)
    except Exception:
        return _failure("guarded_service_unavailable")
    try:
        approved = await authorizer(context, fingerprint)
    except Exception:
        return _failure("owner_approval_unavailable")
    if approved is not True:
        return _failure("owner_approval_declined")
    try:
        return resolver.get().send_approved_email(**draft)
    except Exception:
        return _failure("guarded_service_unavailable")


def _send_handler(
    resolver: ServiceResolver,
    writer: EventWriter,
    authorizer: OwnerAuthorizer,
) -> Callable[..., Awaitable[dict[str, object]]]:
    async def handle(
        approval_token: str,
        inbox_id: str,
        to: list[str],
        subject: str,
        text: str | None = None,
        html: str | None = None,
        context: Context | None = None,
    ) -> dict[str, object]:
        result = await _send_result(
            resolver,
            authorizer,
            approval_token=approval_token,
            inbox_id=inbox_id,
            to=to,
            subject=subject,
            text=text,
            html=html,
            context=context,
        )
        _emit(writer, "guarded_email_send", result)
        return result

    return handle


def _register_prepare(mcp: FastMCP, handler: Callable[..., object]) -> None:
    mcp.tool(
        name="titus_prepare_email_approval",
        description=(
            "Validate and canonicalize one complete Titus outbound email draft. "
            "This does not send or authorize email. Show the returned exact draft "
            "to the owner and obtain explicit approval before any send call."
        ),
        annotations=ToolAnnotations(
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
        structured_output=True,
    )(handler)


def _register_send(mcp: FastMCP, handler: Callable[..., object]) -> None:
    mcp.tool(
        name="titus_send_approved_email",
        description=(
            "Send exactly one previously prepared Titus email. This is the only "
            "email mutation and is destructive. Call it only after the owner "
            "explicitly approves the exact recipients, subject, text, HTML, and "
            "empty attachment state returned by the preparation tool."
        ),
        annotations=ToolAnnotations(
            readOnlyHint=False,
            destructiveHint=True,
            idempotentHint=True,
            openWorldHint=True,
        ),
        structured_output=True,
    )(handler)


def _tighten_argument_models(mcp: FastMCP) -> None:
    for tool_name in (
        "titus_prepare_email_approval",
        "titus_send_approved_email",
    ):
        registered_tool = mcp._tool_manager.get_tool(tool_name)
        if registered_tool is None:
            raise RuntimeError("guarded email tool registration failed")
        argument_model = registered_tool.fn_metadata.arg_model
        argument_model.model_config["extra"] = "forbid"
        argument_model.model_config["hide_input_in_errors"] = True
        argument_model.model_rebuild(force=True)
        registered_tool.parameters = argument_model.model_json_schema(by_alias=True)


def create_server(
    service: GuardedService | None = None,
    *,
    event_writer: EventWriter = _write_event,
    owner_authorizer: OwnerAuthorizer = _elicit_owner_approval,
) -> FastMCP:
    mcp = FastMCP(
        "Titus Guarded AgentMail",
        instructions=(
            "Prepare a complete exact email draft, show it to the owner, and call "
            "the send tool only after explicit approval of that same draft."
        ),
        log_level="ERROR",
    )
    resolver = ServiceResolver(service)
    _register_prepare(mcp, _prepare_handler(resolver, event_writer))
    _register_send(mcp, _send_handler(resolver, event_writer, owner_authorizer))
    _tighten_argument_models(mcp)
    return mcp


def main() -> None:
    create_server().run(transport="stdio")


if __name__ == "__main__":
    main()
