"""Contract tests for the Telegram-native Titus guarded-email approval hook."""

from __future__ import annotations

import ast
import importlib
import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).parents[1]
PLUGIN = ROOT / "plugins" / "approvals" / "titus_guarded_email"
CONFIG = ROOT / "config" / "config.yaml"
PREPARE_VOLUME = ROOT / "runtime" / "prepare-volume.sh"

sys.path.insert(0, str(PLUGIN))
policy = importlib.import_module("policy")


def test_source_config_enables_the_narrow_approval_plugin() -> None:
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    assert config["plugins"]["enabled"] == [
        "platforms/titus_teams",
        "approvals/titus_guarded_email",
    ]
    manifest = yaml.safe_load((PLUGIN / "plugin.yaml").read_text(encoding="utf-8"))
    assert manifest["hooks"] == ["pre_tool_call", "post_approval_response"]


def test_runtime_projection_installs_every_plugin_file() -> None:
    source = PREPARE_VOLUME.read_text(encoding="utf-8")
    for name in ("plugin.yaml", "__init__.py", "policy.py"):
        assert f"/source/plugins/approvals/titus_guarded_email/{name}" in source


def test_policy_is_telegram_only_and_targets_one_mutation(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TITUS_GUARDED_EMAIL_APPROVAL_MARKER_DIR", str(tmp_path))
    monkeypatch.setenv("HERMES_SESSION_KEY", "telegram:gary:private")
    policy._current_platform = lambda: "matrix"  # type: ignore[method-assign]
    assert policy.on_pre_tool_call(
        tool_name="titus_send_approved_email",
        args={"subject": "secret"},
        tool_call_id="call-1",
    ) is None

    policy._current_platform = lambda: "telegram"  # type: ignore[method-assign]
    assert policy.on_pre_tool_call(
        tool_name="titus_prepare_email_approval",
        args={"subject": "secret"},
        tool_call_id="call-1",
    ) is None
    result = policy.on_pre_tool_call(
        tool_name="titus_send_approved_email",
        args={"subject": "secret", "text": "private body"},
        tool_call_id="call-1",
    )
    assert result is not None
    assert result["action"] == "approve"


def test_policy_message_is_content_free_and_keys_are_per_call(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TITUS_GUARDED_EMAIL_APPROVAL_MARKER_DIR", str(tmp_path))
    monkeypatch.setenv("HERMES_SESSION_KEY", "telegram:gary:private")
    policy._current_platform = lambda: "telegram"  # type: ignore[method-assign]
    args = {
        "inbox_id": "titus-operations@agentmail.to",
        "to": ["owner@example.com"],
        "subject": "Private subject",
        "text": "Private body that must not enter the approval message",
        "approval_token": "opaque-secret-token",
    }
    first = policy.on_pre_tool_call(
        tool_name="titus_send_approved_email", args=args, tool_call_id="call-1"
    )
    second = policy.on_pre_tool_call(
        tool_name="titus_send_approved_email", args=args, tool_call_id="call-2"
    )
    assert first is not None and second is not None
    assert first["rule_key"] != second["rule_key"]
    assert "Private subject" not in first["message"]
    assert "Private body" not in first["message"]
    assert "opaque-secret-token" not in first["message"]
    assert len(first["message"].split("fingerprint ", 1)[1].split(" ", 1)[0]) == 12


def test_denied_approval_removes_its_handoff_marker(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TITUS_GUARDED_EMAIL_APPROVAL_MARKER_DIR", str(tmp_path))
    monkeypatch.setenv("HERMES_SESSION_KEY", "telegram:gary:private")
    policy._current_platform = lambda: "telegram"  # type: ignore[method-assign]
    result = policy.on_pre_tool_call(
        tool_name="titus_send_approved_email",
        args={"approval_token": "opaque-token", "subject": "Subject", "text": "Body"},
        tool_call_id="denied-call",
    )
    assert result is not None
    marker_files = list(tmp_path.iterdir())
    assert len(marker_files) == 1
    policy.on_post_approval_response(
        pattern_key=f"plugin_rule:{result['rule_key']}", choice="deny"
    )
    assert list(tmp_path.iterdir()) == []


def test_plugin_python_files_compile_without_importing_hermes() -> None:
    for path in sorted(PLUGIN.glob("*.py")):
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
