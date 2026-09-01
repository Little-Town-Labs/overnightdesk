# Buzz on Aegis: feasibility assessment

**Status:** Research closed; no deployment authorized or performed

**Assessed:** 2026-09-01

**Upstream:** [`block/buzz`](https://github.com/block/buzz)
**Scope:** A private Buzz community for the owner, approved collaborators, and
named agents on the existing ARM64 `aegis-prod` VM

The owner closed this initiative without deployment on 2026-09-01. These
findings are retained as historical evidence only and must be revalidated
before any future proposal.

## Executive recommendation

Buzz is **technically feasible on ARM64 Aegis**, and the VM has enough current
CPU, memory, and disk headroom for a bounded pilot. It should not yet be
approved as a generally shared production service.

The strongest fit is a **private, named evaluation workload** with one explicit
community, an allowlisted human/agent roster, a small set of private channels,
no Buzz-hosted Git repositories initially, and agent execution kept outside the
relay container. Proceeding beyond evaluation should require a measured
capacity test, coherent backup/restore rehearsal, ingress controls, key
custody/revocation procedures, and compensating edge rate limits.

The prior baseline-backup blocker is resolved. A read-only production check
found that Aegis's encrypted backup producer completed successfully on
2026-09-01 with 64 artifacts, 689,390,615 encrypted bytes, exit status 0, and a
`COMPLETE` marker. Buzz should still not receive durable business data until the
backup configuration covers its PostgreSQL, MinIO, Git, and secret state and
that expanded recovery set has been restored in an isolated rehearsal.

This conclusion is based on the following:

- Upstream publishes a production Compose bundle and native `linux/arm64`
  relay images. The relay image is assembled as a multi-architecture manifest,
  and its Dockerfile is intentionally platform-neutral
  ([Dockerfile](https://github.com/block/buzz/blob/main/Dockerfile),
  [image workflow](https://github.com/block/buzz/blob/main/.github/workflows/docker.yml)).
- The product's identity model is well suited to a human-and-agent workspace:
  every human and agent has a separate signed Nostr identity, relay membership
  gates admission, and channel membership gates access
  ([README](https://github.com/block/buzz/blob/main/README.md),
  [security policy](https://github.com/block/buzz/blob/main/SECURITY.md)).
- The deployment is not a single lightweight chat container. It is a stateful
  five-container stack—relay, PostgreSQL, Redis, MinIO, and MinIO initializer—
  with four persistent data domains; optional Caddy makes it six containers
  ([production Compose](https://github.com/block/buzz/blob/main/deploy/compose/compose.yml),
  [TLS override](https://github.com/block/buzz/blob/main/deploy/compose/compose.caddy.yml)).
- Buzz is explicitly pre-1.0. Only `main` receives active support; prior
  releases are best-effort. The relay is independently versioned and was at
  `0.2.1` in the assessed source
  ([security policy](https://github.com/block/buzz/blob/main/SECURITY.md),
  [relay manifest](https://github.com/block/buzz/blob/main/crates/buzz-relay/Cargo.toml),
  [`relay-v0.2.1` source](https://github.com/block/buzz/commit/6e5c462ac524de60d7edb46c66130fd779cc9006)).
- Current source contains a Redis-backed fixed-window limiter for HTTP, message,
  WebSocket, GIF, and IP-connection admission, although the architecture
  document still claims that only a test stub exists. This source/documentation
  drift is itself an upgrade-review risk, and fixed-window application limits
  do not replace edge connection, body-size, and timeout controls
  ([rate-limiter source](https://github.com/block/buzz/blob/main/crates/buzz-pubsub/src/rate_limiter.rs),
  [architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md)).

## What Buzz is

Buzz is a self-hostable collaboration workspace in which humans, agents,
workflows, repositories, and project history use the same signed-event model.
Its wire protocol is Nostr NIP-01. Each message, reaction, workflow action,
canvas update, and Git event is a signed event identified by a kind number. The
relay is the authoritative source of truth; clients connect to it over
WebSocket and REST, and there is no peer-to-peer replication in the shipped
single-relay model
([architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md)).

One relay host selects one community in the default self-hosted setup. Buzz
also contains a host-derived multi-community model, but that adds a tenant
routing and isolation surface that is unnecessary for this proposal. Aegis
should begin, if at all, with one hostname, one relay, and one explicitly named
community
([README](https://github.com/block/buzz/blob/main/README.md),
[architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md)).

The server is a Rust/Axum relay composed from focused crates:

- `buzz-db`: PostgreSQL event, channel, workflow, audit, and membership state.
- `buzz-pubsub`: Redis pub/sub, presence, and typing state.
- `buzz-search`: PostgreSQL full-text search.
- `buzz-audit`: a SHA-256 hash-chained, tamper-evident audit log.
- `buzz-media`: Blossom/S3-compatible media storage.
- `buzz-workflow`: YAML workflow automation.
- `buzz-relay`: WebSocket and REST boundary coordinating all of the above.

The audit chain detects tampering but is not tamper-resistant: an attacker with
database write access can rewrite data and recompute the keyless chain. It is
useful evidence, not a substitute for database access control or independent
backups
([security policy](https://github.com/block/buzz/blob/main/SECURITY.md)).

## Runtime and deployment requirements

The supported single-node/VPS path is `deploy/compose/`, not the repository's
development Compose file. Upstream requires Docker Compose 2.24.4 or newer.
Production initialization requires a completed `.env`, stable secrets,
database migration (`BUZZ_AUTO_MIGRATE=true` or `buzz-admin migrate`), and a
pinned relay image. Upstream explicitly warns that the default
`ghcr.io/block/buzz:main` is for early testing and recommends a SHA or release
tag for production
([deployment README](https://github.com/block/buzz/blob/main/deploy/compose/README.md),
[environment template](https://github.com/block/buzz/blob/main/deploy/compose/.env.example)).

| Component | Shipped image or artifact | Persistence | Network role |
|---|---|---|---|
| Relay | `ghcr.io/block/buzz` | `/data/git` plus external stores | App WS/REST on 3000; health on 8080; metrics on 9102 |
| PostgreSQL | `postgres:17-alpine` | `buzz-postgres-data` | Internal only |
| Redis | `redis:7-alpine`, password + AOF | `buzz-redis-data` | Internal only |
| MinIO | Pinned upstream release | `buzz-minio-data` | Internal object storage |
| MinIO init | Pinned `minio/mc` release | None | Creates a non-public bucket, then exits |
| Caddy (optional) | `caddy:2-alpine` | Caddy data/config | Public 80/443 and automatic TLS |

The Compose file does not define CPU or memory limits, and upstream publishes
no minimum or recommended VPS sizing in the deployment guide. That makes an
Aegis capacity decision impossible from documentation alone. A staging run
must measure idle and active RSS, CPU, disk growth, database connections,
WebSocket counts, media use, and agent bursts before a production allocation is
approved. The image-build workflow's need to cap BuildKit on a 7 GB runner is a
build-time constraint, not evidence of relay runtime consumption
([image workflow](https://github.com/block/buzz/blob/main/.github/workflows/docker.yml)).

### ARM64 viability

ARM64 is a first-class relay image target. Upstream builds on native
`ubuntu-24.04-arm` runners for `linux/arm64`, builds AMD64 and ARM64 images by
digest, and combines them into one manifest. The Dockerfile has no platform
pin and explicitly describes the native multi-architecture process
([image workflow](https://github.com/block/buzz/blob/main/.github/workflows/docker.yml),
[Dockerfile](https://github.com/block/buzz/blob/main/Dockerfile)).

As an additional read-only verification on 2026-09-01, registry manifest
inspection found `linux/arm64` entries for the current `main` image and the
assessed immutable candidate `sha-571c190`. That candidate resolves to the
multi-architecture index digest
`sha256:aa5180ce58ac367a125a1c079bfde88f8c158daa99e1aa5df86e8814649669f5`.
This establishes image availability, not an end-to-end Aegis qualification;
the selected digest still needs to be tested on the host before deployment.

## Storage, backup, and recovery model

Buzz stores different parts of one logical workspace in separate systems:

- PostgreSQL holds events, memberships, workflows, search data, and audit data.
- Redis provides pub/sub/presence and is configured with append-only
  persistence in the production Compose bundle.
- MinIO holds media/object data.
- A separate relay volume holds local Git scratch under `/data/git`. In the
  assessed source, the configuration explicitly says authoritative repository
  state is hydrated from PostgreSQL/object storage per request.
- If bundled Caddy is used, its certificate/config state adds two more volumes.

Upstream provides only a backup **checklist**, not an automated backup or restore
system. Its run helper still calls for the environment/secrets, owner private
key, PostgreSQL, MinIO/S3, Git volume, and optional Caddy state to be backed up.
That checklist conflicts with the assessed relay configuration, which calls
local Git state disposable scratch. For Aegis, PostgreSQL/MinIO are treated as
authoritative and a restore must prove repository rehydration rather than
assuming the scratch archive is business state
([run helper](https://github.com/block/buzz/blob/main/deploy/compose/run.sh)).

For Aegis, a production decision therefore requires all of the following to be
designed and rehearsed before valuable data is admitted:

1. encrypted backup custody for relay, Git-hook, database, Redis, S3, and
   identity secrets;
2. consistent PostgreSQL plus MinIO plus Git-volume recovery points;
3. a restore test to a disposable network with no public ingress;
4. explicit retention and deletion policy for chat, media, agent memory,
   workflow history, and repositories; and
5. disk-growth monitoring and an exhaustion response.

An evaluation should disable or avoid Buzz Git hosting and large media uploads
unless those capabilities are specifically being tested. This reduces both
backup coupling and disk-growth risk.

## Network and ingress model

The relay exposes a broad application surface on one app port: WebSocket,
signed-event REST endpoints, queries, workflow hooks, media upload/download,
Git smart HTTP, invite routes, and optionally a Git browser. Health and
Prometheus metrics use separate ports. The production Compose file publishes
the app port directly unless its Caddy override resets that mapping
([architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md),
[production Compose](https://github.com/block/buzz/blob/main/deploy/compose/compose.yml),
[TLS override](https://github.com/block/buzz/blob/main/deploy/compose/compose.caddy.yml)).

The relay itself does not enforce TLS; production must terminate TLS at the
relay or a reverse proxy
([security policy](https://github.com/block/buzz/blob/main/SECURITY.md)). For
Aegis, the preferable integration is the existing reviewed ingress plane, with
only one approved HTTPS/WSS hostname routed to the relay. PostgreSQL, Redis,
MinIO, health, metrics, and any admin surface should publish no public host
ports. The Git browser should remain disabled (`BUZZ_SERVE_GIT_WEB_GUI=false`),
and the moderation dashboard should remain unconfigured until its separate
operator hostname and NIP-98 authorization are deliberately reviewed
([environment template](https://github.com/block/buzz/blob/main/deploy/compose/.env.example),
[testing/config reference](https://github.com/block/buzz/blob/main/TESTING.md)).

Current source wires Redis-backed fixed-window admission limits with configured
human and agent tiers. Those limits fail closed when the shared limiter is
unavailable, but fixed windows allow bursts at boundaries and do not bound every
resource dimension. Ingress must still add connection/request/body/time limits
and monitoring for REST, WebSocket, Git, media, and abusive authenticated
members
([rate-limiter source](https://github.com/block/buzz/blob/main/crates/buzz-pubsub/src/rate_limiter.rs),
[admission source](https://github.com/block/buzz/blob/main/crates/buzz-relay/src/admission.rs)).

## Identity, authorization, and multi-user semantics

Buzz uses Nostr keypairs rather than OvernightDesk's current OIDC session and
workspace-membership model:

- WebSocket writers authenticate using NIP-42 challenge/response.
- REST requests use NIP-98 signed HTTP authentication.
- Closed-relay admission uses an owner-signed relay membership roster.
- Channel membership is the access-control gate. Non-members cannot see
  private channels or subscribe to their events.
- Channel roles include owner, admin, member, guest, and bot.

These controls are enforced in the relay and include a pre-registration access
check intended to prevent a live-subscription race
([security policy](https://github.com/block/buzz/blob/main/SECURITY.md),
[architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md)).

The production template enables signed REST auth and relay membership by
default. `buzz-admin` in the relay image manages the relay roster, while the
ordinary Buzz CLI manages channel membership
([environment template](https://github.com/block/buzz/blob/main/deploy/compose/.env.example),
[architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md)).

This model can satisfy the project's separate-identity requirement, but only if
implemented literally:

- every person receives a separate human identity;
- every named agent receives a separate agent identity;
- no person or agent shares private keys;
- each agent is admitted only to its necessary channels;
- owner/operator keys are not given to agent processes; and
- revocation is tested at both relay and channel boundaries.

Buzz Desktop stores keys in the OS keyring when available. Headless Linux can
fall back to an owner-only file, while `BUZZ_PRIVATE_KEY` overrides other stores
for harnessed agents and CI
([security policy](https://github.com/block/buzz/blob/main/SECURITY.md)). That
environment-secret pattern requires a reviewed Phase injection and process
isolation design on Aegis. The relay owner key and each agent key must be kept
out of general agent memory, logs, Compose files committed to Git, and shared
runtime environments.

There is no documented native bridge from Buzz identities to the existing
OvernightDesk OIDC/membership records. Without a separately designed
integration, Buzz membership and revocation are an additional authoritative
access system that operators must reconcile.

## Human and agent client surfaces

Humans ordinarily use the Tauri desktop client and point it at the relay URL.
The packaged Linux client listed by upstream is x86_64; ARM64 support discussed
above applies to the server image, not to a packaged Linux ARM64 desktop app.
The relay container includes an invite bundle, optional Git browser, and
optional admin bundle; upstream does not describe that container as a complete
replacement for the desktop collaboration client
([README](https://github.com/block/buzz/blob/main/README.md),
[Dockerfile](https://github.com/block/buzz/blob/main/Dockerfile)).

Agents have three relevant integration layers:

1. **Nostr WebSocket and signed REST.** A custom integration can speak the same
   protocol as other clients.
2. **`buzz-cli`.** An agent-first, JSON-in/JSON-out CLI uses
   `BUZZ_PRIVATE_KEY` and `BUZZ_RELAY_URL` and covers messages, channels, DMs,
   workflows, canvases, repositories, uploads, and agent memory
   ([CLI README](https://github.com/block/buzz/blob/main/crates/buzz-cli/README.md)).
3. **`buzz-acp`.** A separate harness listens for relay mentions, queues at most
   one active prompt per channel, and talks ACP/JSON-RPC over stdio to Goose,
   Codex (through `codex-acp`), Claude Code, or another ACP agent. It can expose
   an optional MCP server to the child agent
   ([ACP README](https://github.com/block/buzz/blob/main/crates/buzz-acp/README.md),
   [architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md)).

The relay container does **not** make the existing agents automatically present
in Buzz. Each named agent needs a separate keypair, relay admission, channel
membership, a supervised CLI/harness execution environment, model-provider
credentials, and explicit response policy. Upstream's ACP default is
owner-only; an agent without a resolved owner responds to nobody. Setting
`respond-to anyone` disables that safeguard
([ACP README](https://github.com/block/buzz/blob/main/crates/buzz-acp/README.md)).

For Codex specifically, upstream's documented adapter path requires
`OPENAI_API_KEY` and says not to rely on a ChatGPT subscription. That differs
from the existing primary Codex OAuth boundary and should be treated as a new
credential/integration decision, not an incidental deployment detail
([ACP README](https://github.com/block/buzz/blob/main/crates/buzz-acp/README.md)).

Buzz has explicit Hermes compatibility hooks in `buzz-acp`: Hermes command
identities receive an MCP-startup isolation default, and Hermes appears in the
desktop-managed preset catalog. That is compatibility support, not a packaged
Aegis integration. A read-only check found no `hermes-acp` or `hermes`
executable in the current `hermes-walter`, `hermes-titus`, or `hermes-mitchel`
containers, while the published relay image includes the relay/admin/pairing
binaries but not `buzz-acp` or `buzz-cli`. Existing runtimes therefore still
need a separately built and supervised adapter/CLI layer. It must be designed
so Buzz messages cannot directly authorize shell, deployment, outreach,
secret, or business-record mutations
([ACP configuration source](https://github.com/block/buzz/blob/main/crates/buzz-acp/src/config.rs),
[relay Dockerfile](https://github.com/block/buzz/blob/main/Dockerfile)).

## Operational maturity and maintenance signals

Positive signals:

- Apache-2.0 licensing
  ([license](https://github.com/block/buzz/blob/main/LICENSE)).
- A dedicated production Compose bundle, explicit migration and backup notes,
  health/readiness endpoints, Prometheus metrics, and structured tracing
  dependencies
  ([deployment README](https://github.com/block/buzz/blob/main/deploy/compose/README.md),
  [relay manifest](https://github.com/block/buzz/blob/main/crates/buzz-relay/Cargo.toml)).
- Native AMD64/ARM64 builds, OCI provenance attestations, and publication only
  after same-SHA CI qualification
  ([image workflow](https://github.com/block/buzz/blob/main/.github/workflows/docker.yml)).
- A documented security reporting path and active security-fix policy
  ([security policy](https://github.com/block/buzz/blob/main/SECURITY.md)).
- Active development at assessment time and independently tagged relay
  releases `0.1.1`, `0.2.0`, and `0.2.1`; `0.2.1` was tagged 2026-08-08
  ([`relay-v0.2.1` source](https://github.com/block/buzz/commit/6e5c462ac524de60d7edb46c66130fd779cc9006)).

Risk signals:

- The project explicitly says it is unfinished and pre-1.0; only `main` is
  actively supported
  ([README](https://github.com/block/buzz/blob/main/README.md),
  [security policy](https://github.com/block/buzz/blob/main/SECURITY.md)).
- Current source and `ARCHITECTURE.md` disagree about whether Redis-backed rate
  limiting is implemented. The implementation is present and wired into relay
  state at the assessed SHA, so every upgrade review must verify behavior from
  source/tests rather than trusting the stale architecture statement
  ([rate-limiter source](https://github.com/block/buzz/blob/main/crates/buzz-pubsub/src/rate_limiter.rs),
  [architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md)).
- Some workflow features are documented as incomplete, including approval
  gates and some workflow actions. Those are especially unsuitable as an
  authority boundary for production agent actions
  ([architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md)).
- `just test` does not run the end-to-end relay suites; those tests are ignored
  by default and require an already running relay
  ([testing guide](https://github.com/block/buzz/blob/main/TESTING.md)).
- No published capacity baseline or Compose resource limits were found.
- Backup support is a checklist rather than an automated, verified restore
  system
  ([run helper](https://github.com/block/buzz/blob/main/deploy/compose/run.sh)).
- The product introduces a second identity/membership system and a large
  protocol surface on a shared production VM.

## Aegis-specific risk assessment

### Live host snapshot

Read-only checks on 2026-09-01 found:

- `aegis-prod` is `aarch64`, with 4 OCPUs and 23 GiB RAM.
- 19 containers were running; all named business runtimes reported healthy.
- About 4.9 GiB RAM was used and 18 GiB was available; swap use was zero.
- The root filesystem had 73 GiB free at 63% utilization.
- Docker held 48.22 GB of images, 28.61 GB of volumes, and 26.09 GB of build
  cache. These are not all Buzz-available capacity: cleanup and retention are
  separate operational decisions.
- Existing workloads generally have explicit CPU/memory limits and several use
  non-root users, read-only roots, dropped capabilities, PID caps, and
  `no-new-privileges`. Upstream Buzz Compose defines none of those resource or
  hardening controls, so an Aegis override is required.
- The existing Nginx plane publishes ports 80/443 on the OCI interface
  `10.0.0.234`, not the Tailscale interface. Tailscale is `100.100.1.21`, where
  Tailscale Serve already owns HTTPS port 443 and proxies `/` to `ob1-mcp`.
  Buzz should omit bundled Caddy, but its private TLS/WSS topology must be
  resolved without displacing either existing listener.
- Docker Compose v5.3.1 exceeds Buzz's documented v2.24.4 minimum.
- The prior encrypted backup failure caused by the invalid `n8n-files` dataset
  root has been repaired. A production run completed successfully at
  2026-09-01T13:57:17Z with 64 artifacts and a `COMPLETE` marker. Buzz-specific
  stores are not yet part of that baseline and require an additive backup and
  restore design.

| Risk | Why it matters on a shared production VM | Required disposition before production |
|---|---|---|
| Resource contention | Relay, Postgres, Redis, MinIO, clients, media, Git, and agent bursts have no upstream sizing baseline | Measure on ARM64; set CPU/memory/PID/disk limits and reserve host headroom |
| Denial of service | Redis fixed-window admission exists, but WebSocket, REST, media, hooks, and Git share ingress and fixed windows allow boundary bursts | Private/allowlisted ingress for evaluation; proxy connection/request/body/time limits; alerting |
| Cross-workload impact | Stateful databases and object storage share Aegis resources with existing named runtimes | Dedicated Compose network, volumes, secrets, Unix ownership, and no Docker socket |
| Identity compromise | Agent private keys authorize signed actions; relay owner key controls admission | Separate Phase paths per identity; no owner key in agent processes; rotation/revocation runbook |
| Authorization drift | Buzz roster/channel state is separate from OvernightDesk membership | Named owner, periodic reconciliation, and tested relay + channel revocation |
| Agent overreach | ACP can spawn coding agents and optional MCP tools from untrusted room input | Keep harnesses outside relay; least-privilege workdirs/tools; owner-only response policy; human approval for high-impact actions |
| Data loss/inconsistent restore | One workspace spans authoritative PostgreSQL/MinIO data, Redis coordination, disposable Git scratch, and secrets | Coherent authoritative backup/restore design, scratch rehydration, and disposable restore rehearsal |
| Upgrade instability | Pre-1.0, rapid `main`, previous versions best-effort | Pin exact image digest tied to a reviewed SHA; stage upgrades; record rollback digest and schema compatibility |
| Public data surface | Chat, media, invites, Git, admin, health, and metrics have different exposure needs | One reviewed TLS hostname; internal-only dependencies/probes; Git/admin disabled initially |

## Minimum safe evaluation shape

If the owner chooses to continue, the smallest responsible next step is a
separately approved evaluation—not a production activation:

1. Define one named use case, accountable owner, exact human/agent roster,
   permitted channels, retention, and explicit non-goals. “All agents can use
   it” is not yet a sufficient authority boundary.
2. Select an immutable multi-architecture image digest associated with a
   successful same-SHA CI run and accepted SBOM/vulnerability evidence. The
   assessed `sha-571c190` image failed that gate and is not a deployment
   candidate. Its exact artifacts now have a locally qualified Wolfi wrapper,
   but publishing and pinning that exact result remain separately authorized.
   Do not track `:main` or floating `:latest`.
3. Use the selected dedicated-device Tailscale Serve HTTPS/WSS topology, which
   preserves the existing OCI Nginx and host Tailscale Serve listeners; keep
   PostgreSQL, Redis, MinIO, health, metrics, and admin internal. The sidecar
   image must still pass its independent image gate.
4. Start closed: require signed REST auth and relay membership; disable Git web
   UI, admin UI, hosted multi-community mode, and unnecessary workflows.
5. Create separate keys for the owner, each human, and each named evaluation
   agent. Keep agent response policy `owner-only` or an explicit allowlist.
6. Run no agent harness in the relay container. Give each harness its own
   supervised process/container, working directory, Phase secret scope, and
   bounded tool surface.
7. Add edge rate limits, resource limits, safe structured log collection,
   internal metric scraping, and disk/database/connection alerts.
8. Prove admission denial, private-channel denial, revocation, restart
   persistence, backup, restore, rollback, and a small concurrent human/agent
   workload before allowing durable business data.

## Decision

**Feasible in principle for a private evaluation; Gate 0 is blocked only on a
qualified immutable official Tailscale ingress image.**

Buzz's architecture and ARM64 publication make it a credible collaboration
candidate for Aegis. Its separate human/agent identities and signed event trail
fit OvernightDesk's accountability goals. The current upstream maturity and
operational gaps, however, make immediate public/shared production exposure too
risky on a VM that already hosts trusted business workloads. A later deployment
decision should be based on a scoped specification and measured qualification,
not on the upstream quick start alone.
