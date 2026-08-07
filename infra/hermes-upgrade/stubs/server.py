#!/usr/bin/env python3
"""Deterministic, non-forwarding HTTP stubs for local Hermes qualification."""

from __future__ import annotations

import argparse
import json
import re
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

ALLOWED_FIXTURES = {
    "health.read": "healthy",
    "github.read": "github-read-only",
    "guardian.task_intake.validate": "guardian-intake-validated",
    "mcp.registry.verify": "mcp-registry-valid",
    "dashboard.auth.verify": "dashboard-auth-required",
    "channel.route.evaluate": "delivery-disabled",
    "trevor.read": "trevor-synthetic-record",
    "browser.fixture.read": "browser-synthetic-page",
    "prospect.draft": "prospect-draft-only",
}
DENIED_OPERATION_RE = re.compile(r"(?:\.send|\.mutate|\.deploy)$|^outbound\.send$")
OPERATION_SERVICES = {
    "health": "health",
    "github": "github_guardian",
    "guardian": "guardian_intake",
    "mcp": "mcp",
    "dashboard": "dashboard_oidc",
    "channel": "teams",
    "trevor": "trevor_db",
    "browser": "browser",
    "prospect": "agiled",
}


def service_for_operation(operation: str) -> str:
    return OPERATION_SERVICES.get(operation.split(".", 1)[0], "health")


class StubHandler(BaseHTTPRequestHandler):
    server_version = "HermesLocalStub/1"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        # Qualification output must not contain request data or fixture content.
        return

    def _send(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self._send(404, {"status": "not_found"})
            return
        self._send(
            200,
            {
                "status": "ok",
                "service": self.headers.get("X-Hermes-Stub-Service", "health"),
                "delivery": "disabled",
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/operation":
            self._send(404, {"status": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or length > 65536:
                raise ValueError
            payload = json.loads(self.rfile.read(length))
            operation = payload.get("operation") if isinstance(payload, dict) else None
            if not isinstance(operation, str) or not operation:
                raise ValueError
        except (ValueError, TypeError, json.JSONDecodeError):
            self._send(400, {"status": "invalid_request"})
            return

        if DENIED_OPERATION_RE.search(operation):
            self._send(
                403,
                {
                    "status": "denied",
                    "reason": "operation_denied",
                    "delivery_attempted": False,
                },
            )
            return
        fixture = ALLOWED_FIXTURES.get(operation)
        if fixture is None:
            self._send(404, {"status": "not_allowlisted"})
            return
        self._send(
            200,
            {
                "status": "ok",
                "operation": operation,
                "fixture": fixture,
                "service": self.headers.get("X-Hermes-Stub-Service", service_for_operation(operation)),
                "delivery": "disabled",
            },
        )


def create_server(host: str = "127.0.0.1", port: int = 0) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), StubHandler)


def _request(server: ThreadingHTTPServer, operation: str) -> tuple[int, dict[str, Any]]:
    url = f"http://127.0.0.1:{server.server_port}/v1/operation"
    request = urllib.request.Request(
        url,
        data=json.dumps({"operation": operation}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=2) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read())
        finally:
            exc.close()


def exercise_profiles(profiles: dict[str, dict[str, Any]]) -> dict[str, tuple[str, str]]:
    """Exercise every profile's allowed and denied operation contract locally."""

    server = create_server()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    results: dict[str, tuple[str, str]] = {}
    try:
        for agent, profile in profiles.items():
            failed = False
            for operation in profile["allowed_operations"]:
                status, payload = _request(server, operation)
                if status != 200 or payload.get("status") != "ok" or payload.get("delivery") != "disabled":
                    failed = True
                    break
            if not failed:
                for operation in profile["denied_operations"]:
                    status, payload = _request(server, operation)
                    if status != 403 or payload.get("delivery_attempted") is not False:
                        failed = True
                        break
            results[agent] = (
                ("failed", "stub_operation_contract_failed")
                if failed
                else ("passed", "stub_operations_verified")
            )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    create_server(args.host, args.port).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
