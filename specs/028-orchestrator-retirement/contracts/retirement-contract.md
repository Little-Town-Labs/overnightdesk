# Contract: Aegis Orchestrator Retirement

## Activation prerequisites

Activation is allowed only when:

1. tenant, route, operator, audit, idempotency, and token-revocation inventories
   are captured;
2. current callers and scheduled/systemd dependencies are confirmed absent or
   migrated;
3. all incident rows are exported and match the source count;
4. a restorable database dump and checksums exist;
5. active Compose, Nginx, image, volume, and restart-policy evidence exists;
6. Ops runs without orchestrator database or Flight Recorder configuration;
7. source qualification and affected repository tests pass;
8. named runtime and communication health is green.

## Active-state contract

After activation:

- `orchestrator.overnightdesk.com` returns a detail-free denial and does not
  proxy upstream;
- `overnightdesk-platform-orchestrator`,
  `overnightdesk-docker-socket-proxy`, and
  `overnightdesk-platform-orchestrator-db` are stopped with restart policy
  `no`;
- no running container mounts `/var/run/docker.sock`;
- no running container can reach a Docker socket proxy;
- Ops exposes no platform Flight Recorder tools and opens no orchestrator
  database pool;
- static incident search returns the three preserved records;
- Walter, Titus, Mitchel, communications, authentication, Open WebUI, Ops,
  audits, backup transfer, SSH, and Tailscale remain healthy.

## Rollback contract

Rollback requires explicit owner approval and must:

1. restore the prior Nginx vhost and validate Nginx before reload;
2. restore the source/live Compose configuration;
3. restore the three prior restart policies;
4. start the database and wait for `pg_isready`;
5. start the socket proxy, then the orchestrator;
6. verify the private health/API contract before restoring public routing;
7. restore Ops dependency configuration only if the orchestrator is again an
   approved active capability;
8. log the rollback and its verification.

Rollback must not recreate or delete named business-runtime data.

## Cleanup contract

The observation window is 14 days. Ending the window authorizes review, not
deletion. Removing containers, images, volumes, database state, secret paths,
or rollback evidence requires a separate explicit approval and fresh backup
verification.
