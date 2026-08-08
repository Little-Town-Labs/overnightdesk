"""Reusable safe fixtures for the mention-only Teams MVP."""

AUTHORIZED_USERS = ("gary-object-id", "austin-object-id")
TEAM_ID = "team-object-id"
CHANNEL_ID = "channel-object-id"
BOT_ID = "titus-bot-object-id"


def mention_text() -> str:
    return "<at>Titus</at> summarize this discussion"


def ordinary_text() -> str:
    return "The project review is Friday."


def mention_entity(*, bot_id: str = BOT_ID, name: str = "Titus") -> dict:
    return {
        "type": "mention",
        "mentioned": {"id": bot_id, "name": name},
    }
