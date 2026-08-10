# Quickstart: Qualify and Activate Orchestrator Retirement

## Source qualification

```bash
SPECIFY_FEATURE=028-orchestrator-retirement \
  .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
./scripts/qualify-orchestrator-retirement.sh
```

Run the scoped test suites in `overnightdesk-ops` and
`overnightdesk-operations-audit`, then render the production Compose file with
`docker compose config --quiet`.

## Production preflight

Use the Aegis retirement runbook in the platform standard. Confirm current
callers and record counts, export the incidents, capture a database dump and
checksums, preserve configuration and restart policies, and verify all named
workloads before changing ingress or containers.

## Activation

1. Deploy the updated platform standard and Ops service.
2. Verify incident search from static knowledge.
3. Install the explicit Nginx denial vhost and reload only after `nginx -t`.
4. Set restart policy `no` on the orchestrator, proxy, and database.
5. Stop orchestrator, proxy, then database without removing anything.
6. Run all negative reachability and dependent health checks.
7. Append the result to `deploys.log`.

## Observation

Through `2026-08-09T01:33:03Z`, verify the three containers remain stopped and
restart-disabled, the retired hostname remains denied, no Docker socket access
returns, and named business workloads remain healthy. Walter owned the
owner-facing reminder through the communication module. The separate cleanup
feature is `specs/038-orchestrator-cleanup`.

### Corrective heartbeat reconciliation

The retired Flight Recorder heartbeat is not an observation reminder. Preserve
its script and credential references for rollback, but keep Walter job
`eb193b734d68` paused while the orchestrator is intentionally stopped.

The versioned `walter-orchestrator-retirement-reminder.timer` delivered the
observation-end notification. Its timer, service, environment, and retired
heartbeat are removed by the separately approved cleanup feature after the
due-time and final health checks pass.
