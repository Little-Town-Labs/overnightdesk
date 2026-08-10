# Quickstart: Retired Orchestrator Cleanup

## Source checks

Run from the cleanup worktree:

```bash
./scripts/qualify-orchestrator-retirement.sh
bash -n scripts/qualify-orchestrator-retirement.sh
```

Validate the cleanup spec artifacts, YAML, Markdown, and the source diff before
production mutation.

## Production preflight

On Aegis, record secret-safe output for:

1. UTC time and the observation end timestamp.
2. Protected evidence checksum verification.
3. Exact target container state, restart policy, image, mounts, and networks.
4. Exclusive volume references and image consumers.
5. Reminder timer last trigger and next activation.
6. Walter scheduler identity/enabled-state comparison.
7. Named runtime and ingress health.

## Cleanup

Use one bounded, exact-target operation sequence following
[cleanup-contract.md](contracts/cleanup-contract.md). Do not use Compose
`down`, `docker system prune`, broad globs, or runtime restarts.

## Post-cleanup verification

Prove:

- all exact target containers and volumes are absent;
- no active container has Docker socket access;
- target images and retirement-only tags have no remaining references;
- the timer, service, dedicated env, stale runtime paths, and retired heartbeat
  are absent;
- named workloads and unrelated Walter schedules are unchanged;
- the retired hostname remains HTTP 404 and TLS handshake-rejected;
- static Ops incident search still exposes exactly three records;
- the platform-standard closeout and deployment ledger entries exist.
