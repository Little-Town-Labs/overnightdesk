#!/usr/bin/env python3
"""Run the portable local Hermes qualification gate."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

from candidate import ValidationError, validate_candidate, validate_profiles, load_yaml
from reporting import add_gate, build_report, finalize_report, write_report
from stubs.server import exercise_profiles

SECRET_NAME_RE = re.compile(r"(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)$", re.IGNORECASE)
PRODUCTION_VALUE_RE = re.compile(
    r"(?:/run/phase|aegis-prod|\.overnightdesk\.com|graph\.microsoft\.com|"
    r"api\.telegram\.org|discord\.com/api|mcp\.agentmail\.to|matrix\.org)",
    re.IGNORECASE,
)
PLACEHOLDER_VALUES = {"test", "dummy", "example", "placeholder", "local-placeholder", "not-configured"}


def unsafe_environment_values(environment: dict[str, str]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for name, value in sorted(environment.items()):
        if not value:
            continue
        if PRODUCTION_VALUE_RE.search(value):
            findings.append({"name": name, "reason": "production_endpoint_or_secret_path"})
            continue
        if SECRET_NAME_RE.search(name) and value.lower() not in PLACEHOLDER_VALUES:
            findings.append({"name": name, "reason": "non_placeholder_secret"})
    return findings


def _runtime_smoke(
    image: str, expected_image_id: str, synthetic_state: Path
) -> tuple[str, str]:
    docker = shutil.which("docker")
    if not docker:
        return "not_run", "docker_unavailable"
    inspect = subprocess.run(
        [docker, "image", "inspect", image, "--format", "{{.Id}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    if inspect.returncode != 0:
        return "not_run", "candidate_image_unavailable"
    if inspect.stdout.strip() != expected_image_id:
        return "failed", "candidate_image_identity_mismatch"
    command = [
        docker,
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--volume",
        f"{synthetic_state}:/opt/data:rw",
        "--entrypoint",
        "/opt/hermes/.venv/bin/hermes",
        image,
        "--version",
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return "failed", "candidate_version_command_failed"
    return "passed", "candidate_version_verified"


def _runtime_profiles(
    root: Path,
    run_id: str,
    state_root: Path,
    candidate_image: str,
    profiles: dict[str, dict[str, Any]],
) -> tuple[str, str]:
    docker = shutil.which("docker")
    if not docker:
        return "not_run", "docker_unavailable"
    compose_file = root / "infra" / "hermes-upgrade" / "runtime-compose.yaml"
    env = dict(os.environ)
    env.update(
        {
            "HERMES_CANDIDATE_IMAGE": candidate_image,
            "HERMES_SYNTHETIC_STATE": str(state_root),
        }
    )
    compose = [docker, "compose", "-f", str(compose_file), "-p", run_id]
    version = subprocess.run(
        [docker, "compose", "version"], capture_output=True, text=True, check=False
    )
    if version.returncode != 0:
        return "not_run", "docker_compose_unavailable"
    config = subprocess.run(
        compose + ["config"], env=env, capture_output=True, text=True, check=False
    )
    if config.returncode != 0:
        return "failed", "runtime_compose_config_invalid"
    cleanup_needed = False
    try:
        cleanup_needed = True
        up = subprocess.run(
            compose + ["up", "-d", "stubs"],
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if up.returncode != 0:
            return "failed", "stub_service_start_failed"
        for agent in ("walter", "titus", "mitchel"):
            profile = profiles[agent]
            result = subprocess.run(
                compose
                + [
                    "run",
                    "--rm",
                    "--no-deps",
                    "-e",
                    f"HERMES_AGENT_NAME={agent}",
                    "-e",
                    f"HERMES_PROFILE_ALLOWED={','.join(profile['allowed_operations'])}",
                    "-e",
                    f"HERMES_PROFILE_DENIED={','.join(profile['denied_operations'])}",
                    agent,
                ],
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                return "failed", f"{agent}_runtime_start_failed"
    finally:
        if cleanup_needed:
            subprocess.run(
                compose + ["down", "--remove-orphans"],
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
    return "passed", "runtime_profiles_verified"


def _create_synthetic_state(run_dir: Path, profiles: dict[str, dict[str, Any]]) -> Path:
    state_root = run_dir / "synthetic-state"
    state_root.mkdir(parents=True, exist_ok=False)
    for agent, profile in profiles.items():
        agent_state = state_root / agent
        agent_state.mkdir()
        (agent_state / "state.json").write_text(
            json.dumps(
                {
                    "agent": agent,
                    "mode": profile["state"]["mode"],
                    "required_stubs": profile["required_stubs"],
                    "allowed_operations": profile["allowed_operations"],
                    "denied_operations": profile["denied_operations"],
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
    return state_root


def _cleanup_synthetic_state(state_root: Path | None) -> tuple[str, str]:
    if state_root is None:
        return "passed", "no_synthetic_state_created"
    try:
        shutil.rmtree(state_root)
    except OSError:
        return "failed", "synthetic_state_cleanup_failed"
    return "passed", "synthetic_state_removed"


def run(root: Path, candidate_path: Path, mode: str, report_path: Path | None = None) -> tuple[int, Path, dict[str, Any]]:
    run_id = f"hermes-local-{uuid.uuid4().hex[:12]}"
    candidate = validate_candidate(candidate_path)
    report = build_report(candidate, mode, platform.machine(), run_id)
    run_dir = Path(tempfile.mkdtemp(prefix=f"{run_id}-"))
    state_root: Path | None = None
    if report_path is None:
        report_path = run_dir / "qualification.json"

    unsafe = unsafe_environment_values(dict(os.environ))
    if unsafe:
        add_gate(report, "local_isolation", "failed", "unsafe_environment")
        report["agents"] = [
            {"agent": agent, "status": "not_run", "reason_code": "local_isolation_failed"}
            for agent in ("walter", "titus", "mitchel")
        ]
    else:
        add_gate(report, "local_isolation", "passed", "environment_safe")
        stubs = root / "infra" / "hermes-upgrade" / "stubs" / "services.yaml"
        try:
            profiles = validate_profiles(root, stubs)
        except (ValidationError, ValueError):
            add_gate(report, "profile_contracts", "failed", "profile_contract_invalid")
            report["agents"] = [
                {"agent": agent, "status": "failed", "reason_code": "profile_contract_invalid"}
                for agent in ("walter", "titus", "mitchel")
            ]
        else:
            add_gate(report, "profile_contracts", "passed", "profiles_and_stubs_verified")
            try:
                state_root = _create_synthetic_state(run_dir, profiles)
            except (OSError, TypeError, ValueError):
                add_gate(report, "synthetic_state", "failed", "synthetic_state_creation_failed")
                report["agents"] = [
                    {"agent": agent, "status": "failed", "reason_code": "synthetic_state_creation_failed"}
                    for agent in ("walter", "titus", "mitchel")
                ]
            else:
                add_gate(report, "synthetic_state", "passed", "synthetic_state_created")
                try:
                    stub_results = exercise_profiles(profiles)
                except (OSError, TypeError, ValueError):
                    add_gate(report, "stub_operations", "failed", "stub_operation_contract_failed")
                    stub_results = {
                        agent: ("failed", "stub_operation_contract_failed")
                        for agent in ("walter", "titus", "mitchel")
                    }
                else:
                    stub_status = "failed" if any(
                        status == "failed" for status, _ in stub_results.values()
                    ) else "passed"
                    add_gate(report, "stub_operations", stub_status, "stub_operations_verified")
                if mode == "source":
                    report["agents"] = [
                        {
                            "agent": agent,
                            "status": stub_results[agent][0],
                            "reason_code": stub_results[agent][1],
                        }
                        for agent in ("walter", "titus", "mitchel")
                    ]
                else:
                    status, reason = _runtime_smoke(
                        candidate["derived"]["reference"],
                        candidate["derived"]["image_id"],
                        state_root,
                    )
                    add_gate(report, "runtime_smoke", status, reason)
                    if status == "passed":
                        runtime_status, runtime_reason = _runtime_profiles(
                            root,
                            run_id,
                            state_root,
                            candidate["derived"]["reference"],
                            profiles,
                        )
                    elif status == "failed":
                        runtime_status, runtime_reason = "failed", "runtime_image_smoke_failed"
                    else:
                        runtime_status, runtime_reason = "not_run", "runtime_image_smoke_not_run"
                    if any(item[0] == "failed" for item in stub_results.values()):
                        runtime_status, runtime_reason = "failed", "stub_operation_contract_failed"
                    add_gate(report, "runtime_profiles", runtime_status, runtime_reason)
                    agent_status = runtime_status
                    agent_reason = runtime_reason
                    report["agents"] = [
                        {"agent": agent, "status": agent_status, "reason_code": agent_reason}
                        for agent in ("walter", "titus", "mitchel")
                    ]

    cleanup_status, cleanup_reason = _cleanup_synthetic_state(state_root)
    report["cleanup"] = {"status": cleanup_status, "reason_code": cleanup_reason}
    finalize_report(report)
    write_report(report, report_path)
    return (0 if report["overall_status"] == "passed" else 2), report_path, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--mode", choices=("source", "runtime"), default="source")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args(argv)
    root = Path(__file__).resolve().parents[2]
    try:
        code, report_path, report = run(root, args.candidate.resolve(), args.mode, args.report)
    except ValidationError as exc:
        print(f"qualification failed: {exc}", file=sys.stderr)
        return 2
    print(f"report={report_path}")
    print(f"status={report['overall_status']} promotion={report['promotion']}")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
