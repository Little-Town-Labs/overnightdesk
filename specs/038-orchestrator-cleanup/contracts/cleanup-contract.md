# Contract: Retired Orchestrator Cleanup

## Preconditions

Cleanup is allowed only when all of the following pass:

1. The current UTC time is after `2026-08-09T01:33:03Z`.
2. The protected evidence bundle exists and its checksum manifest passes.
3. The custom-format database dump exists and is included in the verified
   evidence set.
4. Each target container exists, is exited, and has restart policy `no`.
5. Each target volume is referenced only by its matching target container.
6. Each target image has no active container consumer.
7. The reminder timer has fired and has no future activation.
8. Unrelated Walter scheduler identities and enabled states match the protected
   pre-change scheduler evidence.

## Exact deletion set

- Containers: `overnightdesk-platform-orchestrator`,
  `overnightdesk-docker-socket-proxy`,
  `overnightdesk-platform-orchestrator-db`.
- Volumes: `overnightdesk_orchestrator-fr-snapshots`,
  `overnightdesk_platform-orchestrator-db-data`.
- Images: the retired orchestrator image, socket-proxy image,
  `postgres:16-alpine` only if unreferenced, and the four retirement-only Ops
  and operations-audit tags.
- Host units: `walter-orchestrator-retirement-reminder.timer` and
  `.service`, plus their dedicated environment file.
- Runtime files: the retired runtime directory, launcher, health record, log,
  and pre-retirement Compose copy.
- Evidence: the protected retirement evidence directories after the closeout
  record is durable.

## Retained set

- The live and source `orchestrator-retired` Nginx denial boundary.
- The platform incident catalog and static Ops search.
- All active named runtimes, databases, ingress, communication, security,
  backup, SSH, and Tailscale services.
- Feature 028 history and Feature 038 cleanup records.

## Cleanup order

1. Write the secret-free closeout intent and capture final pre-cleanup hashes.
2. Re-run all preconditions immediately before mutation.
3. Remove the reminder units/env and retired heartbeat artifacts.
4. Remove exact containers, then exact exclusive volumes.
5. Remove exact unreferenced images and retirement-only tags.
6. Remove stale runtime files, never the deny vhost.
7. Verify active workloads, denial behavior, incident count, and absence of
   target resources.
8. Remove the consumed protected evidence bundle only after steps 1–7 pass.
9. Write the final secret-free deployment ledger entry.

## Abort behavior

Any failed precondition aborts before mutation. A failure after mutation must
stop immediately, report the exact completed subset, and must not restart or
alter unrelated services. No broad `docker system prune`, Compose `down`,
wildcard deletion, or source publication is allowed.
