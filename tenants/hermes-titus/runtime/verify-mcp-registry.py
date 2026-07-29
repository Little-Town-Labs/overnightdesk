from __future__ import annotations

import os
import re
from collections.abc import Iterable

AGENTMAIL_READ_TOOLS = frozenset(
    {
        "list_inboxes",
        "get_inbox",
        "list_threads",
        "search_threads",
        "get_thread",
        "list_messages",
        "search_messages",
        "get_attachment",
    }
)
GUARDED_EMAIL_TOOLS = frozenset(
    {
        "titus_prepare_email_approval",
        "titus_send_approved_email",
    }
)
LINEAR_PREFIX = "mcp__linear__"
LINEAR_MUTATION_VERBS = frozenset(
    {
        "add",
        "archive",
        "assign",
        "create",
        "delete",
        "edit",
        "close",
        "complete",
        "cancel",
        "move",
        "mutate",
        "reopen",
        "remove",
        "restore",
        "save",
        "set",
        "transition",
        "update",
        "write",
    }
)
LINEAR_READ_VERBS = frozenset({"find", "get", "inspect", "list", "read", "search"})


def prefixed(server: str, tools: Iterable[str]) -> set[str]:
    return {f"mcp__{server}__{tool}" for tool in tools}


def expected_registered_tools(mode: str) -> set[str]:
    expected = prefixed("agentmail", AGENTMAIL_READ_TOOLS)
    if mode == "guarded":
        return expected | prefixed("guarded_agentmail", GUARDED_EMAIL_TOOLS)
    if mode == "read_only":
        return expected
    raise RuntimeError("guarded email mode is invalid")


def linear_action_tokens(tool_name: str) -> set[str]:
    unprefixed = tool_name.removeprefix(LINEAR_PREFIX)
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", unprefixed)
    return {token for token in re.split(r"[^A-Za-z0-9]+", words.lower()) if token}


def verify_linear_tools(actual: set[str], state: str) -> None:
    if state not in {"disabled", "ready"}:
        raise RuntimeError("Linear state is invalid")
    linear_tools = {name for name in actual if name.startswith(LINEAR_PREFIX)}
    if state == "disabled":
        if linear_tools:
            raise RuntimeError("Linear tools registered while disabled")
        return
    if not linear_tools:
        raise RuntimeError("Linear read tools are unavailable")
    for tool in linear_tools:
        tokens = linear_action_tokens(tool)
        comment_action = "comment" in tokens and not tokens & LINEAR_READ_VERBS
        if tokens & LINEAR_MUTATION_VERBS or comment_action:
            raise RuntimeError("Linear mutation tool registered")
        if not tokens & LINEAR_READ_VERBS:
            raise RuntimeError("Linear non-read tool registered")


def verify_registered_tools(
    tool_names: Iterable[str],
    mode: str,
    linear_state: str,
) -> None:
    if linear_state not in {"disabled", "ready"}:
        raise RuntimeError("Linear state is invalid")
    actual = set(tool_names)
    email_tools = {name for name in actual if not name.startswith(LINEAR_PREFIX)}
    expected = expected_registered_tools(mode)
    if email_tools != expected:
        missing = sorted(expected - email_tools)
        unexpected = sorted(email_tools - expected)
        raise RuntimeError(
            "registered MCP tool set mismatch "
            f"(missing={missing}, unexpected={unexpected})"
        )
    verify_linear_tools(actual, linear_state)


def discover_and_verify(mode: str, linear_state: str) -> None:
    from tools.mcp_tool import (  # type: ignore[import-not-found]
        discover_mcp_tools,
        shutdown_mcp_servers,
    )

    try:
        tool_names = discover_mcp_tools()
        verify_registered_tools(tool_names, mode, linear_state)
    finally:
        shutdown_mcp_servers()


def main() -> None:
    mode = os.environ.get("TITUS_GUARDED_EMAIL_EXPECT", "")
    linear_state = os.environ.get("TITUS_LINEAR_STATE", "disabled")
    discover_and_verify(mode, linear_state)
    print("agentmail_mcp=healthy_exact_eight_registered_read_tools")
    if mode == "guarded":
        print("guarded_agentmail_mcp=healthy_exact_two_registered_tools")
    else:
        print("guarded_agentmail_mcp=read_only_rollback")
    if linear_state == "ready":
        print("linear_mcp=healthy_read_only")
    else:
        print("linear_mcp=disabled")


if __name__ == "__main__":
    main()
