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

    verifier.verify_registered_tools(actual, "guarded")


def test_read_only_mode_excludes_guarded_sender() -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)

    verifier.verify_registered_tools(actual, "read_only")


def test_mutation_tool_fails_closed_even_when_all_reads_are_present() -> None:
    verifier = load_verifier()
    actual = prefixed("agentmail", *verifier.AGENTMAIL_READ_TOOLS)
    actual.add("mcp__agentmail__send_message")
    actual |= prefixed("guarded_agentmail", *verifier.GUARDED_EMAIL_TOOLS)

    with pytest.raises(RuntimeError, match="registered MCP tool set mismatch"):
        verifier.verify_registered_tools(actual, "guarded")


def test_provider_raw_names_cannot_satisfy_registered_tool_check() -> None:
    verifier = load_verifier()

    with pytest.raises(RuntimeError, match="registered MCP tool set mismatch"):
        verifier.verify_registered_tools(set(verifier.AGENTMAIL_READ_TOOLS), "read_only")


def test_unknown_mode_fails_closed() -> None:
    verifier = load_verifier()

    with pytest.raises(RuntimeError, match="guarded email mode is invalid"):
        verifier.verify_registered_tools(set(), "unknown")
