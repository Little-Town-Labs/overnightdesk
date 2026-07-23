from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import yaml  # type: ignore[import-untyped]

GUARDED_SERVER = "guarded_agentmail"
HOSTED_SERVER = "agentmail"


def apply_email_mode(mode: str, path: Path) -> None:
    config = yaml.safe_load(path.read_text()) or {}
    servers = config.get("mcp_servers")
    if not isinstance(servers, dict) or HOSTED_SERVER not in servers:
        raise ValueError("hosted AgentMail configuration is unavailable")
    if mode == "guarded":
        if GUARDED_SERVER not in servers:
            raise ValueError("guarded AgentMail configuration is unavailable")
    elif mode == "read_only":
        servers.pop(GUARDED_SERVER, None)
    else:
        raise ValueError("guarded email mode is invalid")

    original_mode = path.stat().st_mode & 0o777
    with tempfile.NamedTemporaryFile(
        mode="w",
        dir=path.parent,
        prefix=".config.yaml.",
        delete=False,
    ) as handle:
        yaml.safe_dump(config, handle, sort_keys=False)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    temporary.chmod(original_mode)
    os.replace(temporary, path)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: apply-email-mode.py {guarded|read_only} CONFIG")
    apply_email_mode(sys.argv[1], Path(sys.argv[2]))


if __name__ == "__main__":
    main()
