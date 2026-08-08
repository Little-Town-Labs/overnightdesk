# Data Model: Titus Telegram DM Channel

This feature adds no database schema. The entities below describe the runtime
contract and evidence boundary.

## Telegram Phase profile

| Field | Source | Validation | Exposure |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Phase secret | Non-empty, no whitespace, Telegram token shape | Runtime only |
| `TELEGRAM_ALLOWED_USERS` | Phase metadata | Exactly one decimal numeric ID; no wildcard or list | Runtime policy |

The profile must contain exactly these two keys. A missing, extra, malformed,
or ambiguous profile is not ready.

## Telegram message event

Provider data used for the pre-dispatch boundary:

- sender numeric ID;
- chat type (`private`, `group`, `supergroup`, `forum`, or `channel`);
- provider update/message metadata needed by the native adapter.

Message text, attachments, usernames, display names, and chat titles are not
authorization inputs. Rejected events must not enter Titus reasoning, tools,
memory, or visible output.

## Channel state

The runtime exposes bounded states only:

- `disabled`: no valid Telegram profile is projected;
- `ready`: strict Phase validation passed;
- `connected`: native adapter is running and polling;
- `degraded`: provider or polling failure is present;
- `failed`: startup or credential validation failed.

Evidence may include state, policy cardinality, transport mode, and failure
category. It must not include token, message, user ID, chat ID, or raw provider
payload values.
