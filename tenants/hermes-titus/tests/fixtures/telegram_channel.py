"""Redacted fixtures for the Titus Telegram DM contract."""

GARY_USER_ID = "123456789"
UNAUTHORIZED_USER_ID = "987654321"
VALID_BOT_TOKEN = "123456789:AbCdEf_0123456789"
WILDCARD_USER_ID = "*"
MULTI_USER_ALLOWLIST = f"{GARY_USER_ID},{UNAUTHORIZED_USER_ID}"
NON_PRIVATE_CHAT_TYPES = ("group", "supergroup", "forum", "channel")


def private_message(*, sender_id: str = GARY_USER_ID) -> dict[str, str]:
    return {"sender_id": sender_id, "chat_type": "private"}


def group_message(
    *, sender_id: str = GARY_USER_ID, chat_type: str = "group"
) -> dict[str, str]:
    return {"sender_id": sender_id, "chat_type": chat_type}


def senderless_message() -> dict[str, str | None]:
    return {"sender_id": None, "chat_type": "private"}
