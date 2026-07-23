from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
import yaml

SCRIPT = Path(__file__).parents[3] / "runtime" / "apply-email-mode.py"
CONFIG = Path(__file__).parents[3] / "config" / "config.yaml"
SPEC = importlib.util.spec_from_file_location("apply_email_mode", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def source_config() -> dict[str, object]:
    return {
        "mcp_servers": {
            "agentmail": {
                "url": "https://mcp.agentmail.to/mcp",
                "tools": {"include": ["list_inboxes"]},
            },
            "guarded_agentmail": {
                "command": "/opt/hermes/.venv/bin/python",
                "args": ["/opt/data/mcp-servers/guarded-agentmail/server.py"],
            },
        }
    }


def write_config(tmp_path: Path) -> Path:
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(source_config(), sort_keys=False))
    path.chmod(0o644)
    return path


def test_read_only_projection_removes_only_local_guarded_server(
    tmp_path: Path,
) -> None:
    path = write_config(tmp_path)
    MODULE.apply_email_mode("read_only", path)
    projected = yaml.safe_load(path.read_text())
    assert set(projected["mcp_servers"]) == {"agentmail"}
    assert (
        projected["mcp_servers"]["agentmail"]
        == source_config()["mcp_servers"]["agentmail"]
    )
    assert path.stat().st_mode & 0o777 == 0o644


def test_guarded_projection_requires_both_servers(tmp_path: Path) -> None:
    path = write_config(tmp_path)
    MODULE.apply_email_mode("guarded", path)
    assert set(yaml.safe_load(path.read_text())["mcp_servers"]) == {
        "agentmail",
        "guarded_agentmail",
    }

    path.write_text(yaml.safe_dump({"mcp_servers": {"agentmail": {}}}))
    with pytest.raises(ValueError, match="guarded AgentMail"):
        MODULE.apply_email_mode("guarded", path)


def test_projection_rejects_unknown_mode(tmp_path: Path) -> None:
    path = write_config(tmp_path)
    with pytest.raises(ValueError, match="mode"):
        MODULE.apply_email_mode("disabled", path)


def test_guarded_server_exposes_only_the_two_email_tools() -> None:
    config = yaml.safe_load(CONFIG.read_text())
    guarded = config["mcp_servers"]["guarded_agentmail"]

    assert guarded["tools"] == {
        "include": [
            "titus_prepare_email_approval",
            "titus_send_approved_email",
        ],
        "resources": False,
        "prompts": False,
    }
