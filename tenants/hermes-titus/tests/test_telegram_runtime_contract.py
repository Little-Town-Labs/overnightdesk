"""Contract tests for the Titus Telegram private-DM boundary."""

from __future__ import annotations

from pathlib import Path

import yaml

from fixtures.telegram_channel import (
    GARY_USER_ID,
    MULTI_USER_ALLOWLIST,
    NON_PRIVATE_CHAT_TYPES,
    UNAUTHORIZED_USER_ID,
    VALID_BOT_TOKEN,
    WILDCARD_USER_ID,
    group_message,
    private_message,
    senderless_message,
)


ROOT = Path(__file__).parents[1]
CONFIG = ROOT / "config" / "config.yaml"
LOADER = ROOT / "runtime" / "load-phase-env.sh"
START_WITH_SECRETS = ROOT / "runtime" / "start-with-secrets.sh"
README = ROOT / "README.md"
RUNBOOK = ROOT / "runbooks" / "telegram-dm-channel.md"
DEPLOY = ROOT / "scripts" / "deploy-aegis.sh"


def test_fixture_covers_the_private_and_group_boundary() -> None:
    assert private_message() == {"sender_id": GARY_USER_ID, "chat_type": "private"}
    assert group_message() == {"sender_id": GARY_USER_ID, "chat_type": "group"}
    assert private_message(sender_id=UNAUTHORIZED_USER_ID)["sender_id"] != GARY_USER_ID
    assert {
        group_message(chat_type=chat_type)["chat_type"]
        for chat_type in NON_PRIVATE_CHAT_TYPES
    } == set(NON_PRIVATE_CHAT_TYPES)
    assert senderless_message()["sender_id"] is None


def test_ready_telegram_reuses_existing_approval_and_session_runtime() -> None:
    source = START_WITH_SECRETS.read_text(encoding="utf-8")

    assert "/opt/data/bin/apply-email-mode.py" in source
    assert "exec /opt/data/bin/start-all.sh" in source
    assert "HERMES_API_KEY" in source


def test_telegram_phase_contract_is_exact_and_separate_from_matrix() -> None:
    source = LOADER.read_text(encoding="utf-8")

    assert "/agents/hermes-titus/telegram" in source
    assert '"TELEGRAM_ALLOWED_USERS"' in source
    assert '"TELEGRAM_BOT_TOKEN"' in source
    assert "TELEGRAM_ENABLED" not in source
    assert "/agents/hermes-titus/matrix" in source


def test_telegram_policy_accepts_one_numeric_user_only() -> None:
    source = LOADER.read_text(encoding="utf-8")
    startup = START_WITH_SECRETS.read_text(encoding="utf-8")

    assert "TELEGRAM_ALLOWED_USERS" in source
    assert "TELEGRAM_ALLOW_ALL_USERS=false" in startup
    assert WILDCARD_USER_ID in source
    assert MULTI_USER_ALLOWLIST not in source
    assert VALID_BOT_TOKEN not in source


def test_source_config_is_disabled_and_private_dm_only() -> None:
    config = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    telegram = config["platforms"]["telegram"]

    assert telegram["enabled"] is False
    assert telegram["extra"]["allow_from"] == []
    assert telegram["extra"]["group_allow_from"] == []
    assert telegram["extra"]["require_mention"] is False
    assert telegram["extra"]["guest_mode"] is False
    assert telegram["extra"]["observe_unmentioned_group_messages"] is False
    assert "group_allowed_chats" not in telegram["extra"]
    assert "allowed_chats" not in telegram["extra"]


def test_startup_gates_telegram_on_readiness_without_webhook_or_public_port() -> None:
    source = START_WITH_SECRETS.read_text(encoding="utf-8")
    deploy = DEPLOY.read_text(encoding="utf-8")

    assert "TITUS_TELEGRAM_STATE" in source
    assert "TELEGRAM_BOT_TOKEN" in source
    assert "TELEGRAM_ALLOWED_USERS" in source
    assert "group_allow_from" in source
    assert "TELEGRAM_WEBHOOK_URL" not in source
    assert "TELEGRAM_WEBHOOK_SECRET" not in source
    assert "disabled|invalid|failed" in source
    assert "3978" not in source.split("telegram", 1)[-1]
    assert "telegram_state=" in deploy
    assert "group_allow_from" in deploy
    assert "TELEGRAM_ALLOWED_USERS" in deploy
    assert 'invalid", "failed", "ready' in deploy
    assert "api.telegram.org/bot" in deploy
    assert "gateway_platforms" in deploy
    assert "telegram_provider=reachable" in deploy
    assert "telegram_adapter_state=connected" in deploy


def test_documentation_preserves_secret_free_gary_only_boundary() -> None:
    readme = README.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")

    combined = f"{readme}\n{runbook}"
    assert "/agents/hermes-titus/telegram" in combined
    assert "Gary" in combined
    assert "private" in combined.lower()
    assert VALID_BOT_TOKEN not in combined
    assert "group" in combined.lower()
    assert "message bodies" in combined.lower()
