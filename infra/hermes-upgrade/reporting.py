#!/usr/bin/env python3
"""Value-safe qualification report construction."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

EXPECTED_AGENTS = ("walter", "titus", "mitchel")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def build_report(candidate: dict[str, Any], mode: str, host_architecture: str, run_id: str) -> dict[str, Any]:
    identity = {
        "candidate_id": candidate.get("candidate_id", "unknown"),
        "upstream": candidate.get("upstream", {}),
        "derived": candidate.get("derived", {}),
        "policy": candidate.get("policy", {}),
    }
    return {
        "schema_version": 1,
        "run_id": run_id,
        "candidate_id": candidate.get("candidate_id", "unknown"),
        "candidate": identity,
        "mode": mode,
        "host_architecture": host_architecture,
        "started_at": _now(),
        "finished_at": None,
        "gates": [],
        "agents": [],
        "cleanup": {"status": "passed"},
        "overall_status": "not_run",
        "promotion": "blocked",
    }


def add_gate(report: dict[str, Any], name: str, status: str, reason_code: str) -> None:
    report["gates"].append({"name": name, "status": status, "reason_code": reason_code})


def finalize_report(report: dict[str, Any]) -> dict[str, Any]:
    agent_names = [item.get("agent") for item in report.get("agents", [])]
    if agent_names != list(EXPECTED_AGENTS):
        report["overall_status"] = "failed"
        report["promotion"] = "blocked"
        report["gates"].append(
            {"name": "agent_coverage", "status": "failed", "reason_code": "agent_coverage_incomplete"}
        )
    elif any(item.get("status") == "failed" for item in report["agents"]):
        report["overall_status"] = "failed"
    elif any(gate.get("status") == "failed" for gate in report["gates"]):
        report["overall_status"] = "failed"
    elif report.get("cleanup", {}).get("status") == "failed":
        report["overall_status"] = "failed"
    elif any(item.get("status") == "not_run" for item in report["agents"]):
        report["overall_status"] = "not_run"
    elif any(gate.get("status") == "not_run" for gate in report["gates"]):
        report["overall_status"] = "not_run"
    else:
        report["overall_status"] = "passed"

    runtime_profiles = next(
        (gate for gate in report["gates"] if gate.get("name") == "runtime_profiles"),
        None,
    )
    if (
        report["overall_status"] == "passed"
        and report["mode"] == "runtime"
        and runtime_profiles
        and runtime_profiles.get("status") == "passed"
    ):
        report["promotion"] = "eligible_for_aegis_staging"
    else:
        report["promotion"] = "blocked"
    report["finished_at"] = _now()
    return report


def write_report(report: dict[str, Any], destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return destination
