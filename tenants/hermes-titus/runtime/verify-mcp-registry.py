from __future__ import annotations

import os
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


def prefixed(server: str, tools: Iterable[str]) -> set[str]:
    return {f"mcp__{server}__{tool}" for tool in tools}


def expected_registered_tools(mode: str) -> set[str]:
    expected = prefixed("agentmail", AGENTMAIL_READ_TOOLS)
    if mode == "guarded":
        return expected | prefixed("guarded_agentmail", GUARDED_EMAIL_TOOLS)
    if mode == "read_only":
        return expected
    raise RuntimeError("guarded email mode is invalid")


def verify_registered_tools(tool_names: Iterable[str], mode: str) -> None:
    actual = set(tool_names)
    expected = expected_registered_tools(mode)
    if actual != expected:
        missing = sorted(expected - actual)
        unexpected = sorted(actual - expected)
        raise RuntimeError(
            "registered MCP tool set mismatch "
            f"(missing={missing}, unexpected={unexpected})"
        )


def discover_and_verify(mode: str) -> None:
    from tools.mcp_tool import (  # type: ignore[import-not-found]
        discover_mcp_tools,
        shutdown_mcp_servers,
    )

    try:
        verify_registered_tools(discover_mcp_tools(), mode)
    finally:
        shutdown_mcp_servers()


def main() -> None:
    mode = os.environ.get("TITUS_GUARDED_EMAIL_EXPECT", "")
    discover_and_verify(mode)
    print("agentmail_mcp=healthy_exact_eight_registered_read_tools")
    if mode == "guarded":
        print("guarded_agentmail_mcp=healthy_exact_two_registered_tools")
    else:
        print("guarded_agentmail_mcp=read_only_rollback")


if __name__ == "__main__":
    main()
