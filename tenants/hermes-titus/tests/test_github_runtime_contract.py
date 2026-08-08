"""Contract tests for Titus's repository-scoped GitHub App integration."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).parents[1]
LOADER = ROOT / "runtime" / "load-phase-env.sh"
START_WITH_SECRETS = ROOT / "runtime" / "start-with-secrets.sh"
RUN_CONTAINER = ROOT / "runtime" / "run-container.sh"
DEPLOY = ROOT / "scripts" / "deploy-aegis.sh"
MANAGER_VERIFY = ROOT / "scripts" / "verify-github-repository-manager.sh"
README = ROOT / "README.md"
RUNBOOK = ROOT / "runbooks" / "github-app-integration.md"


def test_github_phase_namespace_and_key_contract_are_exact() -> None:
    source = LOADER.read_text(encoding="utf-8")

    assert "/agents/github" in source
    assert 'github_env_group=${TITUS_GITHUB_ENV_GROUP:-hermes-titus}' in source
    assert 'install -d -o root -g "$github_env_group" -m 0750' in source
    assert 'install -o root -g "$github_env_group" -m 0440' in source
    for key in (
        "GITHUB_APP_ID",
        "GITHUB_APP_CLIENT_ID",
        "GITHUB_APP_INSTALLATION_ID",
        "GITHUB_ORGANIZATION",
        "GITHUB_ALLOWED_REPOSITORIES",
        "GITHUB_APP_PRIVATE_KEY",
    ):
        assert key in source
    assert "GITHUB_APP_PRIVATE_KEY_PATH" in source
    assert "TITUS_GITHUB_PRIVATE_KEY_FILE" in source
    for key in (
        "GITHUB_REPOSITORY_MANAGER_APP_ID",
        "GITHUB_REPOSITORY_MANAGER_APP_CLIENT_ID",
        "GITHUB_REPOSITORY_MANAGER_APP_INSTALLATION_ID",
        "GITHUB_REPOSITORY_MANAGER_ORGANIZATION",
        "GITHUB_REPOSITORY_MANAGER_ALLOWED_REPOSITORIES",
        "GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY",
    ):
        assert key in source
    assert "TITUS_GITHUB_REPOSITORY_MANAGER_STATE" in source


def test_private_key_uses_dedicated_read_only_mount_not_process_environment() -> None:
    startup = START_WITH_SECRETS.read_text(encoding="utf-8")
    launcher = RUN_CONTAINER.read_text(encoding="utf-8")
    deploy = DEPLOY.read_text(encoding="utf-8")
    manager_verify = MANAGER_VERIFY.read_text(encoding="utf-8")

    assert "/run/secrets/hermes-titus-github-app-private-key" in startup
    assert "/run/secrets/hermes-titus-github-app-private-key" in launcher
    assert "/run/secrets/hermes-titus-github-repository-manager-app-private-key" not in startup
    assert "/run/secrets/hermes-titus-github-repository-manager-app-private-key" not in launcher
    assert "github-app.env" in launcher
    assert "--env-file" in launcher
    assert "GITHUB_APP_PRIVATE_KEY" in startup
    assert "must not be injected as an environment value" in startup
    assert "GITHUB_APP_PRIVATE_KEY=" in deploy
    assert "GITHUB_REPOSITORY_MANAGER_APP_PRIVATE_KEY=" in deploy
    assert "github_auth.auth_method() == \"github-app\"" in deploy
    assert "github_provider=github-app" in deploy
    assert "verify_github_repository_manager" in deploy
    assert "/installation/repositories" in manager_verify
    assert "/access_tokens" in manager_verify
    assert 'github_organization = os.environ["GITHUB_ORGANIZATION"]' in deploy
    assert 'f"{GITHUB_ORGANIZATION}/' not in deploy


def test_documentation_preserves_credential_and_capability_boundaries() -> None:
    combined = "\n".join(
        path.read_text(encoding="utf-8") for path in (README, RUNBOOK)
    )

    assert "/agents/github" in combined
    assert "GITHUB_APP_PRIVATE_KEY" in combined
    assert "Control Tower" in combined
    assert "does not authorize" in combined
