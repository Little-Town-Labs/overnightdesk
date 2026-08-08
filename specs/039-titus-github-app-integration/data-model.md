# Data Model: Titus GitHub App Integration

## Phase GitHub App profiles

| Field | Required | Meaning |
|---|---:|---|
| `GITHUB_APP_ID` | yes | Numeric GitHub App identifier |
| `GITHUB_APP_CLIENT_ID` | yes | GitHub App client identifier |
| `GITHUB_APP_INSTALLATION_ID` | yes | Numeric selected-repository installation |
| `GITHUB_ORGANIZATION` | yes | Exact approved TTS organization |
| `GITHUB_ALLOWED_REPOSITORIES` | yes | Comma-separated repository slugs |
| `GITHUB_APP_PRIVATE_KEY` | yes | PEM private key retained only in Phase and the protected runtime file |

The same Phase path may contain a separate repository-manager profile with the
parallel `GITHUB_REPOSITORY_MANAGER_*` fields. Its five metadata fields and
private key are retained only in root-owned host files for the host-only
verification helper; none are projected to Titus's general runtime.

## Derived runtime state

- `TITUS_GITHUB_STATE`: `disabled`, `invalid`, or `ready`.
- `GITHUB_APP_PRIVATE_KEY_PATH`: fixed container path present only when ready.
- `TITUS_GITHUB_REPOSITORY_MANAGER_STATE`: `disabled`, `invalid`, or `ready`
  in the host-only manager env file.
- `GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY_PATH`: fixed host path present
  only in the host-only manager env file when the profile is ready.
- The private-key contents are never a runtime environment field.
