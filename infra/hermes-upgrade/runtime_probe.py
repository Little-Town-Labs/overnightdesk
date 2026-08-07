#!/usr/bin/env python3
"""Probe one candidate Hermes container without contacting a real provider."""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

SERVICE_BY_PREFIX = {
    "health": "health",
    "github": "github-guardian",
    "guardian": "guardian-intake",
    "mcp": "mcp",
    "dashboard": "dashboard-oidc",
    "channel": "teams",
    "trevor": "trevor-db",
    "browser": "browser",
    "prospect": "agiled",
}


def _request(service: str, operation: str) -> tuple[int, dict]:
    request = urllib.request.Request(
        f"http://hermes-stub-{service}:8080/v1/operation",
        data=json.dumps({"operation": operation}).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Hermes-Stub-Service": service},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read())
        finally:
            exc.close()


def _service(operation: str) -> str:
    return SERVICE_BY_PREFIX.get(operation.split(".", 1)[0], "health")


def main() -> int:
    agent = os.environ.get("HERMES_AGENT_NAME", "")
    if not agent:
        return 2
    if os.environ.get("HERMES_DELIVERY_MODE") != "disabled":
        return 3
    if os.environ.get("HERMES_APPROVALS_MODE") != "manual":
        return 4
    if os.environ.get("HERMES_APPROVALS_CRON_MODE") != "deny":
        return 5

    version = subprocess.run(
        ["/opt/hermes/.venv/bin/hermes", "--version"],
        capture_output=True,
        text=True,
        check=False,
    )
    if version.returncode != 0:
        return 6

    try:
        with urllib.request.urlopen("http://hermes-stub-health:8080/health", timeout=3) as response:
            health = json.loads(response.read())
        if health.get("status") != "ok" or health.get("delivery") != "disabled":
            return 7
    except (OSError, ValueError, json.JSONDecodeError):
        return 8

    allowed = [item for item in os.environ.get("HERMES_PROFILE_ALLOWED", "").split(",") if item]
    denied = [item for item in os.environ.get("HERMES_PROFILE_DENIED", "").split(",") if item]
    for operation in allowed:
        status, payload = _request(_service(operation), operation)
        if status != 200 or payload.get("status") != "ok" or payload.get("delivery") != "disabled":
            return 9
    for operation in denied:
        status, payload = _request(_service(operation), operation)
        if status != 403 or payload.get("delivery_attempted") is not False:
            return 10

    Path("/tmp/runtime-probe.json").write_text(
        json.dumps({"agent": agent, "status": "passed", "delivery": "disabled"}) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
