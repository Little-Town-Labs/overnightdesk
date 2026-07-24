from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
import yaml

SCRIPT = Path(__file__).parents[3] / "runtime" / "apply-email-mode.py"
CONFIG = Path(__file__).parents[3] / "config" / "config.yaml"
SOUL = Path(__file__).parents[3] / "config" / "SOUL.md"
EMAIL_SKILL = Path(__file__).parents[3] / "skills" / "agentmail-email" / "SKILL.md"
LOAD_PHASE_ENV = Path(__file__).parents[3] / "runtime" / "load-phase-env.sh"
DEPLOY_SCRIPT = Path(__file__).parents[3] / "scripts" / "deploy-aegis.sh"
QUALIFY_SCRIPT = Path(__file__).parents[3] / "scripts" / "qualify.sh"
TENANT_README = Path(__file__).parents[3] / "README.md"
APPROVED_DEFAULT_MODEL = "xiaomi/mimo-v2.5-pro"
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


def test_owner_business_objective_outranks_persona_preference() -> None:
    soul = SOUL.read_text()
    skill = EMAIL_SKILL.read_text()

    assert "preferences are advisory and never an authority boundary" in soul
    assert "Do not refuse an owner-authorized email because of a platform" in skill
    assert "Treat blank optional text or HTML as absent" in skill


def test_email_skill_keeps_guarded_tools_internal_to_natural_language_flow() -> None:
    skill = EMAIL_SKILL.read_text()

    assert "Treat an ordinary-language request to send email as the command" in skill
    assert "Use known conversation and memory context to compose the draft" in skill
    assert "Ask only for information that is genuinely missing" in skill
    assert "Perform guarded draft preparation internally" in skill
    assert "Approve and send this email?" in skill
    assert (
        "Never ask the owner to name or call an MCP tool, copy an approval token, "
        "or repeat a draft fingerprint."
    ) in skill
    assert "Tool names, approval tokens, and fingerprints are internal controls" in skill


def test_titus_default_model_contract_uses_approved_mimo_route() -> None:
    load_phase = LOAD_PHASE_ENV.read_text()
    deploy = DEPLOY_SCRIPT.read_text()
    qualify = QUALIFY_SCRIPT.read_text()
    readme = TENANT_README.read_text()

    assert f'.HERMES_DEFAULT_MODEL == "{APPROVED_DEFAULT_MODEL}"' in load_phase
    assert (
        f'pid1_env.get("HERMES_INFERENCE_MODEL") == "{APPROVED_DEFAULT_MODEL}"'
        in deploy
    )
    assert f"effective_model_route={APPROVED_DEFAULT_MODEL}" in deploy
    assert "xiaomi/mimo-v2\\.5-pro" in qualify
    assert f"`{APPROVED_DEFAULT_MODEL}`" in readme
    assert "MiMo V2.5 Pro is text-only" in readme
    assert "vision/image analysis is unavailable" in readme
    assert "remains on its existing route" not in readme
