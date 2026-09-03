# Gate 0 Current Image Requalification

**Captured**: `2026-09-02T20:51:03Z` through `2026-09-02T21:17:08Z`

**Object-store decision synchronized**: `2026-09-03`

**Task**: T057

**Scope of this record**: Primary-source and registry qualification of the
candidate image set. No image was published and no Aegis or production state
was read or changed.

**Result**: **incomplete / fail closed**. The refreshed Buzz Wolfi wrapper,
Redis candidate, and Chainguard `static` intake-worker base passed their local
ARM64 image contracts. The observed PostgreSQL image failed the vulnerability
gate, but a minimal exact-base wrapper replaced only its known-fixed OpenSSL
packages and passed. The official MinIO server and `mc` images are
historical, unmaintained artifacts without attestations or a declared non-root
user; they are not qualified for this new production deployment. ADR-009 now
requires a maintained, operation-level-qualified S3 implementation and names
RustFS only as the next provisional candidate to evaluate. Per the corrected
dependency order in `tasks.md`, qualification of the final first-party intake-
worker image occurs in T081 after T079 creates it.

## Method and meaning of the digests

The table below separates a mutable or human-readable tag observed at capture
time from the content-addressed identities that a future Compose file would
have to pin. `Index` is the multi-architecture manifest/index digest. `ARM64`
is the native `linux/arm64` child manifest that was inspected. A recorded
digest is an identity, not an approval.

Registry values were resolved with Docker Buildx `0.36.1` using
`docker buildx imagetools inspect`; Docker Hub's first-party tag API was used
as an independent cross-check for the Docker Hub images. Docker documents that
provenance describes how an image was built and that an SBOM describes its
contents: <https://docs.docker.com/build/metadata/attestations/>.

Local evidence used Docker Engine/CLI `29.7.2`, pinned Syft `1.51.0` at index
`sha256:678bfa565b60f747aac0f8e964fe5588a24445b8d0a480e91f6efd70020dfbb0`,
pinned Grype `0.116.1` at index
`sha256:1e71065c0a4cff3e6bd3b8add525ffac4343eb4971694eb90a31cf6d4d3e85db`,
and Grype DB schema `v6.1.9`, built `2026-09-02T06:35:12Z`. Chainguard
signature verification used its cosign image at immutable index
`sha256:09f41dc448b4f682105ae780585b5147015d1eef5b0de747b070956c817957f7`.
The two wrappers were exported twice with this Buildx argument contract:

```text
--platform linux/arm64 --no-cache --provenance=false
--build-arg SOURCE_DATE_EPOCH=<recorded-epoch>
--output type=oci,rewrite-timestamp=true
```

Syft and Grype then inspected the deterministic OCI archives rather than a
mutable local tag.

## Observed candidate snapshot

| Role / observed tag | Immutable index | Native Linux ARM64 manifest | Image-level user | Primary disposition |
| --- | --- | --- | --- | --- |
| Buzz relay `ghcr.io/block/buzz:sha-0dbd036` | `sha256:c83a228b1d9616c0ad47c38875264a6365c11b174aca75d52f88b15f1b98b97d` | `sha256:7d69b67fa4df5f42e7ca8b69db99e12ec8134c6b7353d1b446a9839c2e9fdc3f` | `buzz:buzz` (`1000:1000` in the Dockerfile) | qualified only as exact input to the locally qualified Wolfi wrapper |
| PostgreSQL `postgres:17.11-alpine3.23` | `sha256:9ae4e8f8d0284836a505f0b2e825144e32e20499856e7dc5f7b99e19d10eedd6` | `sha256:f2924e77eb4939843396c157a86e5545f8b5d7568c35a80eca7dfdb3a0fe764b` | wrapper declares `70:70` | qualified only as exact input to the locally qualified fixed-OpenSSL wrapper |
| Redis `redis:7.4.11-alpine3.21` | `sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf` | `sha256:f8d15882ba108587477ce13c00ab0551933a84138427b7cc9abadfbe45ffd973` | unset; explicit `999:1000` startup was proven locally | locally qualified candidate; Medium/Low findings accepted below |
| MinIO server `minio/minio:RELEASE.2025-09-07T16-13-09Z` | `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` | `sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f` | unset; root by default | rejected for a new production deployment |
| MinIO initializer `minio/mc:RELEASE.2025-08-13T08-35-41Z` | `sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727` | `sha256:37d109dddbbb2c95873f5fc81ac93f37023264770fc580a7564148892087b1b7` | unset; root by default | rejected for a new production deployment |
| Intake-worker base `cgr.dev/chainguard/static:latest` | `sha256:f51c2493951313c3ad4069080b2814ffb6ed6fe3909dabeb84a9482f42d5600b` | `sha256:80fa8f75e30e29e0a140b4fd40eb83d1b551b7ced913b95b7dbb65f12b67f82f` | `65532` (`nonroot`) | suitable pinned base; final worker image does not yet exist |

The previously recorded floating aliases resolve as follows, but they are not
candidate references: `postgres:17-alpine` resolved to the same PostgreSQL
17.11 family at index
`sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73`,
and `redis:7-alpine` resolved to the same Redis 7.4.11 Alpine image at index
`sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf`.
The explicit patch and base-distribution tags above are preferable audit
labels, but only the digests make them immutable.

Docker Hub tag API cross-checks:

- <https://hub.docker.com/v2/repositories/library/postgres/tags/17.11-alpine3.23>
- <https://hub.docker.com/v2/repositories/library/redis/tags/7.4.11-alpine3.21>
- <https://hub.docker.com/v2/repositories/minio/minio/tags/RELEASE.2025-09-07T16-13-09Z>
- <https://hub.docker.com/v2/repositories/minio/mc/tags/RELEASE.2025-08-13T08-35-41Z>

## Buzz relay

At capture time, the latest published relay image was the commit tag
`sha-0dbd036`. Its OCI index annotation and ARM64 image label both bind it to
source commit `0dbd036f5bff33e7ade75e7639f3218d424a6e73`. The index names image
workflow run `33667115364` and same-SHA qualifying CI run `33667115746`; both
official GitHub API records report `push`, that exact head SHA, and
`conclusion: success`:

- <https://github.com/block/buzz/commit/0dbd036f5bff33e7ade75e7639f3218d424a6e73>
- <https://github.com/block/buzz/actions/runs/33667115364>
- <https://github.com/block/buzz/actions/runs/33667115746>
- <https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/.github/workflows/docker.yml>

The ARM64 attestation manifest is
`sha256:887ca8cff4f22a66cc2e3440df59be584dbd69989cd1318eda8002710d91f39d`.
Its SLSA predicate identifies the source, revision, `Dockerfile`, native ARM64
build, `runtime` target, and build run. Buildx did not expose an embedded SBOM
for this exact index (`.SBOM` was `{}`), so an independent SBOM and current
vulnerability scan remain mandatory.

The exact image configuration declares `USER buzz:buzz`, working directory
`/var/lib/buzz`, and entrypoint `/usr/local/bin/buzz-relay`. The source
Dockerfile creates `buzz` as UID/GID `1000:1000`:
<https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/Dockerfile>.

Buzz's current security policy supports only the latest `main`; older releases
are best-effort and the project is pre-1.0:
<https://github.com/block/buzz/blob/83e596298449ab1cb57481221d0e41ce69e52814/SECURITY.md>.
The source `main` was already two commits ahead at
`83e596298449ab1cb57481221d0e41ce69e52814` when this capture ended. The
intervening files were Desktop-only, not relay/runtime files, but the fact is
still recorded rather than treating a fast-moving tag as immutable.

**Selection**: use
`ghcr.io/block/buzz@sha256:c83a228b1d9616c0ad47c38875264a6365c11b174aca75d52f88b15f1b98b97d`
as the exact artifact source for the refreshed local Wolfi-wrapper build. Do
not run the Debian upstream image directly.

The checked-in wrapper now pins the native ARM64 upstream manifest
`sha256:7d69b67...`, native ARM64 Wolfi-base manifest `sha256:6289b37...`,
source epoch `1788373530`, and exact package versions. Two uncached,
provenance-disabled OCI exports with timestamp rewriting were byte-identical:

- OCI manifest: `sha256:bee4673dbe4c2f0d98091ded7b1ae270d95a2787491200f2d77082265a0f5751`
- OCI config: `sha256:3969da077554f1cbf92ddc816718c60f0eb3b33d96d33982705d2e3cc439c9e4`
- OCI archive SHA-256: `ecf2c2452fe3712fccbe1e7a5e0a7364d861e3af67fbb8ff4c7354e21047857d`
- OCI archive size: `45,879,296` bytes
- Relay binary SHA-256 in both upstream and wrapper:
  `a469ab4ac806ef34c8d029b047a1e35bb66f2759278ff9d8207a8ca81d0b77ab`
- Independent CycloneDX 1.7 SBOM: 645 components, 38 dependency entries,
  SHA-256 `18deffd55db1b1cecb48352d4b0974823e0a9a7bc158c6ed5eb7b4ed5037840b`
- Grype result SHA-256:
  `09621d1d5089b7b9087ce03faca902735eaed67a03baa11b857f22b67fa8fd18`
- Scan result: one Medium (`CVE-2026-18374`, Wolfi `glibc-2.44` `2.44-r4`,
  no fixed package available), zero Critical/High/Low
- Contract result: 9/9 passing under ARM64 emulation, including UID/GID
  `1000:1000`, read-only root, network isolation, all capabilities dropped,
  `no-new-privileges`, writable `/data/git`, exact binary identity, runtime
  tools, config load, and expected synthetic-database failure

The Medium glibc finding is accepted for local progression because the scanner
reports no fix, the relay remains private and non-root with no capabilities,
and Critical/High remain zero. Publication of the wrapper is still a separate
remote-state decision.

## PostgreSQL

`postgres:17.11-alpine3.23` is a Docker Official Image. Its ARM64 manifest
annotates exact image-source commit
`2603e26e245e558218728ee14e0a42dcb020dc7f`, directory
`17/alpine3.23`, base `alpine:3.23`, and version `17.11-alpine3.23`. The
attached SLSA statement reports builder `https://github.com/docker-library`,
BuildKit build type, the same source commit/directory, and the same material.
The attached ARM64 SPDX document contained 67 package entries at capture time.

Primary sources:

- <https://hub.docker.com/_/postgres>
- <https://github.com/docker-library/postgres/blob/2603e26e245e558218728ee14e0a42dcb020dc7f/17/alpine3.23/Dockerfile>
- <https://github.com/docker-library/postgres/blob/2603e26e245e558218728ee14e0a42dcb020dc7f/docker-entrypoint.sh>

There is no image-level `USER`, so its default process begins as root. The
exact Dockerfile creates Alpine's `postgres` identity as UID/GID `70:70`; the
entrypoint owns the writable database/socket directories and re-executes itself
through `gosu postgres` before initialization or the server. Docker's official
documentation also supports a mostly arbitrary explicit user, with the caveat
that `PGDATA` ownership must match and `initdb` must be able to resolve the
effective user.

PostgreSQL's own support policy lists 17.11 as the current supported minor and
PostgreSQL 17 supported through `2029-11-08`; it recommends staying on the
current minor: <https://www.postgresql.org/support/versioning/>.

**Local result**: explicit UID/GID `70:70` successfully initialized an empty
tmpfs database and socket directory, became ready, executed a SQL identity and
database check, and stopped cleanly with a read-only root filesystem, no
network, all capabilities dropped, and `no-new-privileges`. All observed
PostgreSQL processes ran as `70:70`.

The independent CycloneDX 1.7 SBOM has 870 components and 38 dependency
entries; SHA-256
`6ca7252f5312856b335a4da24c7e0eebc48382e0cffacf7b9d06e5a4cf95f8e0`.
The Grype result SHA-256 is
`47d4f2b8d390e8aab44fcdc8da7e1c2cfa29eee1244d9f4ecc80286d89d6a177`.
It reports 4 Critical, 14 High, and 5 Medium matches. Every Critical/High
match is in Alpine `libcrypto3` or `libssl3` `3.5.7-r0`, and Grype identifies
`3.5.8-r0` as fixed.

**Disposition of the upstream digest**: reject it as a direct runtime. The
checked-in minimal wrapper retains that exact PostgreSQL 17.11 ARM64 base,
installs only `libcrypto3=3.5.8-r0` and `libssl3=3.5.8-r0`, and declares
`USER 70:70` with the upstream entrypoint and command. Two uncached,
provenance-disabled OCI exports with timestamp rewriting were byte-identical:

- OCI manifest: `sha256:00c9279ea5ade6c0e33c663324638bee0514b83b1068beced0b943a46e5baa81`
- OCI config: `sha256:94290f04906769edda580805634884ce939c9e6bcfca37a38470390c351aab4f`
- OCI archive SHA-256: `02914058af7777ae40d27aecb372a3f763e0e99c33745847278c7e4bd6fcbb51`
- OCI archive size: `117,344,256` bytes
- Independent CycloneDX 1.7 SBOM: 870 components, 38 dependency entries,
  SHA-256 `387bd6684a238718c3199d8520e8d15eb8584e6a21cd2586b4cafbeed76ef614`
- Grype result SHA-256:
  `a7efd697d626d207481c72c9afba20fcea75dd5db92b18fe0fff9155ec3302a3`
- Scan result: three Medium matches for one unfixed BusyBox CVE, zero
  Critical/High/Low
- Runtime result: empty-database initialization, readiness, SQL query, UID/GID
  `70:70`, read-only root, no network, all capabilities dropped,
  `no-new-privileges`, and graceful stop passed under ARM64 emulation

**Wrapper disposition**: provisionally accept for local progression. The
Medium BusyBox finding has no reported fix, while the known-fixed OpenSSL
Critical/High set is absent. Recheck for a refreshed Docker Official Image
before publication so the wrapper can be removed when the upstream digest is
clean. Do not silently jump to Chainguard's currently published PostgreSQL 18
image without a Buzz compatibility contract.

## Redis

`redis:7.4.11-alpine3.21` is a Docker Official Image. Its ARM64 manifest binds
to exact source commit `74654c612ee06275377d483dc4e134e57b463e9e`, directory
`alpine`, base `alpine:3.21`, and Redis `7.4.11`. Its attached SLSA statement
reports builder `https://github.com/docker-library`, BuildKit build type, and
that same source material.

Primary sources:

- <https://hub.docker.com/_/redis>
- <https://github.com/redis/docker-library-redis/blob/74654c612ee06275377d483dc4e134e57b463e9e/alpine/Dockerfile>
- <https://github.com/redis/docker-library-redis/blob/74654c612ee06275377d483dc4e134e57b463e9e/alpine/docker-entrypoint.sh>
- <https://redis.io/docs/latest/operate/oss_and_stack/install/version-mgmt/>
- <https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/release-notes/redisce/redisce-7.4-release-notes/>

There is no image-level `USER`; the default process starts as root. The exact
Dockerfile creates `redis` UID `999`, GID `1000`, and owns `/data`. When the
command is `redis-server`, the exact entrypoint changes ownership and re-execs
through `setpriv` as that identity. Docker Hub explicitly describes this
privilege drop and warns that protected mode is disabled in the image, making
the pilot's internal-only network and password requirements mandatory.

Redis lists 7.4 as an Extended, GA community release supported through
`2029-12-01`; 7.4.11 is the August 2026 security-fix release. Redis 7.4 is
dual-licensed under RSALv2 or SSPLv1 rather than the older BSD license:
<https://redis.io/legal/licenses/>. This record makes no legal determination;
the current internal, unmodified use is materially narrower than a managed
Redis service.

**Local result**: explicit UID/GID `999:1000` started successfully with append
only mode and password authentication, returned `PONG`, stored and retrieved a
synthetic value, and stopped cleanly with a read-only root filesystem, no
network, all capabilities dropped, and `no-new-privileges`.

The first ARM64-emulated run correctly stopped on Redis's host-kernel
`ARM64-COW-BUG` check. Repeating the probe with only the documented
emulator-specific warning acknowledgement passed. That acknowledgement is not
part of the candidate production configuration; native Aegis startup must run
without it. The independent CycloneDX 1.7 SBOM has 710 components and 14
dependency entries; SHA-256
`55d3d4f35d12efd3e1afefe8e7c41fb11ce7c4755ebb1aea5f9a97e0e497df5a`.
The Grype result SHA-256 is
`1eba18d6222af7993743189d1b3976ff2b7e097af6ec942df86e65bf4eec0c9c`.
It reports zero Critical/High, three Medium BusyBox matches for one unfixed CVE,
and two Low Redis matches without fixes.

**Disposition**: accept this digest for local progression. T073 must preserve
password authentication, explicit non-root execution, read-only root,
allowlisted `/data`, no host publication, and append-only persistence. Native
startup, persistence, resource-limit, and restore contracts remain later
implementation evidence rather than properties of this registry image alone.

## MinIO server and `mc` initializer

The two versioned tags match Buzz's own production Compose example at the
latest published relay commit:
<https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/deploy/compose/compose.yml>.
They have native ARM64 manifests, but that is only an availability fact.

The official server tag resolves through the annotated Git tag to source
commit `07c3a429bfed433e49018cb0f78a52145d4bedeb`; the `mc` tag resolves to
`7394ce0dd2a80935aded936b09fa12cbb3cb8096`:

- <https://github.com/minio/minio/releases/tag/RELEASE.2025-09-07T16-13-09Z>
- <https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z>
- <https://github.com/minio/minio/blob/07c3a429bfed433e49018cb0f78a52145d4bedeb/Dockerfile.release>
- <https://github.com/minio/mc/blob/7394ce0dd2a80935aded936b09fa12cbb3cb8096/Dockerfile.release>

Neither index contains an attestation manifest, and neither image declares a
`USER`; both default to root. The exact server release Dockerfile starts from
mutable `golang:1.24-alpine` and `ubi9/ubi-micro:latest` bases. It verifies the
downloaded server and bundled `mc` binaries with MinIO's minisign key, but the
runtime image does not cryptographically bind the Docker Hub manifest to the
Git source or build environment. Its entrypoint labels identity switching
through `MINIO_USERNAME`/`MINIO_GROUPNAME` as deprecated and unsupported:
<https://github.com/minio/minio/blob/07c3a429bfed433e49018cb0f78a52145d4bedeb/dockerscripts/docker-entrypoint.sh>.
The exact `mc` release Dockerfile also uses mutable UBI `latest` bases and adds
the release binary without a signature-verification step in that Dockerfile.

More importantly, the official MinIO repository is archived and its current
README states that it is no longer maintained, community distribution is now
source-only, historical precompiled releases will not receive updates, and
community support is best-effort without warranty:
<https://github.com/minio/minio#source-only-distribution>. The `minio/mc`
repository is also archived. GitHub's first-party repository API exposed
`archived: true` for both at capture time:

- <https://api.github.com/repos/minio/minio>
- <https://api.github.com/repos/minio/mc>

**Selection**: none. These historical images fail the maintenance,
provenance, and explicit non-root portions of the new-production image gate
before startup testing. A supplementary current Grype scan also reported 13
Critical/69 High matches in the server and 2 Critical/26 High matches in `mc`.
Scanning them cannot turn an unmaintained artifact into a supported candidate.
ADR-009 resolves the architecture question by requiring a currently maintained
S3-compatible object store that passes both the image gate and the exact Buzz
operation contract. It does not approve a specific replacement. The public
Chainguard MinIO fork was also inspected but not selected:
its current ARM64 image still contains two fixed High gRPC matches, and adopting
a fork remains an architecture/support decision.

Garage `v2.3.0` was separately prequalified and rejected as a drop-in
replacement. Its official compatibility documentation says bucket versioning
and `ListObjectVersions` are missing, while Buzz uses version listing and exact
version deletion as active community-deletion contracts. Garage also documents
conditional writes as an architectural limitation, which conflicts with
Buzz's default-on Git object-store conformance gate. Its public ARM64 image is
available but defaults to root and exposes no verifiable registry provenance or
SBOM. The complete primary-source record is in
[`garage-prequalification.md`](garage-prequalification.md). Deferring versioning
does not qualify Garage against the pinned Buzz relay.

## Intake-worker base

The planned intake worker has not been implemented, so no final worker image
can be qualified. `ghcr.io/block/buzz-sprig` is not an acceptable substitute:
it is Buzz's general remote-agent runtime and does not implement the pilot's
fixed signed-owner/channel checks or its fixed-target Hermes Runs mapping.

For the repository's preferred Go implementation, the minimal runtime base
candidate is the exact Chainguard `static` index recorded above. The ARM64
image configuration declares `User: 65532`, no shell, and no entrypoint. The
public locked configuration committed at
`4d689a29b09b97e5c05edf2bb80e35ab06cd47a5` specifies native ARM64,
`nonroot` UID/GID `65532:65532`, and only the CA bundle, timezone data, and
base layout packages:

- <https://github.com/chainguard-images/images/blob/4d689a29b09b97e5c05edf2bb80e35ab06cd47a5/images/static/locked_config.json>
- <https://github.com/chainguard-images/images/blob/main/images/static/README.md>
- <https://github.com/chainguard-images/images/blob/main/BEST_PRACTICES.md>

Chainguard documents that public `latest` is a moving tag, public images are
built for ARM64 and AMD64 from pinned reproducible `apko` configurations, and
published images include SBOMs and cosign attestations:
<https://github.com/chainguard-images/images#how-images-are-built>. It also
recommends digest pins because tags are mutable:
<https://edu.chainguard.dev/chainguard/containers/staying-secure/updating-images/considerations-for-image-updates/>.

**Selection**: use
`cgr.dev/chainguard/static@sha256:f51c2493951313c3ad4069080b2814ffb6ed6fe3909dabeb84a9482f42d5600b`
as the candidate final stage only if the worker is built as a statically linked
`linux/arm64` Go binary (`CGO_ENABLED=0`) and sets its own exact entrypoint.
The exact index signature was verified with cosign using issuer
`https://token.actions.githubusercontent.com` and identity
`https://github.com/chainguard-images/images/.github/workflows/release.yaml@refs/heads/main`;
the certificate names workflow commit
`f136e313b70ec422af6038cbaf18a56370339bc3`. Its published SPDX 2.3
attestation binds three packages to the selected index digest. An independent
CycloneDX 1.7 SBOM has 1,223 components and 2 dependency entries; SHA-256
`710aab332bfebc2d6ecf18c76b0ce2f23ec02aee6cca56b8894d40f77cc4b34e`.
The Grype JSON SHA-256 is
`5e9fb6146477476057804cee6c512732e3e6a18120529170eebb576327d76a73`
and contains zero matches.

**Disposition**: qualified as a final-stage base only. The final worker build
must generate provenance and an SBOM for the whole image. A base-image
selection is not qualification of unspecified application code.

## Approved pins versus candidates

No production image pin is approved by this record.

| Role | Candidate may advance to local qualification? | Production pin approved? | Blocking evidence or decision |
| --- | --- | --- | --- |
| Buzz Wolfi wrapper | yes; local image gate passed | no | registry publication and later composed-service qualification |
| PostgreSQL wrapper | yes; local image gate passed | no | prefer a refreshed clean official digest if one appears before publication; otherwise publish and pin the qualified wrapper separately |
| Redis | yes; local image gate passed | no | native/composed persistence, limits, and restore evidence |
| MinIO server | no | no | unmaintained historical distribution; replacement required |
| MinIO `mc` initializer | no | no | archived source, no attestation, root default; replacement required |
| RustFS | not yet; next candidate for T057 prequalification | no | current release/image and documented operation support not yet captured; executable Buzz qualification follows in T070/T081 |
| Intake worker | base passed; final image is deferred to T081 | no | T079 must create the worker before whole-image qualification is possible |

## Required next evidence

T057 remains unchecked. Before it can pass:

1. Prequalify the current RustFS release, native ARM64 image, initializer path,
   maintenance/provenance/SBOM/vulnerability/non-root posture, persistence, and
   documented support for every Gate 0 requirement in
   [`object-store.md`](../contracts/object-store.md). If it fails, evaluate a
   different maintained candidate under the same gate rather than weakening
   the contract.

T057 may record a provisional local candidate after that evidence passes. Final
selection still requires the executable exact-Buzz operation matrix in T070 and
the complete local qualification in T081.

The final route-configured Go intake worker will be built from the pinned
`static` base in T079 and its whole-image evidence will be captured in T081.
That dependency does not block T057's base-image decision.

All remaining work is local Gate 0 work. Publishing a Buzz wrapper or worker
image, pulling onto Aegis, assigning production secrets, creating identities,
or activating any service requires later and separately scoped authorization.
