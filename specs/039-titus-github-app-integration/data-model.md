# Data Model: Titus GitHub App Integration

## Phase GitHub App profile

| Field | Required | Meaning |
|---|---:|---|
| `GITHUB_APP_ID` | yes | Numeric GitHub App identifier |
| `GITHUB_APP_CLIENT_ID` | yes | GitHub App client identifier |
| `GITHUB_APP_INSTALLATION_ID` | yes | Numeric selected-repository installation |
| `GITHUB_ORGANIZATION` | yes | Exact approved TTS organization |
| `GITHUB_ALLOWED_REPOSITORIES` | yes | Comma-separated repository slugs |
| `GITHUB_APP_PRIVATE_KEY` | yes | PEM private key retained only in Phase and the protected runtime file |

## Derived runtime state

- `TITUS_GITHUB_STATE`: `disabled`, `invalid`, or `ready`.
- `GITHUB_APP_PRIVATE_KEY_PATH`: fixed container path present only when ready.
- The private-key contents are never a runtime environment field.
