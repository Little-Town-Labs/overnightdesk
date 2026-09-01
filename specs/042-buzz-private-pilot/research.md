# Research: Buzz Private Pilot on Aegis

**Date**: 2026-09-01

**Detailed assessment**: [Buzz on Aegis feasibility](../../docs/research/buzz-aegis-feasibility.md)

## Decisions

### Require an immutable ARM64 candidate

**Decision**: Require a Buzz source/image pair with an immutable ARM64 index
digest, successful same-SHA CI, provenance, an SBOM, and an accepted
vulnerability posture immediately before implementation. The initially
assessed source `571c1902d0ca55cfd4ccf6b91eeb731909cc10be` and relay index
digest `sha256:aa5180ce58ac367a125a1c079bfde88f8c158daa99e1aa5df86e8814649669f5`
failed the independent vulnerability check and are rejected for deployment.

**Rationale**: Upstream is pre-1.0 and supports `main` actively; a floating tag
would make qualification and rollback irreproducible.

**Rejected**: `:main`, `:latest`, and source builds directly on Aegis.

### Use a dedicated tailnet device for private ingress

**Decision**: Keep application, health, metrics, database, Redis, MinIO, and
management ports unpublished and omit bundled Caddy. Create a dedicated
tag-owned Tailscale device named `buzz` and use Serve HTTPS/WSS at
`buzz.tail5c4f73.ts.net` with Funnel disabled. Run Tailscale in userspace mode
and have the relay share its network namespace so Serve can proxy only to relay
loopback. Do not edit or displace the host's existing Nginx or Tailscale Serve
listeners.

**Rationale**: Official Tailscale documentation restricts Serve HTTP proxy
targets to loopback and documents the shared-network-namespace container
pattern. A separate device supplies an independent MagicDNS name, certificate,
tag policy, state, and rollback handle without contending for the existing
device root handler.

**Rejected**: Treating `10.0.0.234` as a Tailscale address, Buzz's optional
Caddy override, direct relay port publication, or displacing the existing
Tailscale Serve handler implicitly. Adding a path under the existing host name
was also rejected because it couples Buzz rollback and route ownership to the
current `ob1-mcp` device.

### Repackage exact Buzz artifacts only when the runtime is reproducible

**Decision**: A relay wrapper may copy the exact upstream ARM64 relay binary
and web assets into a smaller current runtime, but it may not rebuild or patch
Buzz. It must freeze its base digest and runtime package versions, preserve the
required Git/cURL/OpenSSL/CA/glibc/libgcc behavior, run as `1000:1000`, produce
a new immutable OCI digest/SBOM/scan, and pass integration tests.

**Rationale**: The original vulnerabilities are in the runtime operating-system
packages. A wrapper can refresh those packages while keeping the application
artifact identical and the change independently auditable.

**Rejected**: Accepting the original image through a configuration exception,
building a source fork, or treating a successful process start as complete
qualification.

**Qualification evidence**: A Debian Trixie wrapper ran correctly but scanned
with 40 Critical and 62 High matches and was rejected. The promoted,
digest-pinned Wolfi wrapper freezes all package versions, runs the exact ARM64
relay artifact as `1000:1000`, includes the required helper tools, produced
byte-identical OCI archives across two uncached builds, passed 9/9 runtime
contracts, and produced zero Grype matches. Its qualified local manifest is
`sha256:f98fe0e1cc0e66c547adbe325f93df48fb0c451753983e95abb6b89c97da54a2`;
publishing it as a registry reference remains separately authorized.

### Require the ingress image to pass the same gate

**Decision**: Treat the Tailscale sidecar as a first-class runtime image. Pin
and scan it independently, prove userspace startup as an explicit non-root
UID/GID with writable state/socket paths, and reject it on undisposed
Critical/High findings.

**Rationale**: Moving the trust boundary into a sidecar does not justify a
weaker supply-chain or runtime standard.

**Prototype evidence**: Official `tailscale/tailscale:stable` resolved to index
`sha256:8c42c4574ab066384fcb72f69e086a2ff1dd3652eb6f56856cee34bcf0d2f680`
and ARM64 Tailscale 1.102.3. Userspace startup succeeded under UID/GID 65532
with a writable state/socket path, but its preliminary scan reported 2 Critical
and 22 High matches, including fixes available in later dependency versions.
It is rejected pending a fixed immutable upstream release.

### Preserve upstream stores but minimize feature use

**Decision**: Operate PostgreSQL, Redis, MinIO, and local Git scratch as
isolated state boundaries, while disabling Git web, workflows, admin, large
media, and multi-community. PostgreSQL and object storage are authoritative;
the selected source explicitly describes local Git data as disposable scratch
that is hydrated from object storage per request.

**Rationale**: These stores are coupled to the shipped relay even when optional
features are not used. Removing them would create a fork before viability is
known; minimizing feature use reduces data and recovery risk.

**Rejected**: Sharing existing databases or object stores and modifying Buzz to
remove stores for the first pilot.

### Use a new canary rather than an existing agent

**Decision**: Build/supervise one distinct Buzz adapter with a new key, one
channel, owner-only responses, no MCP/tools, bounded work, and revocation tests.

**Rationale**: Existing Hermes containers do not currently ship a Hermes ACP
executable, and the relay image does not include `buzz-cli` or `buzz-acp`.
Reusing Walter/Titus/Trevor would mix identity, memory, data, and authority.

**Rejected**: Embedding the adapter in the relay, sharing an owner key, enabling
`respond-to anyone`, or connecting an existing production agent in MVP.

### Follow the established disabled-first Aegis seam

**Decision**: Mirror the source-verified deployment stages in
`infra/open-webui/walter/deploy-aegis.sh`: local qualification, root-owned
prepare, disabled install, private inspection, separate route enablement,
public/private behavior checks, log sentinel, and state-preserving rollback.

**Rationale**: This is the repository's proven production integration seam and
explicitly separates installation, verification, reachability, and rollback.

**Rejected**: One-shot `docker compose up` deployment or ad hoc long-lived
containers.

### Require a coherent recovery set

**Decision**: Add authoritative Buzz PostgreSQL and MinIO data, Redis diagnostic
state, and safe configuration metadata to the encrypted producer; recreate
local Git scratch and prove logical repository state rehydrates after an
isolated restore before owner admission.

**Rationale**: Buzz spans multiple stores and upstream provides a checklist,
not an automated recovery guarantee. The general Aegis backup repair is
verified, but it does not yet cover Buzz.

**Rejected**: Treating successful container startup, volume archives alone, or
the existing baseline backup as proof of Buzz recoverability.

## Verified Baseline

- Aegis is ARM64 with 4 OCPUs, 23 GiB RAM, about 18 GiB then available, and 73
  GiB free disk.
- Nineteen named containers were healthy at assessment time.
- Docker Compose v5.3.1 exceeds Buzz's documented minimum.
- Nginx publishes 80/443 on the OCI interface `10.0.0.234`. Host Tailscale uses
  `100.100.1.21`; Tailscale Serve already owns tailnet HTTPS on port 443 and
  proxies the root path to `ob1-mcp`. The approved Buzz design uses a separate
  device and therefore does not modify either listener.
- The encrypted backup producer completed successfully on 2026-09-01 with 64
  artifacts, 689,390,615 encrypted bytes, exit zero, and `COMPLETE`.
- Buzz publishes ARM64 relay images but no upstream runtime sizing baseline or
  resource limits.
- Current source includes Redis-backed fixed-window admission limiting despite
  stale architecture documentation; edge connection/body/time limits remain
  required.

## Open Items Resolved During Implementation Preflight

These are bounded configuration choices, not scope questions:

- final qualified relay and Tailscale image digests;
- Phase app/environment/path names and exact service accounts;
- per-container limits within the combined ceiling;
- exact RPO/RTO targets after measured backup/restore duration;
- whether the adapter uses `buzz-acp` directly or a narrower `buzz-cli`
  wrapper after local protocol qualification;
- exact alert transport already approved for Aegis.
