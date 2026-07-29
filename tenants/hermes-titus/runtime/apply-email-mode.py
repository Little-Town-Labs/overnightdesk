from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import yaml  # type: ignore[import-untyped]

GUARDED_SERVER = "guarded_agentmail"
HOSTED_SERVER = "agentmail"
LINEAR_SERVER = "linear"
LINEAR_URL = "https://mcp.linear.app/mcp/readonly"
LINEAR_TOOLS = {"resources": False, "prompts": False}


def atomic_write(config: dict[str, object], path: Path) -> None:
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

    atomic_write(config, path)


def apply_linear_state(
    state: str,
    path: Path,
    *,
    api_key: str | None = None,
) -> None:
    if state not in {"disabled", "ready"}:
        raise ValueError("Linear state is invalid")
    if state == "ready" and (
        not api_key or api_key.strip() != api_key or api_key == "NOT_CONFIGURED"
    ):
        raise ValueError("Linear API key is unavailable")

    config = yaml.safe_load(path.read_text()) or {}
    servers = config.get("mcp_servers")
    if not isinstance(servers, dict) or LINEAR_SERVER not in servers:
        raise ValueError("Linear MCP configuration is unavailable")

    linear: dict[str, object] = {
        "url": LINEAR_URL,
        "enabled": state == "ready",
        "tools": dict(LINEAR_TOOLS),
    }
    if state == "ready":
        linear["headers"] = {"Authorization": "Bearer ${LINEAR_API_KEY}"}
    servers[LINEAR_SERVER] = linear
    atomic_write(config, path)


def main() -> None:
    if len(sys.argv) == 3:
        apply_email_mode(sys.argv[1], Path(sys.argv[2]))
        return
    if len(sys.argv) == 4 and sys.argv[1] == "linear":
        apply_linear_state(
            sys.argv[2],
            Path(sys.argv[3]),
            api_key=os.environ.get("LINEAR_API_KEY"),
        )
        return
    raise SystemExit(
        "usage: apply-email-mode.py {guarded|read_only} CONFIG | "
        "linear {disabled|ready} CONFIG"
    )


if __name__ == "__main__":
    main()
