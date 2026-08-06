"""Repo-owned, narrow override around Hermes's native Teams adapter."""

from __future__ import annotations

import logging
import os
from typing import Any

from plugins.platforms.teams.adapter import (
    AdaptiveCardActionMessageResponse,
    InvokeResponse,
    TeamsAdapter as HermesTeamsAdapter,
    _env_enablement,
    _standalone_send,
    check_requirements,
    interactive_setup,
    is_connected,
    validate_config,
)

from .policy import RoutingPolicy, activity_scope, evaluate_message, evaluate_scope

logger = logging.getLogger(__name__)


class TitusTeamsAdapter(HermesTeamsAdapter):
    """Apply Titus's exact channel and mention boundary before Hermes dispatch."""

    def __init__(self, config: Any):
        super().__init__(config)
        extra = getattr(config, "extra", {}) or {}
        self._titus_policy = RoutingPolicy.from_values(
            team_id=os.getenv("TEAMS_TEAM_ID") or extra.get("team_id", ""),
            channel_id=os.getenv("TEAMS_CHANNEL_ID") or extra.get("channel_id", ""),
            allowed_users=os.getenv("TEAMS_ALLOWED_USERS") or extra.get("allowed_users", ""),
            enabled=True,
        )

    async def _on_message(self, ctx: Any) -> None:
        activity = ctx.activity
        team_id, channel_id = activity_scope(activity)
        sender = getattr(activity, "from_", None)
        sender_id = getattr(sender, "aad_object_id", None) or getattr(sender, "id", "")
        bot_id = self._app.id if self._app else None
        decision = evaluate_message(
            self._titus_policy,
            team_id=team_id,
            channel_id=channel_id,
            sender_id=str(sender_id),
            text=str(getattr(activity, "text", "") or ""),
            entities=getattr(activity, "entities", None),
            bot_id=bot_id,
        )
        if not decision.accepted:
            logger.info("teams_message_rejected", extra={"reason": decision.reason})
            return
        logger.info("teams_message_accepted", extra={"reason": decision.reason})
        await super()._on_message(ctx)

    async def _on_card_action(self, ctx: Any) -> Any:
        activity = ctx.activity
        team_id, channel_id = activity_scope(activity)
        sender = getattr(activity, "from_", None)
        sender_id = getattr(sender, "aad_object_id", None) or getattr(sender, "id", "")
        decision = evaluate_scope(
            self._titus_policy,
            team_id=team_id,
            channel_id=channel_id,
            sender_id=str(sender_id),
        )
        if not decision.accepted:
            logger.info("teams_card_action_rejected", extra={"reason": decision.reason})
            return InvokeResponse(
                status=200,
                body=AdaptiveCardActionMessageResponse(value="⛔ Not authorized."),
            )
        return await super()._on_card_action(ctx)


def register(ctx) -> None:
    """Override the bundled Teams platform while preserving its send surface."""

    ctx.register_platform(
        name="teams",
        label="Microsoft Teams",
        adapter_factory=lambda cfg: TitusTeamsAdapter(cfg),
        check_fn=check_requirements,
        validate_config=validate_config,
        required_env=["TEAMS_CLIENT_ID", "TEAMS_CLIENT_SECRET", "TEAMS_TENANT_ID"],
        install_hint="pip install microsoft-teams-apps aiohttp",
        is_connected=is_connected,
        setup_fn=interactive_setup,
        env_enablement_fn=_env_enablement,
        cron_deliver_env_var="TEAMS_HOME_CHANNEL",
        standalone_sender_fn=_standalone_send,
        allowed_users_env="TEAMS_ALLOWED_USERS",
        allow_all_env="TEAMS_ALLOW_ALL_USERS",
        max_message_length=28000,
        emoji="💼",
        allow_update_command=True,
        platform_hint=(
            "You are chatting via Microsoft Teams. Teams renders a subset of "
            "markdown — bold (**text**), italic (*text*), and inline code "
            "(`code`) work, but complex tables or raw HTML do not. Keep "
            "responses clear and professional."
        ),
    )
