#!/usr/bin/env python3
"""Behavior tests for the Walter orchestrator-retirement reminder bundle."""

from __future__ import annotations

import json
import os
import stat
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / "infra/orchestrator-retirement/walter-orchestrator-retirement-reminder.sh"
SERVICE = ROOT / "infra/orchestrator-retirement/walter-orchestrator-retirement-reminder.service"
TIMER = ROOT / "infra/orchestrator-retirement/walter-orchestrator-retirement-reminder.timer"

PROTO_ROOT = "/home/ubuntu/overnightdesk-communicationmodule/proto"
PROTO_FILE = "dispatch/v1/dispatch.proto"
METHOD = "dispatch.v1.DispatchService/Dispatch"
DUE_AT = "2026-08-09 01:33:03 UTC"
SENTINEL_KEY = "sentinel-" + "reminder-key-that-must-not-leak"


def fake_grpcurl_script(directory: Path) -> Path:
    fake = directory / "fake-grpcurl"
    fake.write_text(
        """#!/usr/bin/env bash
set -Eeuo pipefail

printf '%s\\n' "$@" > "$FAKE_GRPCURL_ARGV_LOG"
case "$FAKE_GRPCURL_MODE" in
  authenticated-empty-request)
    printf 'ERROR:\\n  Code: InvalidArgument\\n  Message: title must not be empty\\n' >&2
    exit 1
    ;;
  unauthenticated)
    printf 'ERROR:\\n  Code: Unauthenticated\\n  Message: invalid or missing api key\\n' >&2
    exit 1
    ;;
  connection-failure)
    printf 'Failed to dial target host "127.0.0.1:9090": connection refused\\n' >&2
    exit 1
    ;;
  dispatch-success)
    printf 'fake transport argv: %s\\n' "$*" >&2
    printf '{"message_id":"fake-message-id"}\\n'
    exit 0
    ;;
  *)
    printf 'unknown fake grpcurl mode\\n' >&2
    exit 2
    ;;
esac
""",
        encoding="utf-8",
    )
    fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
    return fake


def run_client(
    fake: Path, mode: str, *arguments: str
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    with tempfile.TemporaryDirectory(prefix="walter-reminder-test-") as directory:
        argv_log = Path(directory) / "argv.log"
        result = subprocess.run(
            ["bash", str(CLIENT), *arguments],
            cwd=ROOT,
            env={
                **os.environ,
                "COMM_MODULE_API_KEY": SENTINEL_KEY,
                "FAKE_GRPCURL_MODE": mode,
                "FAKE_GRPCURL_ARGV_LOG": str(argv_log),
                "WALTER_REMINDER_TEST_GRPCURL": str(fake),
            },
            text=True,
            capture_output=True,
            check=False,
        )
        captured_argv = (
            argv_log.read_text(encoding="utf-8").splitlines()
            if argv_log.exists()
            else []
        )
    return result, captured_argv


def require_files() -> None:
    for path in (CLIENT, SERVICE, TIMER):
        assert path.is_file(), f"missing implementation file: {path.relative_to(ROOT)}"


def test_check_accepts_authenticated_empty_request_without_dispatch() -> None:
    with tempfile.TemporaryDirectory(prefix="walter-reminder-test-") as directory:
        fake = fake_grpcurl_script(Path(directory))
        result, argv = run_client(fake, "authenticated-empty-request", "--check")

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "reminder transport ready; no notification dispatched"
    assert "-d" in argv
    assert argv[argv.index("-d") + 1] == "{}"
    assert METHOD in argv
    assert SENTINEL_KEY not in "\n".join(argv)
    assert SENTINEL_KEY not in result.stdout + result.stderr


def test_check_rejects_unauthenticated_transport() -> None:
    with tempfile.TemporaryDirectory(prefix="walter-reminder-test-") as directory:
        fake = fake_grpcurl_script(Path(directory))
        result, _ = run_client(fake, "unauthenticated", "--check")

    assert result.returncode != 0
    assert (
        result.stdout + result.stderr
        == "reminder communication-module readiness check failed\n"
    )
    assert SENTINEL_KEY not in result.stdout + result.stderr


def test_check_rejects_connection_failure() -> None:
    with tempfile.TemporaryDirectory(prefix="walter-reminder-test-") as directory:
        fake = fake_grpcurl_script(Path(directory))
        result, _ = run_client(fake, "connection-failure", "--check")

    assert result.returncode != 0
    assert (
        result.stdout + result.stderr
        == "reminder communication-module readiness check failed\n"
    )
    assert SENTINEL_KEY not in result.stdout + result.stderr


def test_dispatch_success_uses_fixed_telegram_payload_and_hides_key() -> None:
    with tempfile.TemporaryDirectory(prefix="walter-reminder-test-") as directory:
        fake = fake_grpcurl_script(Path(directory))
        result, argv = run_client(fake, "dispatch-success", "--dispatch")

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "reminder dispatched through communication module"
    assert SENTINEL_KEY not in "\n".join(argv)
    assert SENTINEL_KEY not in result.stdout + result.stderr
    assert argv[argv.index("-expand-headers") + 1] == "-H"
    assert argv[argv.index("-H") + 1] == "x-api-key: ${COMM_MODULE_API_KEY}"
    assert argv[argv.index("-import-path") + 1] == PROTO_ROOT
    assert argv[argv.index("-proto") + 1] == PROTO_FILE

    payload = json.loads(argv[argv.index("-d") + 1])
    assert payload == {
        "title": "Orchestrator retirement observation window ended",
        "summary": (
            "The observation window ended; cleanup remains unapproved pending "
            "explicit owner approval."
        ),
        "body": [
            "The observation window ended at 2026-08-09T01:33:03Z.",
            "Retained orchestrator state and rollback evidence remain in place.",
            "Cleanup remains unapproved pending explicit owner approval.",
        ],
        "severity": "SEVERITY_INFO",
        "channels": "CHANNELS_TELEGRAM",
    }


def test_missing_key_is_secret_safe() -> None:
    with tempfile.TemporaryDirectory(prefix="walter-reminder-test-") as directory:
        fake = fake_grpcurl_script(Path(directory))
        result = subprocess.run(
            ["bash", str(CLIENT), "--dispatch"],
            cwd=ROOT,
            env={
                **os.environ,
                "COMM_MODULE_API_KEY": "",
                "WALTER_REMINDER_TEST_GRPCURL": str(fake),
            },
            text=True,
            capture_output=True,
            check=False,
        )

    assert result.returncode != 0
    assert (
        result.stdout + result.stderr
        == "reminder runtime credentials are unavailable\n"
    )
    assert SENTINEL_KEY not in result.stdout + result.stderr


def test_client_keeps_fixed_production_grpcurl_default() -> None:
    source = CLIENT.read_text(encoding="utf-8")

    assert 'readonly GRPCURL="/usr/local/bin/grpcurl"' in source
    assert "WALTER_REMINDER_TEST_GRPCURL" in source


def test_service_loads_restart_persistent_secret_before_dropping_user() -> None:
    source = SERVICE.read_text(encoding="utf-8")

    assert (
        "EnvironmentFile=/etc/overnightdesk/"
        "walter-orchestrator-retirement-reminder.env" in source
    )
    assert "/opt/overnightdesk/overnightdesk-ops.env" not in source
    assert "PassEnvironment=COMM_MODULE_API_KEY" not in source
    assert "User=ubuntu" in source
    assert "Group=ubuntu" in source
    assert "Type=oneshot" in source
    assert "Restart=no" in source
    assert ("COMM_MODULE_API_KEY" + "=") not in source


def test_timer_is_exact_persistent_one_shot() -> None:
    source = TIMER.read_text(encoding="utf-8")

    assert f"OnCalendar={DUE_AT}" in source
    assert "Persistent=true" in source
    assert "AccuracySec=1s" in source
    assert "Unit=walter-orchestrator-retirement-reminder.service" in source
    assert "WantedBy=timers.target" in source
    assert "OnCalendar=*-*-*" not in source
    assert "OnBootSec=" not in source
    assert "OnUnitActiveSec=" not in source


def main() -> None:
    require_files()
    tests = (
        test_check_accepts_authenticated_empty_request_without_dispatch,
        test_check_rejects_unauthenticated_transport,
        test_check_rejects_connection_failure,
        test_dispatch_success_uses_fixed_telegram_payload_and_hides_key,
        test_missing_key_is_secret_safe,
        test_client_keeps_fixed_production_grpcurl_default,
        test_service_loads_restart_persistent_secret_before_dropping_user,
        test_timer_is_exact_persistent_one_shot,
    )
    for test in tests:
        test()
    print(f"PASS: {len(tests)} Walter reminder behavior tests")


if __name__ == "__main__":
    main()
