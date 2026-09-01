# Implementation Plan: Buzz Private Pilot on Aegis

**Branch**: `042-buzz-private-pilot` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/042-buzz-private-pilot/spec.md`

**Plan Status**: Closed without implementation or deployment on 2026-09-01 at
the owner's direction. This plan is retained as historical research and MUST
NOT be executed. Its selected topology is not an active recommendation.

## Summary

Prepare a private, reversible Buzz pilot on the shared ARM64 `aegis-prod`
host. Keep the workload in its own `infra/buzz/` directory and expose it only
through a dedicated, tag-owned Tailscale container/device at
`buzz.tail5c4f73.ts.net`. The relay shares that container's network namespace,
allowing Tailscale Serve to proxy HTTPS/WSS to relay loopback without publishing
a host port or altering the existing host Tailscale Serve and OCI Nginx
listeners.

Qualify immutable relay and ingress images locally before writing deployment
source. The promoted Wolfi wrapper preserves the exact upstream Buzz ARM64
relay artifact and now passes package-freeze, reproducibility, non-root,
read-only-root, process-start, SBOM, and zero-known-match checks at local
manifest
`sha256:f98fe0e1cc0e66c547adbe325f93df48fb0c451753983e95abb6b89c97da54a2`.
The current official Tailscale `stable` image remains rejected because its scan
contains fixed Critical/High findings. No Aegis, Phase, tailnet-policy,
identity, registry, GitHub, or remote-Git mutation is authorized by this plan
update.

## Delivery Classification

- **Context**: Brownfield
- **Scale**: System
- **Risk**: Production
- **Route**: Sol owns architecture, integration, production mutation, and the
  final quality gate. Production-related delegation remains read-only only.
- **GitHub route**: [Issue #249](https://github.com/Little-Town-Labs/overnightdesk/issues/249)
  in Engineering Delivery project 4 (P1 / System / Production / Done; closed
  as not planned).

## Technical Context

**Language/Version**: Docker Compose v5.3.1, Dockerfiles, Bash lifecycle
orchestration, Python contract tests, Tailscale 1.102.x-compatible Serve
configuration, pinned upstream Rust relay artifacts, and a separately
supervised canary adapter.

**Primary Dependencies**: Exact upstream Buzz source
`571c1902d0ca55cfd4ccf6b91eeb731909cc10be`; immutable ARM64 relay wrapper;
immutable qualified Tailscale image; PostgreSQL 17; Redis 7; MinIO; Phase;
systemd; Docker Compose; and the encrypted backup producer. The upstream Buzz
index digest
`sha256:aa5180ce58ac367a125a1c079bfde88f8c158daa99e1aa5df86e8814649669f5`
is an artifact source only, not an approved runtime. The assessed Tailscale
stable index
`sha256:8c42c4574ab066384fcb72f69e086a2ff1dd3652eb6f56856cee34bcf0d2f680`
is also rejected pending a fixed upstream image.

**Storage**: Dedicated PostgreSQL, Redis AOF, MinIO, relay Git-scratch, canary
deduplication, and Tailscale node-state paths. PostgreSQL and MinIO are the
authoritative coherent recovery set. Redis is diagnostic/coordination state,
Git is disposable scratch, and Tailscale node state is revocable identity state
that can be re-enrolled from a new approved credential.

**Testing**: Static configuration/security contracts; ARM64 build and runtime
checks; Syft 1.51.0 SBOM; Grype 0.116.1 with a current database; isolated
integration; private Aegis qualification; denied-access tests; collaboration
behavior; persistence; coherent backup and isolated restore; resource/load
qualification; safe-log sentinels; route-first rollback; and existing-service
health regression.

**Target Platform**: ARM64 Aegis host with 4 OCPUs, 23 GiB RAM, Docker Compose,
OCI-bound Nginx at `10.0.0.234:80/443`, host Tailscale at
`100.100.1.21:443`, and no Buzz host ports.

**Project Type**: Named production infrastructure workload plus one separately
supervised low-authority agent adapter.

**Performance Goals**: For one owner, one canary, five channels, and 10,000
small synthetic messages, p95 send-to-visible under two seconds; no existing
workload degradation; dedicated-ingress disable within five minutes.

**Constraints**: Combined long-running allocation no greater than 2 CPU cores,
4 GiB RAM, and 10 GiB initial disk growth; no Docker socket, bundled Caddy,
host ports, Funnel, floating tags, owner key in server processes, secrets or
content in telemetry, or delegated production mutation. Every container and
initializer declares an explicit non-root UID/GID. An image with an
undisposed Critical/High finding fails Gate 0.

**Scale/Scope**: One tailnet hostname, one closed community, one owner, one new
canary, at most five pilot channels, synthetic content only, seven-day
observation.

## Constitution Check

- **Business boundary**: PASS. One named internal evaluation workload using
  synthetic content only.
- **Least privilege**: PASS by gate. No host port or Funnel; distinct node,
  identity, store, and canary boundaries.
- **Human accountability**: PASS. Image adoption, tailnet policy, secrets,
  production installation, ingress, identities, backup, canary, and expansion
  are separately approved.
- **Named workload**: PASS. Versioned Compose/systemd source, deterministic
  checks, and a preserved rollback handle.
- **Operational truth**: PASS. Exact digests and safe evidence enter the
  runbook and deployment ledger.
- **Recoverability**: PASS by gate. No human admission before coherent backup
  and isolated restore.
- **Test-first**: PASS. Contracts precede promoted deployment source.
- **Go preference**: PASS with upstream-integration exception; no generalized
  first-party daemon is added.

No constitutional exception is proposed.

## Architecture

```text
approved tailnet client
        |
HTTPS/WSS: buzz.tail5c4f73.ts.net (Serve; Funnel disabled)
        |
dedicated Tailscale device/container (tag:buzz-private-pilot)
        | shared network namespace; proxy to 127.0.0.1:3000
Buzz relay ------------------------> internal readiness and metrics
   |        |          |       |
   |        |          |       +--> disposable Git-scratch volume
   |        |          +----------> MinIO + object volume
   |        +---------------------> Redis + AOF volume
   +------------------------------> PostgreSQL + data volume

new canary identity -> canary-only network -> relay loopback namespace
  owner allowlist, one channel, no tools, bounded queue/output

encrypted backup producer -> coherent PostgreSQL + MinIO recovery set
restore rehearsal -> empty Git scratch + logical repository rehydration
```

### Interface and Trust Boundaries

1. `tailscale` owns the network namespace, joins the private backend and
   canary-relay networks, persists its node state in a dedicated bind path, and
   receives only its tag-scoped enrollment credential. It receives no Buzz,
   database, MinIO, Redis, owner, or canary credential.
2. `relay` uses `network_mode: service:tailscale`, binds application, health,
   and metrics listeners to loopback, and reaches dependencies through the
   shared namespace. It receives no Tailscale credential or state path.
3. Serve terminates HTTPS/WSS and proxies only to `127.0.0.1:3000`. Its config
   names one HTTPS handler, contains no Funnel enablement, and is mounted as a
   directory so containerboot can observe updates.
4. Existing host Nginx and host Tailscale Serve configuration are read-only
   regression baselines, never implementation targets.
5. The canary reaches only relay and approved model egress. It receives no
   store, Docker, Phase, host, tenant, or business-action access.
6. The owner, relay administrator, Tailscale device, and canary use distinct,
   independently revocable identities and credentials.

### Runtime Image Strategy

The relay wrapper uses a multi-stage copy from the exact upstream Buzz index
and copies only `/usr/local/bin/buzz-relay` plus `/srv/buzz/web`. Its runtime
base, every installed package version, UID/GID, OCI annotations, build command,
resulting ARM64 digest, SBOM, and scan are frozen. It does not rebuild or patch
the relay binary. Git, cURL, OpenSSL, CA material, glibc, and libgcc remain
because upstream relay source invokes those helpers or dynamically links them.

The first Debian Trixie prototype is rejected (40 Critical, 62 High matches).
The promoted Wolfi candidate produced byte-identical OCI archives across two
uncached builds, passed 9/9 local image contracts, and has zero Grype matches.
It is locally qualified but cannot be deployed until that exact result is
published and pinned under separate remote-state authorization. The current
official Tailscale stable image is rejected (2 Critical, 22 High matches, with
fixes identified). Gate 1 waits for a fixed immutable Tailscale release and
repeat scan rather than maintaining a Tailscale fork.

### Resource Envelope

| Service | CPU | Memory | PIDs |
| --- | ---: | ---: | ---: |
| Relay | `0.50` | `640 MiB` | `256` |
| PostgreSQL | `0.55` | `1152 MiB` | `256` |
| Redis | `0.15` | `256 MiB` | `128` |
| MinIO | `0.30` | `640 MiB` | `128` |
| Tailscale ingress | `0.15` | `192 MiB` | `128` |
| Canary, after Approval D | `0.25` | `768 MiB` | `64` |
| MinIO initializer, transient | `0.10` | `128 MiB` | `64` |

Long-running total with canary: `1.90` CPU and `3648 MiB`. The initializer
runs before canary admission and never raises the active total above the
approved ceiling.

### State and Recovery

| Store | Owns | Recovery posture |
| --- | --- | --- |
| PostgreSQL | Events, memberships, channels, search, audit | Consistent dump; restore first |
| MinIO | Synthetic object content | Same-window snapshot; restore after database |
| Git scratch | Disposable hydrate/cache work | Recreate empty; prove logical rehydration |
| Redis AOF | Coordination, presence, limiter state | Diagnostic copy; prove safe rebuild |
| Tailscale node state | Revocable device identity | Persist locally; re-enroll after loss; never copy into ordinary evidence |
| Secret custody | Relay, stores, ingress enrollment, canary | Approved encrypted store; owner key excluded |

Restore qualification uses alternate names on a disposable unrouted network
and validates membership, messages, objects, and repository state.

### Observability

Capture container lifecycle, health, restarts, digests, Tailscale device/Serve
state, HTTPS/WSS latency and errors, database/Redis/MinIO dependency failures,
canary processed/ignored/failed/duplicate counts, membership denials, CPU/RSS/
PIDs, volume bytes/inodes, backup set IDs, restore assertions, and recovery
duration. Use safe IDs, counts, and reason codes only. Never emit private keys,
OAuth/auth values, node state, authorization, cookies, raw requests, message
bodies, prompts, model output, or attachments.

### Rollback

1. Stop or revoke the dedicated Buzz Tailscale device and verify the Buzz FQDN
   is unreachable; do not edit the existing host Serve configuration.
2. Stop and disable the canary adapter.
3. Stop Buzz without deleting state, images, or secrets.
4. Restore the prior immutable source/configuration handle if needed.
5. Verify every pre-existing Aegis listener and health check.
6. Keep state through the observation window; cleanup requires later approval.

## Project Structure

```text
specs/042-buzz-private-pilot/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
├── checklists/
├── delivery.md
├── evidence/
└── tasks.md

infra/buzz/
├── compose.yml
├── compose.aegis.yml
├── env.example
├── relay/
│   └── Dockerfile
├── tailscale/
│   └── serve.json
├── buzz.service
├── buzz-canary.service
├── deploy-aegis.sh
├── load-phase-env.sh
├── run-stack.sh
├── stop-stack.sh
├── qualify-private.sh
├── qualify-owner.sh
├── qualify-canary.sh
├── backup-buzz.sh
├── restore-rehearsal.sh
├── rollback.sh
├── canary/
└── tests/

docs/decisions/007-buzz-private-pilot.md
docs/runbooks/buzz-private-pilot.md
```

**Structure Decision**: Keep the workload in its own `infra/buzz/` directory,
following the existing disabled-first Aegis lifecycle seam. A separate
repository is unnecessary unless the pilot later owns custom Buzz source or an
independent release lifecycle.

## Delivery Gates

### Gate 0 - Candidate and Scope Freeze

Freeze source/image identities, ARM64 manifests, provenance, current SBOMs and
scans, hostname, tag/access policy, secrets, resource envelope, recovery, and
rollback. The relay candidate is locally qualified; current disposition remains
blocked only on a qualified immutable official Tailscale image. No production
action occurs.

### Gate 1 - Local Contract Qualification

Write failing contracts, promote the qualified wrapper and sidecar definitions,
render Compose, and run a synthetic isolated stack. No Aegis, Phase, tailnet,
identity, GitHub, or remote-Git mutation occurs.

### Gate 2 - Private Aegis Infrastructure

With separate approval, create the tag-scoped credential, install root-owned
source, start the stack without Serve activation or admitted identities, and
prove hardening, resource bounds, backup, restore, restart, and existing-service
health.

### Gate 3 - Owner-Only Human Pilot

With separate approval, activate the dedicated Serve route, admit the owner,
and test core collaboration, denial, restart, edge limits, and load. Canary
remains disabled.

### Gate 4 - Isolated Agent Canary

With separate approval, admit one new tool-free canary in one channel and run
normal, adversarial, duplicate, restart, resource, and revocation checks.

### Gate 5 - Seven-Day Decision

Report checks, capacity, incidents, recovery, residual risks, and rollback.
Passing grants no additional identity, route, data class, tool, or authority.

## Verification Surfaces

```bash
python3 -m unittest discover -s infra/buzz/tests -p 'test_*.py'
docker compose -f infra/buzz/compose.yml -f infra/buzz/compose.aegis.yml config
infra/buzz/deploy-aegis.sh qualify-local
infra/buzz/deploy-aegis.sh install-disabled
infra/buzz/deploy-aegis.sh verify-private
infra/buzz/deploy-aegis.sh backup
infra/buzz/deploy-aegis.sh restore-rehearsal
infra/buzz/deploy-aegis.sh enable-route
infra/buzz/deploy-aegis.sh qualify-owner
infra/buzz/deploy-aegis.sh enable-canary
infra/buzz/deploy-aegis.sh qualify-canary
infra/buzz/deploy-aegis.sh rollback
infra/buzz/deploy-aegis.sh status
```

Every command after `qualify-local` is production-sensitive and requires its
named approval.

## Constitution Check After Design

The selected topology gives Buzz its own tailnet identity without modifying
existing ingress, separates credentials and state, fails closed on image or
policy ambiguity, preserves authoritative recovery boundaries, and keeps the
canary tool-free. No constitutional violation or speculative extension point
remains.

## Complexity Tracking

No constitutional violation requires justification. The multi-store runtime is
inherited from upstream Buzz; measuring whether its operational cost is
acceptable is the pilot's purpose.
