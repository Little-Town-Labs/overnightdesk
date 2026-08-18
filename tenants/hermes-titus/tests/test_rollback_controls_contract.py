"""Contract tests for Titus's explicit, fail-closed rollback controls."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).parents[1]
DEPLOY = ROOT / "scripts" / "deploy-aegis.sh"
README = ROOT / "README.md"


def _function(source: str, name: str) -> str:
    start = source.index(f"{name}() {{")
    end = source.index("\n}\n", start) + 3
    return source[start:end]


def test_email_controls_are_explicit_and_distinct_from_dashboard_rollback() -> None:
    source = DEPLOY.read_text(encoding="utf-8")

    assert "rollback-email" in source
    assert "restore-email" in source
    assert "rollback|rollback-dashboard) rollback_runtime" in source
    assert "TITUS_GUARDED_EMAIL_ROLLBACK_CONFIRM" in source


def test_email_rollback_installs_marker_before_restart_and_verifies() -> None:
    source = DEPLOY.read_text(encoding="utf-8")
    rollback = _function(source, "rollback_email")

    assert rollback.index("install -o root -g root -m 0400") < rollback.index(
        "systemctl restart hermes-titus.service"
    )
    assert rollback.count("verify") == 1
    assert "ROLLBACK_TITUS_GUARDED_EMAIL_TO_READ_ONLY" in rollback


def test_email_restore_keeps_read_only_until_guarded_restart_succeeds() -> None:
    source = DEPLOY.read_text(encoding="utf-8")
    restore = _function(source, "restore_email")
    marker_remove = restore.index('rm -f "$marker"')
    guarded_restart = restore.index("if ! sudo systemctl restart hermes-titus.service")

    assert restore.index("systemctl restart hermes-titus.service") < marker_remove
    assert marker_remove < guarded_restart
    assert "install -o root -g root -m 0400 /dev/null \"$marker\"" in restore
    assert "RESTORE_TITUS_GUARDED_EMAIL" in restore


def test_operator_docs_name_the_two_email_transitions() -> None:
    docs = README.read_text(encoding="utf-8")

    assert "rollback-email" in docs
    assert "restore-email" in docs
    assert "dashboard rollback" in docs
