# Titus GitHub App integration

Titus uses the organization-owned TTS GitHub App through the Phase namespace
`/agents/github`. The namespace is separate from Titus's core runtime paths and
contains exactly these records:

- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_ORGANIZATION`
- `GITHUB_ALLOWED_REPOSITORIES`
- `GITHUB_APP_PRIVATE_KEY`

The same Phase path may also contain the separate repository-manager App:

- `GITHUB_REPOSITORY_MANAGER_APP_ID`
- `GITHUB_REPOSITORY_MANAGER_APP_CLIENT_ID`
- `GITHUB_REPOSITORY_MANAGER_APP_INSTALLATION_ID`
- `GITHUB_REPOSITORY_MANAGER_ORGANIZATION`
- `GITHUB_REPOSITORY_MANAGER_ALLOWED_REPOSITORIES`
- `GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY`

The loader accepts only the organization `timeless-technology-solutions`, a
numeric App and installation ID, a repository-slug allowlist, and a PEM private
key. The key is never placed in Titus's environment or Docker configuration.
The Aegis host writes it to a root-owned, mode-0440 file and mounts that file
read-only at `/run/secrets/hermes-titus-github-app-private-key`. Hermes's native
GitHub App adapter reads that path and obtains a short-lived installation token.
The non-secret App metadata is also supplied through a dedicated Docker env
file so fresh `docker exec` diagnostics see the same App identity as Titus's
gateway. The private key is intentionally absent from that env file.
The repository-manager metadata follows the same rule. Its private key is
available only at the separate protected mount
`/run/secrets/hermes-titus-github-repository-manager-app-private-key` and is
never injected as `GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY`.

`TITUS_GITHUB_STATE=ready` means the profile passed shape validation. Titus's
deployment verifier additionally obtains a provider token, confirms the
GitHub-App provider is active, and checks that the installation covers every
repository in `GITHUB_ALLOWED_REPOSITORIES`. Its output contains only the
provider, organization, and repository counts.

Credential presence is not authority. The active Titus Control Tower profile
must still be checked before any GitHub operation. The monitoring-only profile
`read-hermes-monitoring` does not authorize GitHub mutation; this integration
does not alter that profile or grant repository write authority.

## Qualification and rollback

Run the source qualification before deployment:

```text
tenants/hermes-titus/scripts/qualify.sh
```

After the controlled Titus-only deployment, run:

```text
tenants/hermes-titus/scripts/deploy-aegis.sh verify
```

If the Phase profile is absent, malformed, or revoked, the loader disables only
the GitHub integration and keeps Titus's shared runtime and other channels
available. To roll back, remove or disable the Phase records, restart only
`hermes-titus.service`, and rerun the verifier. Never print, copy, or place the
private key in chat, logs, source control, Docker environment output, or agent
memory.
