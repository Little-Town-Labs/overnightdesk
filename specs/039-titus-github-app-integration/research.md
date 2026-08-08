# Research: Titus GitHub App Integration

## Findings

- Repository source showed Titus's existing Phase loader and runtime env mount
  but no GitHub projection.
- A value-free Phase inventory found the owner-approved namespace at
  `/agents/github` with the six expected key names.
- The pinned Titus Hermes image includes `tools.skills_hub.GitHubAuth`, which
  reads `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`, and
  `GITHUB_APP_INSTALLATION_ID`, then obtains a short-lived installation token.
- The current Titus container has the GitHub skill bundle and `gh`, but no
  authenticated CLI state. CLI login is therefore not used as the integration
  path.
- Titus's Control Tower helper currently requires the monitoring-only
  `read-hermes-monitoring` profile. The GitHub change does not alter that
  boundary.

## Decisions

1. Use `/agents/github`, not a new `/agents/hermes-titus/github` path.
2. Use a dedicated key-file mount because the Hermes provider contract expects a
   path and private keys must not be environment values.
3. Treat absent or malformed optional GitHub data as disabled/invalid for the
   GitHub surface while preserving Titus startup.
4. Verify provider authentication and installation coverage with read-only
   GitHub API calls before reporting ready.
