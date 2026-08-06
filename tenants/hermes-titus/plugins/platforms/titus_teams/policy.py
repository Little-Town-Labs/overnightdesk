"""Fail-closed routing policy for the Titus Teams mention-only MVP."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Iterable, Mapping


_TITUS_MENTION_RE = re.compile(r"<at>\s*Titus\s*</at>", re.IGNORECASE)


@dataclass(frozen=True)
class RoutingPolicy:
    """Exact Team, channel, and principal boundary for Titus."""

    team_id: str
    channel_id: str
    allowed_users: frozenset[str]
    enabled: bool = True

    @classmethod
    def from_values(
        cls,
        *,
        team_id: str,
        channel_id: str,
        allowed_users: str | Iterable[str],
        enabled: bool = True,
    ) -> "RoutingPolicy":
        if isinstance(allowed_users, str):
            principals = frozenset(
                item.strip() for item in allowed_users.split(",") if item.strip()
            )
        else:
            principals = frozenset(
                str(item).strip() for item in allowed_users if str(item).strip()
            )
        return cls(
            team_id=str(team_id).strip(),
            channel_id=str(channel_id).strip(),
            allowed_users=principals,
            enabled=enabled,
        )

    def is_valid(self) -> bool:
        """Return whether the policy is safe to use for inbound routing."""

        return (
            self.enabled
            and _safe_identifier(self.team_id)
            and _safe_identifier(self.channel_id)
            and bool(self.allowed_users)
            and all(
                _safe_identifier(user_id) and user_id != "*"
                for user_id in self.allowed_users
            )
        )


@dataclass(frozen=True)
class RoutingDecision:
    """Stable, non-sensitive routing outcome for tests and telemetry."""

    accepted: bool
    reason: str


def evaluate_message(
    policy: RoutingPolicy,
    *,
    team_id: str,
    channel_id: str,
    sender_id: str,
    text: str = "",
    entities: Iterable[Any] | None = None,
    bot_id: str | None = None,
) -> RoutingDecision:
    """Evaluate one Teams activity before it enters Hermes reasoning."""

    scope_decision = evaluate_scope(
        policy,
        team_id=team_id,
        channel_id=channel_id,
        sender_id=sender_id,
    )
    if not scope_decision.accepted:
        return scope_decision
    if not has_titus_mention(text, entities=entities, bot_id=bot_id):
        return RoutingDecision(False, "missing_mention")
    return RoutingDecision(True, "accepted")


def evaluate_scope(
    policy: RoutingPolicy,
    *,
    team_id: str,
    channel_id: str,
    sender_id: str,
) -> RoutingDecision:
    """Evaluate the Team/channel/principal boundary without message content."""

    if not policy.is_valid():
        return RoutingDecision(False, "invalid_policy")
    if str(team_id or "") != policy.team_id:
        return RoutingDecision(False, "unsupported_team")
    if str(channel_id or "") != policy.channel_id:
        return RoutingDecision(False, "unsupported_channel")
    if str(sender_id or "") not in policy.allowed_users:
        return RoutingDecision(False, "unauthorized_user")
    return RoutingDecision(True, "accepted")


def has_titus_mention(
    text: str,
    *,
    entities: Iterable[Any] | None = None,
    bot_id: str | None = None,
) -> bool:
    """Return true only for a Teams provider mention addressed to Titus."""

    for entity in entities or ():
        data = _as_mapping(entity)
        if str(data.get("type") or "").casefold() != "mention":
            continue
        mentioned = _as_mapping(data.get("mentioned"))
        mentioned_id = str(mentioned.get("id") or "")
        mentioned_name = str(mentioned.get("name") or "")
        if bot_id and mentioned_id == bot_id:
            return True
        if mentioned_name.casefold() == "titus":
            return True

    return bool(_TITUS_MENTION_RE.search(text or ""))


def activity_scope(activity: Any) -> tuple[str, str]:
    """Extract exact Team/channel IDs from Bot Framework channel data."""

    channel_data = getattr(activity, "channel_data", None)
    if channel_data is None:
        channel_data = getattr(activity, "channelData", None)
    data = _as_mapping(channel_data)
    team = _as_mapping(data.get("team"))
    channel = _as_mapping(data.get("channel"))
    return str(team.get("id") or ""), str(channel.get("id") or "")


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    if value is None:
        return {}
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        return dumped if isinstance(dumped, Mapping) else {}
    if hasattr(value, "__dict__"):
        return vars(value)
    return {}


def _safe_identifier(value: str) -> bool:
    if not value or value == "*":
        return False
    return not any(character.isspace() or ord(character) < 32 for character in value)
