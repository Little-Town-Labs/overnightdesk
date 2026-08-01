# Quickstart: Titus Meeting Artifact Discovery

## Local qualification

From the feature worktree:

```bash
cd tenants/hermes-titus/meeting-processor
go test ./...
go vet ./...
scripts/qualify.sh
```

The qualification must prove exact configuration rejection, metadata-only Graph
response handling, URL allowlisting, bounded retries, cursor completion,
restart idempotency, safe structured output, atomic state, and no content route.

## Build qualification

```bash
docker build --platform linux/arm64 \
  -t overnightdesk/titus-meeting-processor:feature-033 \
  tenants/hermes-titus/meeting-processor
```

Inspect the image and test container before any deployment. It must run as UID
10003, expose no port, require no shell at runtime, and contain no credential,
organizer, join URL, cursor, or artifact value.

Local evidence on 2026-08-01:

- `go test ./...`, `go test -race ./...`, `go vet ./...`, and the static Go
  build passed.
- All Python Phase-projection and security contracts passed.
- All shell files parsed successfully and source/leak gates passed.
- `CONTAINER_CLI=podman scripts/qualify.sh` built the Docker-format ARM64 image
  and verified UID/GID `10003:10003`, no exposed ports, the safe healthcheck,
  and no Graph/Phase/Teams secret environment.
- After the Sol review re-scope, the same complete gate passed again with the
  8 MiB/2,500-artifact per-stream limit, 10,000-artifact/32 MiB retained-string
  limit, 64 MiB encoded-state limit, incremental atomic state serialization,
  and four-stream prior-state-preservation regressions.
- After T046, the complete gate passed with seven Python contracts and verified
  that every release is root-owned, nonwritable, regular-file-only, and
  content-rehashed before Docker build or source-link selection.
- T047 replaced that static proof with five behavioral release-tree tests. The
  complete suite now has 12 Python contracts. Its unsupported-entry test uses
  an expected-owner, nonwritable FIFO and fails when only the type predicate is
  removed, while production validation rejects the same tree without changing
  deployment handles, retained state, or the build marker.
- No production service, Phase value, Graph content endpoint, or remote branch
  was changed by local qualification.

Post-change graph evidence:

- The Feature 033 worktree was indexed at moderate depth with 11,795 nodes and
  20,388 edges.
- Graph search resolved the new CLI `runOnce`, worker `RunOnce`, Graph
  `FetchDelta`, URL validators, state store, handoff, health, and exact Phase
  loader path.
- Call tracing confirmed the intended CLI → worker → constrained Graph client →
  state/handoff/health chain. Depth-3 results also contained unrelated
  same-name functions elsewhere in the repository; targeted `rg` and source
  reads proved those were symbol-name collision artifacts, not callers or
  dependencies.
- `detect_changes` reported the tracked README/config/roadmap surface but did
  not enumerate untracked new worker files; graph search plus `git status` and
  direct reads were therefore used as the authoritative complete change set.

## Production lifecycle (not authorized by source implementation alone)

```bash
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh prepare
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh install-disabled
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh initialize
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh verify-disabled
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh enable
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh verify
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh restart-verify
tenants/hermes-titus/meeting-processor/scripts/deploy-aegis.sh rollback
```

Required production evidence:

1. Phase projection succeeds without printing values.
2. Docker inspect contains no Phase or Graph secret/config value.
3. No public or host port exists.
4. All four organizer/type streams report success and cursor presence.
5. The Gary pilot produces one transcript and one recording discovery; Austin
   succeeds with zero artifacts until he conducts a pilot meeting.
6. Restart produces zero duplicate discoveries.
7. No content endpoint is called under normal, retry, restart, or error tests.
8. Rollback stops only the meeting processor and retains its state volume.
9. Titus, its interactive Teams bot state, and unrelated services remain
   unchanged and healthy.
10. The result is appended to the suite deployment ledger.

## Failure handling

- `transcripts_disabled`, `forbidden`, `payment_required`, invalid state, or an
  invalid continuation link stops that stream without advancing its cursor.
- `throttled` and temporary provider failures retry only within the documented
  bound.
- Any secret or protected identifier in output is a release blocker.
- Do not reset or delete the state volume during recovery. Preserve it for
  inspection and use the reviewed rollback.

## Separate platform-standard synchronization plan

After this repository change is reviewed, update the sibling
`overnightdesk-platform-standard` repository in its own branch/worktree. The
exact affected contracts are:

1. `WHAT/services.yaml`: add the independently managed
   `titus-meeting-processor` service, image/container/unit/volume names,
   internal-only network, fixed resource bounds, disabled-first lifecycle, and
   state-preserving rollback.
2. `WHAT/secrets.yaml`: add `/agents/hermes-titus/teamsmeetings`, enumerate the
   exact nine source keys, classify meeting credentials/organizers/webhook
   state/join input, and record the six-field root projection with no Phase
   token in the container.
3. `WHAT/phase-app-migration.yaml`: add the canonical meeting path to Titus's
   approved Phase consumer boundary without merging it with `/teams`.
4. `HOW/architecture.md`: record the separate deterministic delta worker, four
   streams, private atomic state, metadata-only handoff, and the absence of a
   Hermes Graph tool, webhook, subscription, or content client.
5. `HOW/deployment.md` and `docs/runbooks/deploy.md`: add disabled install,
   initialize, enable, safe canaries, restart/idempotency, disable, rollback,
   and deployment-ledger evidence.
6. `HOW/secrets.md`: document root-only exact-key validation, 0440 runtime
   projection, protected state, and value-safe operator verification.

Do not describe the worker as production-active in the standard until the
disabled install and separately authorized enable/canary have passed on Aegis.
