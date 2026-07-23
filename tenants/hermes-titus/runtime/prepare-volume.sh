#!/usr/bin/env bash
set -euo pipefail

image=${TITUS_IMAGE:-overnightdesk/hermes-agent:0.18.0-coder}
volume=${TITUS_VOLUME:-hermes-titus-data}
source_root=${TITUS_SOURCE_ROOT:-/opt/hermes-titus/source}

test "$(id -u)" -eq 0 || { printf 'hermes-titus volume preparation must run as root\n' >&2; exit 1; }
test -d "$source_root" || { printf 'hermes-titus source is unavailable\n' >&2; exit 1; }
if test "$(docker inspect -f '{{.State.Running}}' hermes-titus 2>/dev/null || true)" = true; then
  printf 'hermes-titus volume preparation refused while the gateway is running\n' >&2
  exit 1
fi

docker volume inspect "$volume" >/dev/null 2>&1 || docker volume create "$volume" >/dev/null

docker run --rm \
  --user 0:0 \
  --network bridge \
  --volume "$volume:/opt/data" \
  --volume "$source_root:/source:ro" \
  --entrypoint /usr/bin/bash \
  "$image" -euo pipefail -c '
    install -d -m 0755 /opt/data/bin /opt/data/config /opt/data/skills /opt/data/plugins
    install -m 0755 /source/runtime/start-all.sh /opt/data/bin/start-all.sh
    install -m 0755 /source/runtime/start-all.loopback.sh /opt/data/bin/start-all.loopback.sh
    install -m 0755 /source/runtime/start-with-secrets.sh /opt/data/bin/start-with-secrets.sh
    install -m 0755 /source/runtime/control-tower-session.sh /opt/data/bin/control-tower-session
    install -m 0755 /source/runtime/email-run-approval.sh /opt/data/bin/hermes-email-run-approval
    rm -f /opt/data/bin/agentmail_poller.py /opt/data/bin/agentmail_policy.py \
      /opt/data/bin/agentmail_transport.py /opt/data/bin/agentmail-poller-health.sh
    install -m 0644 /source/config/config.yaml /opt/data/config.yaml
    install -m 0644 /source/config/tdai-gateway.yaml /opt/data/config/tdai-gateway.yaml
    install -m 0644 /source/config/SOUL.md /opt/data/SOUL.md
    cp -a /source/skills/. /opt/data/skills/

    memory_root=/opt/data/.memory-tencentdb/tdai-memory-openclaw-plugin
    if ! test -f "$memory_root/.overnightdesk-version-0.3.6"; then
      install -d -m 0755 "$memory_root"
      find "$memory_root" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
      cd "$memory_root"
      archive=$(npm pack @tencentdb-agent-memory/memory-tencentdb@0.3.6 --silent)
      tar -xzf "$archive" --strip-components=1
      rm -f "$archive"
      npm pkg delete scripts.postinstall
      npm install --omit=dev
      touch .overnightdesk-version-0.3.6
    fi

    provider_source="$memory_root/hermes-plugin/memory/memory_tencentdb"
    test -f "$provider_source/__init__.py"
    install -d -m 0755 /opt/data/plugins/memory_tencentdb
    find /opt/data/plugins/memory_tencentdb -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    cp -a "$provider_source"/. /opt/data/plugins/memory_tencentdb/

    if ! test -f /opt/data/python-packages/.overnightdesk-teams-2.0.13.4; then
      install -d -m 0755 /opt/data/python-packages
      uv pip install --python /opt/hermes/.venv/bin/python --target /opt/data/python-packages \
        microsoft-teams-apps==2.0.13.4 aiohttp==3.14.1
      touch /opt/data/python-packages/.overnightdesk-teams-2.0.13.4
    fi

    node_version=$(node -p "process.versions.node")
    node -e "const [a,b]=process.versions.node.split(\".\").map(Number); if (a < 22 || (a === 22 && b < 16)) process.exit(1)"
    cd "$memory_root"
    node -e "Promise.all([import(\"sqlite-vec\"), import(\"tsx\")]).catch(() => process.exit(1))"
    PYTHONPATH=/opt/data/python-packages:/opt/hermes /opt/hermes/.venv/bin/python -c "import aiohttp, microsoft_teams"

    install -d -m 0750 /opt/data/memory-tencentdb/data /opt/data/logs/memory_tencentdb
    chown -R 10000:10000 /opt/data
    printf "hermes-titus volume: dependencies ready (node=%s)\n" "$node_version"
  '
