#!/usr/bin/env python3
"""Produce a narrowly patched Titus dashboard config with the Teams webhook."""

from __future__ import annotations

import sys
from pathlib import Path


ANCHOR = "    location = /auth-verify {\n"
LOCATION = """    # Microsoft Bot Framework authenticates this webhook with its own bearer
    # token. Keep it outside the dashboard auth_request boundary.
    location = /api/messages {
        proxy_pass http://hermes-titus:3978;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        client_max_body_size 2m;
    }

"""


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: patch-titus-teams-route.py INPUT OUTPUT", file=sys.stderr)
        return 2
    source = Path(sys.argv[1]).read_text(encoding="utf-8")
    if "location = /api/messages" in source:
        print("Teams route already present", file=sys.stderr)
        return 1
    if ANCHOR not in source or "auth_request /auth-verify;" not in source:
        print("dashboard config does not match the expected safe patch boundary", file=sys.stderr)
        return 1
    patched = source.replace(ANCHOR, LOCATION + ANCHOR, 1)
    Path(sys.argv[2]).write_text(patched, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
