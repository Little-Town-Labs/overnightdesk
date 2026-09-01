# Buzz Private Pilot on Aegis

## Current Status

Research is **closed without deployment** as of 2026-09-01. This runbook is a
historical artifact and MUST NOT be executed. Issue #249 was closed as not
planned. No components were installed and no secrets, identities, routes,
tailnet policy, registry artifacts, or Aegis state were created. It is retained
only as evidence of the evaluated design. Execution requires a new owner
approval, reactivated specification, current revalidation, and a newly approved
ingress architecture.

This runbook defines the frozen target. Commands after `qualify-local` require
the distinct approval named in their gate. Use synthetic content only. Never
copy private keys, service secrets, authorization headers, cookies, message
bodies, prompts, model output, or attachments into evidence.

## Frozen Workload Boundary

| Item | Value |
| --- | --- |
| Workload | `buzz-private-pilot` |
| Accountable owner | OvernightDesk owner |
| Operator | Sol/accountable lead only for production mutation |
| Host | `aegis-prod` (`aarch64`) |
| Hostname | `buzz.tail5c4f73.ts.net` |
| OCI ingress | Existing Nginx on `10.0.0.234:80/443`; not a private-network boundary |
| Tailnet ingress | Existing Tailscale Serve on `100.100.1.21:443`, hostname `aegis-prod.tail5c4f73.ts.net`, `/` already proxies `ob1-mcp` |
| Buzz route/certificate | Dedicated `buzz` Tailscale device, Serve HTTPS/WSS, Funnel disabled; must preserve both existing listeners |
| Tailnet identity | `tag:buzz-private-pilot`; no subnet routes, exit node, SSH, or general tailnet administration |
| Repository source | `infra/buzz/` |
| Aegis root | `/opt/overnightdesk/buzz/` |
| Releases | `/opt/overnightdesk/buzz/releases/<release-id>/` |
| Active handles | `/opt/overnightdesk/buzz/current` and `/opt/overnightdesk/buzz/previous` |
| Runtime secret file | `/run/overnightdesk-buzz/runtime.env`, root-owned, `0440`, never persisted |
| Tailscale state | `/opt/overnightdesk/buzz/state/tailscale`, parent root-owned, child writable only by the explicit ingress UID/GID |
| Allowed data | Synthetic pilot content only |
| Observation | Seven days after owner-and-canary qualification unless the owner records another decision |

The relay candidate remains pinned by OCI index digest and must include a
`linux/arm64` manifest. PostgreSQL, Redis, MinIO, and MinIO Client images must
also be resolved to immutable ARM64 digests in deployment source before local
qualification. Floating tags are never production inputs.

## Services and State

| Service | Container | User contract | State | Network |
| --- | --- | --- | --- | --- |
| Tailscale ingress | `buzz-private-pilot-tailscale` | Explicit non-root UID/GID `65532:65532` | dedicated node-state bind path | backend plus canary-relay; owns namespace |
| Relay | `buzz-private-pilot-relay` | Explicit non-root UID/GID `1000:1000` | `buzz-private-pilot-git-data` | `network_mode: service:tailscale`; loopback listeners |
| PostgreSQL 17 | `buzz-private-pilot-postgres` | Explicit image-supported non-root UID/GID | `buzz-private-pilot-postgres-data` | backend only |
| Redis 7 with AOF | `buzz-private-pilot-redis` | Explicit image-supported non-root UID/GID | `buzz-private-pilot-redis-data` | backend only |
| MinIO | `buzz-private-pilot-minio` | Explicit image-supported non-root UID/GID | `buzz-private-pilot-minio-data` | backend only |
| MinIO initializer | `buzz-private-pilot-minio-init` | Explicit image-supported non-root UID/GID | none | backend only |
| Canary adapter | `buzz-private-pilot-canary` | Dedicated non-root UID/GID | deduplication state only | canary-relay only after Approval D |

`buzz-private-pilot-backend` and `buzz-private-pilot-canary-relay` are internal,
dedicated networks. Tailscale owns the shared network namespace; the relay
binds app, health, and metrics listeners to loopback within it. Serve proxies
only `https://buzz.tail5c4f73.ts.net/` to `http://127.0.0.1:3000`. No service
joins the existing proxy network or publishes a host port. Health and metrics
stay internal.
The MinIO console, admin UI, Git web, workflows, webhooks, pairing relay,
public push gateway, multi-community operator API, and bundled Caddy remain
disabled and unrouted.

## Resource and Input Envelope

| Service | CPU | Memory | PIDs |
| --- | ---: | ---: | ---: |
| Relay | `0.50` | `640 MiB` | `256` |
| PostgreSQL | `0.55` | `1152 MiB` | `256` |
| Redis | `0.15` | `256 MiB` | `128` |
| MinIO | `0.30` | `640 MiB` | `128` |
| Tailscale ingress | `0.15` | `192 MiB` | `128` |
| MinIO initializer, transient | `0.10` | `128 MiB` | `64` |
| Canary adapter, only after Approval D | `0.25` | `768 MiB` | `64` |

Long-running services including the canary total `1.90` CPUs and `3648 MiB`.
Initial durable growth is capped at `10 GiB`; exceeding any workload or host
ceiling blocks advancement.

Relay application limits are `32` WebSocket connections, `16` concurrent
handlers, `64` buffered outbound messages per connection, a `262144`-byte
maximum frame, a PostgreSQL writer pool of `10`, a Redis pool of `8`, one
concurrent media upload, one per public key, and ten upload starts per minute.
Image, GIF, video, and generic-file uploads are each capped at `5 MiB` for the
pilot. The relay enforces the application connection/frame/upload limits; the
Tailscale Serve contract contributes private TLS/WSS and access-policy
enforcement but is not treated as an application rate limiter. Git
pack/repository limits remain small and Git product surfaces remain disabled.

## Phase Boundary

No Phase mutation is needed while Gate 0 is blocked. When Approval A is
explicitly granted after local qualification, create only these scopes:

| Purpose | Phase app / environment / path | Keys |
| --- | --- | --- |
| Buzz runtime | `overnightdesk` / `production` / `/agents/buzz/private-pilot/runtime` | `BUZZ_RELAY_PRIVATE_KEY`, `BUZZ_GIT_HOOK_HMAC_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `BUZZ_S3_ACCESS_KEY`, `BUZZ_S3_SECRET_KEY` |
| Tailscale ingress | `overnightdesk` / `production` / `/agents/buzz/private-pilot/tailscale` | `TS_CLIENT_ID`, `TS_CLIENT_SECRET` for an OAuth client restricted to `auth_keys` and `tag:buzz-private-pilot` |
| Canary, later Approval D only | `overnightdesk` / `production` / `/agents/buzz/private-pilot/canary` | adapter model credential and dedicated `BUZZ_PRIVATE_KEY` only if the selected adapter requires them |

Use a dedicated read-only Phase service account scoped to the exact path and a
token file at `/opt/overnightdesk/secrets/phase-buzz-private-pilot-token`, mode
`0400`. The loader must reject extra or missing keys, write an ephemeral
allowlisted environment file, unset the Phase token, and prove that neither
the token nor secret values enter container metadata or logs. `RELAY_OWNER_PUBKEY`
is non-secret configuration. The owner's private key remains on the owner's
client and is never part of either Phase path.

## Authority Matrix

| Principal | Allowed | Explicitly denied |
| --- | --- | --- |
| Owner | Own client key; one closed community; pilot channels; membership decisions | Server lifecycle without an operator gate; sharing identity material |
| Sol/operator | Reviewed lifecycle, recovery, evidence, and rollback for the approved gate | Expanding membership, data, routes, or agent tools implicitly |
| Relay | Exact runtime secrets; backend stores; proxy network; signed collaboration protocol | Docker socket, host ports, Phase token, owner private key, unrelated networks/data |
| Backup producer | Quiesced/logical reads of Buzz stores; encrypted off-box set writes | Identity keys, plaintext export, destructive restore into production |
| Canary | One owner, one channel, one bounded reply, one concurrent prompt | Shell, MCP, repository mutation, secrets, production, outreach, payments, CRM, customer/prospect data, cross-channel work |
| Negative-test identity | Attempt denied connect/read/write flows | Membership or content access |

Missing or ambiguous identity, membership, channel, recovery, image, route, or
approval state fails closed.

## Recovery Objectives

- Target RPO: no more than 24 hours, bounded by the daily encrypted set.
- Target RTO: no more than 60 minutes for an isolated restore of the bounded
  pilot; record the measured value before owner admission.
- Recovery set: transaction-consistent PostgreSQL dump, MinIO objects, Redis
  AOF as diagnostic/coordination state, and safe configuration metadata. Local
  Git scratch is not an authoritative artifact.
- Restore order: isolated network and names, PostgreSQL, MinIO, Redis
  diagnostic state, empty local Git scratch, exact relay image, then logical
  assertions including repository-state rehydration from authoritative data.
- `COMPLETE` is valid only after every encrypted artifact and off-box transfer
  succeeds. A partial or mismatched set blocks admission.

## Lifecycle and Approval Gates

### Gate 0: Candidate and scope freeze

Record immutable image identity, ARM64 manifest, same-SHA CI, provenance,
generated or upstream SBOM, vulnerability disposition, rollback image, exact
scope, and a current read-only Aegis baseline. A Critical/High finding without
an evidence-backed accepted disposition blocks Gate 1 and all production work.

Current result: **blocked solely by the current Tailscale ingress image
vulnerability posture**. The topology is frozen and the Wolfi relay wrapper is
locally qualified at manifest
`sha256:f98fe0e1cc0e66c547adbe325f93df48fb0c451753983e95abb6b89c97da54a2`.
Publishing that exact candidate remains a separate approval-bound action.

### Gate 1: Local qualification

After both replacement candidates pass Gate 0:

```bash
python3 -m unittest discover -s infra/buzz/tests -p 'test_*.py'
docker compose -f infra/buzz/compose.yml -f infra/buzz/compose.aegis.yml config
infra/buzz/deploy-aegis.sh qualify-local
```

No Aegis or Phase mutation occurs. Contracts must prove immutable images,
non-root execution, dropped capabilities, no-new-privileges, read-only roots
where supported, explicit writable paths, no host ports, private dependencies,
safe secret projection, disabled optional surfaces, deterministic recovery,
safe evidence, and route-first rollback.

### Approval A: install disabled

The owner approves the exact release, dependency digests, source paths,
service/container names, users, volumes, networks, resource limits, Phase
paths, backup delta, rollback command, and operator.

```bash
infra/buzz/deploy-aegis.sh install-disabled
infra/buzz/deploy-aegis.sh verify-private
```

The route must remain absent; no owner or canary identity is admitted.

### Approval B: backup and isolated restore

```bash
infra/buzz/deploy-aegis.sh backup
infra/buzz/deploy-aegis.sh restore-rehearsal
```

Seed only synthetic markers. Prove a coherent encrypted off-box set, restore
under disposable names on an unrouted network, validate every store, record
RPO/RTO, and tear down only disposable restore resources.

### Approval C: owner route and admission

```bash
infra/buzz/deploy-aegis.sh enable-route
infra/buzz/deploy-aegis.sh qualify-owner
```

Require current private/recovery evidence, validated Tailscale Serve JSON,
route absence, tested rollback, exact device tag/name, Funnel absence,
unchanged host Serve/Nginx baselines, and explicit approval. Exercise owner
collaboration and unadmitted connect/read/write denial. Keep the canary
disabled.

### Approval D: canary

```bash
infra/buzz/deploy-aegis.sh enable-canary
infra/buzz/deploy-aegis.sh qualify-canary
```

Use a new identity, one owner, one channel, no tools, bounded work,
deduplication, adversarial requests, restart, revocation, and queued-work
cancellation. Any prohibited action or scope escape triggers rollback.

### Observation and decision

Capture daily safe readiness, restart, latency/error, denial, canary,
capacity/disk, backup, incident, and existing-service-health evidence for seven
days. The final decision is one of continue bounded, pause disabled, rollback,
or propose one separately scoped expansion.

## Route-First Rollback

```bash
infra/buzz/deploy-aegis.sh rollback
infra/buzz/deploy-aegis.sh status
```

The reviewed command must stop or revoke the dedicated Buzz Tailscale device
first, prove `buzz.tail5c4f73.ts.net` is unreachable, and prove the host Serve
configuration is unchanged. It then stops the canary and stack without deleting
volumes/images/secrets, restores the previous immutable source/configuration
handle if needed, verifies the pre-change Aegis listeners and service baseline,
retains evidence, and appends success or failure to
`/opt/overnightdesk/deploys.log`. Target route disable is under five minutes.
Cleanup and permanent credential/device deletion are later approvals, not
rollback.

## Operator Questions and Signals

1. Is relay readiness failing because of PostgreSQL, Redis, MinIO, migration,
   or repository state?
2. Are authentication, membership, invalid-signature, or rate-limit denials
   behaving as expected without leaking content?
3. Is the workload approaching CPU, memory, PID, connection, pool, disk, or
   upload limits, or affecting an existing Aegis service?
4. Did backup/restore and canary work complete exactly once and inside bounds?

Use internal readiness/dependency probes, bounded metrics, container/resource
status, and structured safe reason codes to answer these questions. Secret
sentinel hits, data loss, cross-scope action, or existing-service regression
are immediate hard stops.
