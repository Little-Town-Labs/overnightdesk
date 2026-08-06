"""Static/runtime contract tests for the mention-only Teams override."""

from __future__ import annotations

import ast
from pathlib import Path

import yaml


ROOT = Path(__file__).parents[1]
REPO_ROOT = ROOT.parents[1]
REPO_ROOT = ROOT.parents[1]
CONFIG = ROOT / "config" / "config.yaml"
LOADER = ROOT / "runtime" / "load-phase-env.sh"
PREPARE_VOLUME = ROOT / "runtime" / "prepare-volume.sh"
START_WITH_SECRETS = ROOT / "runtime" / "start-with-secrets.sh"
SOUL = ROOT / "config" / "SOUL.md"
SKILL = ROOT / "skills" / "titus-teams-channel" / "SKILL.md"
PLUGIN = ROOT / "plugins" / "platforms" / "titus_teams"
TEAMS_ROUTE = REPO_ROOT / "infra" / "nginx" / "titus-teams.conf"
TEAMS_HTTP_ROUTE = REPO_ROOT / "infra" / "nginx" / "titus-teams-http.conf"
TITUS_DASHBOARD_ROUTE = REPO_ROOT / "infra" / "nginx" / "titus-hermes.conf"
TEAMS_ROUTE_PATCHER = REPO_ROOT / "infra" / "nginx" / "patch-titus-teams-route.py"
TEAMS_ROUTE = REPO_ROOT / "infra" / "nginx" / "titus-teams.conf"
TEAMS_HTTP_ROUTE = REPO_ROOT / "infra" / "nginx" / "titus-teams-http.conf"


def test_titus_teams_override_is_explicitly_enabled() -> None:
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))

    assert "platforms/titus_teams" in config["plugins"]["enabled"]
    assert config["platforms"]["teams"]["enabled"] is False
    assert config["platforms"]["teams"]["extra"]["allow_all_users"] is False
    assert config["platforms"]["teams"]["extra"]["require_mention"] is True
    assert "extra['require_mention'] = True" in START_WITH_SECRETS.read_text(
        encoding="utf-8"
    )


def test_phase_readiness_requires_exact_team_and_channel_ids() -> None:
    loader = LOADER.read_text(encoding="utf-8")

    readiness_block = loader.split("teams_state=pending", 1)[0]
    assert "for key in" in readiness_block
    for key in (
        "TEAMS_CLIENT_ID",
        "TEAMS_CLIENT_SECRET",
        "TEAMS_TENANT_ID",
        "TEAMS_ALLOWED_USERS",
        "TEAMS_TEAM_ID",
        "TEAMS_CHANNEL_ID",
    ):
        assert key in readiness_block


def test_manifest_and_runtime_do_not_request_all_message_rsc() -> None:
    manifest = (PLUGIN / "plugin.yaml").read_text(encoding="utf-8")
    config = CONFIG.read_text(encoding="utf-8")

    assert "ChannelMessage.Read.Group" not in manifest
    assert "ChannelMessage.Read.Group" not in config


def test_runtime_preparation_installs_repo_owned_override() -> None:
    script = PREPARE_VOLUME.read_text(encoding="utf-8")

    assert "/source/plugins/platforms/titus_teams/plugin.yaml" in script
    assert "/source/plugins/platforms/titus_teams/adapter.py" in script
    assert "/source/plugins/platforms/titus_teams/policy.py" in script


def test_plugin_python_files_compile_without_importing_hermes() -> None:
    for path in sorted(PLUGIN.glob("*.py")):
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def test_routing_telemetry_is_content_free() -> None:
    source = (PLUGIN / "adapter.py").read_text(encoding="utf-8")
    logger_lines = [line for line in source.splitlines() if "logger.info" in line]

    assert logger_lines
    assert all('extra={"reason": decision.reason}' in line for line in logger_lines)
    for forbidden in (
        "activity.text",
        "activity.entities",
        "sender_id",
        "team_id",
        "channel_id",
        "message_id",
    ):
        assert all(forbidden not in line for line in logger_lines)


def test_teams_requests_preserve_existing_manual_approval_boundary() -> None:
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))

    assert config["approvals"]["mode"] == "manual"
    assert "approval" in SOUL.read_text(encoding="utf-8").lower()


def test_memory_uses_native_explicit_source_tagged_behavior() -> None:
    skill = SKILL.read_text(encoding="utf-8")
    soul = SOUL.read_text(encoding="utf-8")

    assert "existing native `memory` capability" in skill
    assert "Teams/TTS-Internal" in skill
    assert "ordinary non-mentioned messages" in soul
    assert "separate channel memory store" in soul


def test_teams_route_is_exact_webhook_only_and_dashboard_independent() -> None:
    route = TEAMS_ROUTE.read_text(encoding="utf-8")
    http_route = TEAMS_HTTP_ROUTE.read_text(encoding="utf-8")
    dashboard_route = TITUS_DASHBOARD_ROUTE.read_text(encoding="utf-8")

    assert "location = /api/messages" in route
    assert "proxy_pass http://hermes-titus:3978" in route
    assert "location / { return 404; }" in route
    assert "auth_request" not in route
    assert "server_name titus-dashboard.overnightdesk.com" in route
    assert "location /.well-known/acme-challenge/" in http_route
    assert "location = /api/messages" in dashboard_route
    assert "auth_request /auth-verify" in dashboard_route


def test_dashboard_route_patch_is_narrow_and_fail_closed() -> None:
    patcher = TEAMS_ROUTE_PATCHER.read_text(encoding="utf-8")

    assert "location = /auth-verify" in patcher
    assert "auth_request /auth-verify;" in patcher
    assert "location = /api/messages" in patcher
    assert "already present" in patcher
    assert "does not match the expected safe patch boundary" in patcher


def test_teams_route_is_exact_webhook_only_and_dashboard_independent() -> None:
    route = TEAMS_ROUTE.read_text(encoding="utf-8")
    http_route = TEAMS_HTTP_ROUTE.read_text(encoding="utf-8")

    assert "location = /api/messages" in route
    assert "proxy_pass http://hermes-titus:3978" in route
    assert "location / { return 404; }" in route
    assert "auth_request" not in route
    assert "server_name titus-dashboard.overnightdesk.com" in route
    assert "location /.well-known/acme-challenge/" in http_route
