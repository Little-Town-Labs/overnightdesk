from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


def load_verifier():
    path = Path(__file__).parents[3] / "runtime" / "verify-mcp-registry.py"
    spec = importlib.util.spec_from_file_location("verify_mcp_registry", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def prefixed(server: str, *tools: str) -> set[str]:
    return {f"mcp__{server}__{tool}" for tool in tools}


def test_guarded_mode_accepts_only_the_exact_registered_tools() -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)
    actual |= prefixed("guarded_agentmail", *verifier.GUARDED_EMAIL_TOOLS)

    verifier.verify_registered_tools(actual, "guarded", "disabled")


def test_read_only_mode_excludes_guarded_sender() -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)

    verifier.verify_registered_tools(actual, "read_only", "disabled")


def test_mutation_tool_fails_closed_even_when_all_reads_are_present() -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)
    actual.add("mcp__agentmail__send_message")
    actual |= prefixed("guarded_agentmail", *verifier.GUARDED_EMAIL_TOOLS)

    with pytest.raises(RuntimeError, match="registered MCP tool set mismatch"):
        verifier.verify_registered_tools(actual, "guarded", "disabled")


def test_provider_raw_names_cannot_satisfy_registered_tool_check() -> None:
    verifier = load_verifier()

    with pytest.raises(RuntimeError, match="registered MCP tool set mismatch"):
        verifier.verify_registered_tools(
            set(verifier.AGENTMAIL_READ_TOOLS),
            "read_only",
            "disabled",
        )


def test_unknown_mode_fails_closed() -> None:
    verifier = load_verifier()

    with pytest.raises(RuntimeError, match="guarded email mode is invalid"):
        verifier.verify_registered_tools(set(), "unknown", "disabled")


def test_linear_disabled_rejects_registered_linear_tools() -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)
    actual.add("mcp__linear__search_work")

    with pytest.raises(RuntimeError, match="Linear tools registered while disabled"):
        verifier.verify_registered_tools(actual, "read_only", "disabled")


def test_linear_ready_accepts_provider_agnostic_read_tools() -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)
    actual |= prefixed(
        "linear",
        "get_comment",
        "list_issue_updates",
        "search_assigned_issues",
    )

    verifier.verify_registered_tools(actual, "read_only", "ready")


@pytest.mark.parametrize(
    "tool",
    [
        "create_issue",
        "edit_issue",
        "editIssue",
        "update_project",
        "delete_comment",
        "archive_issue",
        "assign_issue",
        "add_comment",
        "comment_on_issue",
        "transition_issue",
        "transition-issue",
        "archiveIssue",
        "save_issue",
        "mutate_project",
        "write_status",
    ],
)
def test_linear_ready_rejects_mutation_tool_names(tool: str) -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)
    actual.add(f"mcp__linear__{tool}")

    with pytest.raises(RuntimeError, match="Linear mutation tool registered"):
        verifier.verify_registered_tools(actual, "read_only", "ready")


def test_linear_ready_requires_at_least_one_prefixed_provider_tool() -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)

    with pytest.raises(RuntimeError, match="Linear read tools are unavailable"):
        verifier.verify_registered_tools(actual, "read_only", "ready")


def test_linear_ready_rejects_unknown_non_read_inventory() -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)
    actual.add("mcp__linear__execute")

    with pytest.raises(RuntimeError, match="Linear non-read tool registered"):
        verifier.verify_registered_tools(actual, "read_only", "ready")


def test_raw_linear_provider_names_do_not_satisfy_ready_check() -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)
    actual.add("search_work")

    with pytest.raises(RuntimeError, match="registered MCP tool set mismatch"):
        verifier.verify_registered_tools(actual, "read_only", "ready")


def test_unknown_linear_state_fails_closed() -> None:
    verifier = load_verifier()

    with pytest.raises(RuntimeError, match="Linear state is invalid"):
        verifier.verify_registered_tools(set(), "read_only", "unknown")
