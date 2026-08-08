#!/usr/bin/env bash
set -euo pipefail

name=hermes-titus
image=${TITUS_IMAGE:-overnightdesk/hermes-agent:0.19.0-coder}
github_env_file=${TITUS_GITHUB_ENV_FILE:-/run/hermes-titus/github-app.env}
github_manager_key_file=${TITUS_GITHUB_REPOSITORY_MANAGER_PRIVATE_KEY_FILE:-/run/hermes-titus/github-repository-manager-app-private-key}

test -r "$github_env_file" || {
  printf '%s is unavailable\n' "$github_env_file" >&2
  exit 1
}

if docker container inspect "$name" >/dev/null 2>&1; then
  running=$(docker inspect -f '{{.State.Running}}' "$name")
  test "$running" = false || { printf '%s is already running\n' "$name" >&2; exit 1; }
  docker rm "$name" >/dev/null
fi

exec docker run --rm \
  --name "$name" \
  --hostname hermes-titus \
  --user 10000:10000 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m \
  --network overnightdesk_overnightdesk \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 512 \
  --cpus 1 \
  --memory 2g \
  --health-cmd '/opt/hermes/.venv/bin/python -c "import urllib.request; [urllib.request.urlopen(u, timeout=2).read() for u in (\"http://127.0.0.1:9119/api/status\", \"http://127.0.0.1:8420/health\", \"http://127.0.0.1:8642/health\")]"' \
  --health-interval 30s \
  --health-timeout 5s \
  --health-retries 3 \
  --health-start-period 90s \
  --volume hermes-titus-data:/opt/data \
  --volume titus-project-knowledge-data:/opt/data/project-briefs \
  --volume /run/hermes-titus/runtime.env:/run/secrets/hermes-titus-runtime:ro \
  --volume /run/hermes-titus/github-app-private-key:/run/secrets/hermes-titus-github-app-private-key:ro \
  --volume "$github_manager_key_file:/run/secrets/hermes-titus-github-repository-manager-app-private-key:ro" \
  --env-file "$github_env_file" \
  --entrypoint /usr/bin/bash \
  "$image" /opt/data/bin/start-with-secrets.sh
