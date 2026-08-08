"""TDD contract tests for the mention-only Titus Teams boundary."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "plugins" / "platforms" / "titus_teams"))

from policy import RoutingPolicy, activity_scope, evaluate_message, evaluate_scope  # noqa: E402
from fixtures.teams_channel import (  # noqa: E402
    AUTHORIZED_USERS,
    BOT_ID,
    CHANNEL_ID,
    TEAM_ID,
    mention_entity,
    mention_text,
    ordinary_text,
)


def policy(**overrides) -> RoutingPolicy:
    values = {
        "team_id": TEAM_ID,
        "channel_id": CHANNEL_ID,
        "allowed_users": frozenset(AUTHORIZED_USERS),
    }
    values.update(overrides)
    return RoutingPolicy(**values)


def test_authorized_titus_mention_is_accepted() -> None:
    decision = evaluate_message(
        policy(),
        team_id=TEAM_ID,
        channel_id=CHANNEL_ID,
        sender_id=AUTHORIZED_USERS[0],
        text=mention_text(),
        bot_id=BOT_ID,
    )

    assert decision.accepted is True
    assert decision.reason == "accepted"


def test_authorized_ordinary_message_is_rejected_before_inference() -> None:
    decision = evaluate_message(
        policy(),
        team_id=TEAM_ID,
        channel_id=CHANNEL_ID,
        sender_id=AUTHORIZED_USERS[0],
        text=ordinary_text(),
        bot_id=BOT_ID,
    )

    assert decision.accepted is False
    assert decision.reason == "missing_mention"


def test_mention_entity_must_target_titus() -> None:
    decision = evaluate_message(
        policy(),
        team_id=TEAM_ID,
        channel_id=CHANNEL_ID,
        sender_id=AUTHORIZED_USERS[0],
        text="summarize this discussion",
        entities=[mention_entity()],
        bot_id=BOT_ID,
    )

    assert decision.accepted is True


def test_channel_scoped_bot_identity_is_accepted_for_titus_teams() -> None:
    decision = evaluate_message(
        policy(),
        team_id=TEAM_ID,
        channel_id=CHANNEL_ID,
        sender_id=AUTHORIZED_USERS[0],
        text="<at>Titus Teams</at> summarize this discussion",
        entities=[mention_entity(bot_id="28:channel-scoped-bot-id", name="Titus Teams")],
        bot_id=(BOT_ID, "28:channel-scoped-bot-id"),
    )

    assert decision.accepted is True


def test_titus_teams_provider_markup_is_accepted_without_entity_id() -> None:
    decision = evaluate_message(
        policy(),
        team_id=TEAM_ID,
        channel_id=CHANNEL_ID,
        sender_id=AUTHORIZED_USERS[0],
        text="<at>@Titus Teams</at> summarize this discussion",
        bot_id=BOT_ID,
    )

    assert decision.accepted is True


@pytest.mark.parametrize(
    ("team_id", "channel_id", "sender_id", "expected_reason"),
    [
        ("other-team", CHANNEL_ID, AUTHORIZED_USERS[0], "unsupported_team"),
        (TEAM_ID, "project-channel", AUTHORIZED_USERS[0], "unsupported_channel"),
        (TEAM_ID, CHANNEL_ID, "unauthorized-object-id", "unauthorized_user"),
    ],
)
def test_scope_and_principal_are_exact_matches(
    team_id: str,
    channel_id: str,
    sender_id: str,
    expected_reason: str,
) -> None:
    decision = evaluate_message(
        policy(),
        team_id=team_id,
        channel_id=channel_id,
        sender_id=sender_id,
        text=mention_text(),
        bot_id=BOT_ID,
    )

    assert decision.accepted is False
    assert decision.reason == expected_reason


@pytest.mark.parametrize(
    "invalid_policy",
    [
        policy(team_id=""),
        policy(channel_id=""),
        policy(allowed_users=frozenset()),
        policy(allowed_users=frozenset({"*"})),
    ],
)
def test_invalid_policy_fails_closed(invalid_policy: RoutingPolicy) -> None:
    decision = evaluate_message(
        invalid_policy,
        team_id=TEAM_ID,
        channel_id=CHANNEL_ID,
        sender_id=AUTHORIZED_USERS[0],
        text=mention_text(),
        bot_id=BOT_ID,
    )

    assert decision.accepted is False
    assert decision.reason == "invalid_policy"


def test_plain_at_text_is_not_a_provider_mention() -> None:
    decision = evaluate_message(
        policy(),
        team_id=TEAM_ID,
        channel_id=CHANNEL_ID,
        sender_id=AUTHORIZED_USERS[0],
        text="@Titus summarize this discussion",
        bot_id=BOT_ID,
    )

    assert decision.accepted is False
    assert decision.reason == "missing_mention"


def test_activity_scope_reads_bot_framework_channel_data() -> None:
    class Activity:
        channel_data = {
            "team": {"id": TEAM_ID},
            "channel": {"id": CHANNEL_ID},
        }

    assert activity_scope(Activity()) == (TEAM_ID, CHANNEL_ID)


def test_activity_scope_missing_data_fails_closed() -> None:
    class Activity:
        channel_data = {}

    assert activity_scope(Activity()) == ("", "")


def test_card_action_scope_uses_the_same_exact_boundary() -> None:
    decision = evaluate_scope(
        policy(),
        team_id=TEAM_ID,
        channel_id="project-channel",
        sender_id=AUTHORIZED_USERS[0],
    )

    assert decision.accepted is False
    assert decision.reason == "unsupported_channel"
