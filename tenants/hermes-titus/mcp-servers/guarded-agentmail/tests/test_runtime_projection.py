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
START_WITH_SECRETS = Path(__file__).parents[3] / "runtime" / "start-with-secrets.sh"
DEPLOY_SCRIPT = Path(__file__).parents[3] / "scripts" / "deploy-aegis.sh"
QUALIFY_SCRIPT = Path(__file__).parents[3] / "scripts" / "qualify.sh"
TENANT_README = Path(__file__).parents[3] / "README.md"
APPROVED_DEFAULT_MODEL = "gpt-5.6-sol"
APPROVED_DELEGATION_MODEL = "gpt-5.6-luna"
APPROVED_MEMORY_MODEL = "xiaomi/mimo-v2.5-pro"
CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
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


def test_email_skill_never_reinterprets_ambiguous_send_as_success() -> None:
    skill = EMAIL_SKILL.read_text()

    assert (
        "Never reinterpret `ambiguous_unverified` as a false alarm based on "
        "prior deliveries, recipient confirmations, provider history, or memory."
    ) in skill
    assert 'Never say "should be delivered"' in skill
    assert (
        "provider accepted one message, exact content delivery is unverified, "
        "do not retry, and operator reconciliation is required"
    ) in skill


def test_titus_primary_model_contract_uses_codex_sol_at_medium_effort() -> None:
    config = yaml.safe_load(CONFIG.read_text())
    load_phase = LOAD_PHASE_ENV.read_text()
    startup = START_WITH_SECRETS.read_text()
    deploy = DEPLOY_SCRIPT.read_text()
    qualify = QUALIFY_SCRIPT.read_text()
    readme = TENANT_README.read_text()

    assert config["model"] == {
        "default": "__FROM_PHASE__",
        "provider": "openai-codex",
        "base_url": CODEX_BASE_URL,
    }
    assert config["agent"]["reasoning_effort"] == "medium"
    assert f'.HERMES_DEFAULT_MODEL == "{APPROVED_DEFAULT_MODEL}"' in load_phase
    assert (
        f'pid1_env.get("HERMES_INFERENCE_MODEL") == "{APPROVED_DEFAULT_MODEL}"'
        in deploy
    )
    assert "config['model']['provider'] = 'openai-codex'" in startup
    assert f"config['model']['base_url'] = '{CODEX_BASE_URL}'" in startup
    assert f"effective_model_route={APPROVED_DEFAULT_MODEL}" in deploy
    assert "provider=openai-codex" in deploy
    assert "auth_mode=chatgpt" in deploy
    assert "gpt-5\\.6-sol" in qualify
    assert f"`{APPROVED_DEFAULT_MODEL}`" in readme
    assert "reasoning effort `medium`" in readme


def test_titus_delegation_contract_uses_bounded_luna_at_high_effort() -> None:
    config = yaml.safe_load(CONFIG.read_text())
    startup = START_WITH_SECRETS.read_text()
    deploy = DEPLOY_SCRIPT.read_text()
    qualify = QUALIFY_SCRIPT.read_text()
    delegation = config["delegation"]

    assert delegation == {
        "provider": "openai-codex",
        "base_url": CODEX_BASE_URL,
        "model": APPROVED_DELEGATION_MODEL,
        "reasoning_effort": "high",
        "orchestrator_enabled": True,
        "max_concurrent_children": 3,
        "max_iterations": 30,
        "max_spawn_depth": 1,
        "child_timeout_seconds": 600,
        "inherit_mcp_toolsets": True,
        "subagent_auto_approve": False,
    }
    assert "delegation['reasoning_effort'] = 'high'" in startup
    assert "delegation['max_concurrent_children'] = 3" in startup
    assert "delegation['max_spawn_depth'] = 1" in startup
    assert "delegation['subagent_auto_approve'] = False" in startup
    assert f"delegation_route={APPROVED_DELEGATION_MODEL}" in deploy
    assert "delegation_reasoning_effort=high" in deploy
    assert "gpt-5\\.6-luna" in qualify


def test_titus_memory_model_is_independent_from_primary_inference() -> None:
    load_phase = LOAD_PHASE_ENV.read_text()
    startup = START_WITH_SECRETS.read_text()
    deploy = DEPLOY_SCRIPT.read_text()
    qualify = QUALIFY_SCRIPT.read_text()
    readme = TENANT_README.read_text()

    assert '"MEMORY_TENCENTDB_LLM_MODEL"' in load_phase
    assert (
        f'.MEMORY_TENCENTDB_LLM_MODEL == "{APPROVED_MEMORY_MODEL}"'
        in load_phase
    )
    assert "MEMORY_TENCENTDB_LLM_MODEL" in startup
    assert "export TDAI_LLM_MODEL=$MEMORY_TENCENTDB_LLM_MODEL" in startup
    assert "export TDAI_LLM_MODEL=$HERMES_DEFAULT_MODEL" not in startup
    assert (
        f'pid1_env.get("TDAI_LLM_MODEL") == "{APPROVED_MEMORY_MODEL}"'
        in deploy
    )
    assert f"memory_llm_route={APPROVED_MEMORY_MODEL}" in deploy
    assert "MEMORY_TENCENTDB_LLM_MODEL" in qualify
    assert "`MEMORY_TENCENTDB_LLM_MODEL`" in readme
    assert (
        "OpenRouter remains scoped to memory processing and embeddings"
        in " ".join(readme.split())
    )


def test_titus_oauth_verification_is_value_free_and_titus_scoped() -> None:
    deploy = DEPLOY_SCRIPT.read_text()
    readme = TENANT_README.read_text()

    assert "auth.json" in deploy
    assert 'auth.get("active_provider") == "openai-codex"' in deploy
    assert 'credential.get("auth_type") == "oauth"' in deploy
    assert 'endswith("device_code")' in deploy
    assert 'credential.get("access_token")' in deploy
    assert 'credential.get("refresh_token")' in deploy
    assert "auth_stat.st_mode & 0o777 == 0o600" in deploy
    assert "auth_stat.st_uid == 10000" in deploy
    assert "auth_stat.st_gid == 10000" in deploy
    assert "fresh Titus-owned OAuth" in readme
    assert "Do not copy" in readme
