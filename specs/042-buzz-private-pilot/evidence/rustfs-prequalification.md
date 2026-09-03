# RustFS prequalification for Buzz T057

**Evidence snapshot:** 2026-09-03

**Buzz source under review:** `0dbd036f5bff33e7ade75e7639f3218d424a6e73`

**RustFS release under review:** `1.0.0-rc.5`

**RustFS source commit:** `40a2470feb567201165a5b809b7598bb4b1f68f5`

**Disposition:** **REJECT / fail closed; not a provisional Buzz candidate**

This is a bounded Gate 0 review of primary upstream sources, registry metadata,
and read-only local inspection of the exact artifact. It does not approve an
object store, publish an image, change Compose, or access Aegis or production.
Executable Buzz conformance remains T070/T081 work and was not performed here.

## Executive finding

RustFS is the first replacement considered here that has strong source-level
evidence for Buzz's difficult S3 operations. Its exact source contains tests
for conditional `PutObject`, concurrent `If-None-Match: *` races,
`ListObjectVersions`, delete markers, and exact-version deletion. The official
ARM64 image is non-root and carries BuildKit provenance plus an attached SPDX
SBOM.

Those positives do not admit `1.0.0-rc.5` at Gate 0:

1. There is no stable RustFS release. GitHub marks `1.0.0-rc.5` as a
   prerelease, while the upstream security policy simultaneously says only
   “Latest” is supported and every version below 1.0 is unsupported. The
   currently published candidate therefore has no unambiguous supported
   release status ([release](https://github.com/rustfs/rustfs/releases/tag/1.0.0-rc.5),
   [security policy](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/SECURITY.md)).
2. The official CI run on the exact release commit failed overall. In
   particular, `S3 Implemented Tests` reported 539 passing tests but exited 1
   on a `BucketNotEmpty` teardown error in an encrypted-copy case. The full E2E
   merge gate failed before executing its selected tests because the recorded
   selection digest no longer matched. These failures do not prove that
   Buzz's required operations are broken, but they leave both upstream release
   gates red; no later successful same-commit run of either named check was
   observed ([CI run](https://github.com/rustfs/rustfs/actions/runs/33538717337),
   [S3 failure](https://github.com/rustfs/rustfs/actions/runs/33538717337/job/99965642032),
   [E2E failure](https://github.com/rustfs/rustfs/actions/runs/33538717337/job/99963264364)).
3. A current independent scan of the exact ARM64 image found fixed-but-unpatched
   findings in the installed `curl`/`libcurl` packages. Upstream's own image
   scan cannot close this gap because it ignores unfixed findings, considers
   only Critical/High, and deliberately uses exit code 0
   ([image workflow](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/.github/workflows/docker.yml#L472-L516)).
4. The official single-node guidance says that SNSD has no redundancy and must
   rely on backups, but no supported object-data backup and restore procedure
   or consistency contract was found. A persistent volume is not itself a
   backup ([installation topology](https://docs.rustfs.com/en/installation),
   [container persistence](https://docs.rustfs.com/en/installation/container/podman)).
5. The official `rc` client can create the bucket and scoped identities, but
   its image/initializer artifact has not been independently qualified. The
   candidate therefore does not yet meet the requirement for a digest-bound,
   one-shot, least-privilege initializer
   ([RustFS IAM model](https://docs.rustfs.com/en/security-compliance/iam),
   [`rc` commands](https://github.com/rustfs/cli#admin-operations-iam)).

Do not weaken the Buzz contract, disable its Git probe, or advance this digest
to T070/T073. Recheck after RustFS publishes a stable release whose exact
source commit has green S3/E2E checks and a clean or explicitly accepted image,
then qualify a one-shot initializer and a supported backup/restore mechanism.

## Requirement-by-requirement decision matrix

Statuses are deliberately strict: **Proven** means the exact `rc.5` source or
immutable artifact supplied sufficient evidence for that requirement;
**Failed** means exact-release evidence contradicts the requirement;
**Unproven** means no adequate upstream or local evidence/method exists; and
**Requires Buzz validation** means upstream evidence is promising but only the
unchanged Buzz workload, deployment fixture, or Aegis host can decide it. A
Buzz-only check marked `Requires Buzz validation` was **not run** because the
candidate already failed Gate 0; it is not a pass or a waiver.

| Buzz approval requirement | Status | Exact-release evidence and remaining proof |
| --- | --- | --- |
| Stable release with unambiguous security support | **Failed** | `1.0.0-rc.5` is explicitly a prerelease. The [security policy](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/SECURITY.md) says both “Latest” is supported and `< 1.0` is unsupported, leaving the current prerelease's support status contradictory rather than unambiguous. |
| Successful upstream S3 compatibility and full E2E for the exact release commit | **Failed** | The exact-commit [CI run](https://github.com/rustfs/rustfs/actions/runs/33538717337) failed. The commit's only `S3 Implemented Tests` check and only `End-to-End Tests (full merge gate)` check both concluded failure ([S3 job](https://github.com/rustfs/rustfs/actions/runs/33538717337/job/99965642032), [full-E2E job](https://github.com/rustfs/rustfs/actions/runs/33538717337/job/99963264364)). |
| Native Linux ARM64 container pinned by immutable digest | **Proven** | Official GHCR index `sha256:c36b3efea3d1e503f1a2581abd0e7611e0e5820dd30e1850a52384b3fc52bda4` contains native `linux/arm64` manifest `sha256:f664ef3f971f7b99ac34bce467e1246511b87eeb62487e063b5d45bcf5b0186b`; both exact values appear in the [official package record](https://github.com/rustfs/rustfs/pkgs/container/rustfs/1198172886?tag=1.0.0-rc.5). |
| Verifiable build provenance and inspectable SBOM | **Unproven** | The index has digest-bound BuildKit SLSA provenance and an attached SPDX SBOM, and the release has SLSA/CycloneDX artifacts ([workflow](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/.github/workflows/docker.yml#L436-L467), [release SBOM](https://github.com/rustfs/rustfs/releases/download/1.0.0-rc.5/rustfs-1.0.0-rc.5.sbom.cdx.json), [release provenance](https://github.com/rustfs/rustfs/releases/download/1.0.0-rc.5/rustfs-1.0.0-rc.5.provenance.json)). The chain identifies the source revision and verifies the downloaded binary digest, but no publisher signature was found for the image, tag, or provenance. Buzz has not defined or accepted this unsigned provenance trust model. |
| No unresolved Critical/High vulnerabilities; decisions for every lower finding | **Failed** | `rc.5` is outside every vulnerable range in the 34 [published first-party advisories](https://github.com/rustfs/rustfs/security) as of the snapshot, including the newest High fixes in `beta.12`/`rc.1`. That positive source review is insufficient: upstream Trivy ignores unfixed findings and cannot fail the build ([workflow](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/.github/workflows/docker.yml#L472-L516)), while the independent exact-ARM64 scan still has 16 Medium and 20 Unknown findings with no Buzz acceptance decisions. |
| Non-root execution with read-only container filesystem | **Requires Buzz validation** | The exact [Dockerfile](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/Dockerfile#L69-L123) sets UID/GID `10001:10001`; bounded local emulated startup survived a read-only root with `/data` and `/logs` writable. The final Compose/Aegis security context and an exact-image functional run remain unbuilt and untested. |
| Writable locations limited to RustFS data and logs | **Requires Buzz validation** | The exact [Dockerfile](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/Dockerfile#L69-L123) owns `/data` and `/logs`, and the [entrypoint](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/entrypoint.sh#L220-L294) creates configured data/log directories. Final mount discovery and mutation assertions under the Buzz fixture were not run. |
| No public S3, Console, admin, health, or metrics ports | **Requires Buzz validation** | The [image declares](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/Dockerfile#L89-L123) 9000/9001, but `EXPOSE` is metadata rather than a host publication. Only the future Compose/Aegis network and firewall checks can prove that every RustFS surface is private; they were not run. |
| Qualified one-time initializer: create private bucket; strict durability; versioning; scoped Buzz credentials; deny anonymous access; exit without retained admin access | **Unproven** | The official [`rc` command surface](https://github.com/rustfs/cli#command-overview) can create buckets, enable versioning, manage policies/users/service accounts, and manage anonymous rules. [Strict durability](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/operations/durability-modes.md) is a server/admin setting and new buckets otherwise default to `relaxed`. No immutable ARM64 initializer artifact, exact policy, idempotent execution, secret-handling proof, or post-exit authority check has been qualified. |
| Path-style addressing | **Requires Buzz validation** | [Documented/default client behavior](https://docs.rustfs.com/en/installation/windows) is promising; Buzz's exact `rust-s3` configuration was not run against the immutable image. |
| `PUT`, `GET`, `HEAD`, and `DELETE` | **Requires Buzz validation** | [Claimed supported](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/architecture/s3-compatibility-matrix.md) and represented in upstream tests, but the exact release's implemented-S3 check is red and Buzz did not execute these calls. |
| `If-Match` and `If-None-Match` conditional writes | **Requires Buzz validation** | [Exact-source tests](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/reliant/conditional_writes.rs) cover matching, mismatching, missing-object, and wildcard cases; a [cluster test](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/cluster_concurrency_test.rs#L43-L216) covers a concurrent one-winner case. Buzz's unchanged Git startup probe and race tests were not run. |
| Byte-range reads | **Requires Buzz validation** | Listed in the exact-source [compatibility matrix](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/architecture/s3-compatibility-matrix.md) and [implemented-test inventory](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/scripts/s3-tests/implemented_tests.txt); Buzz media range semantics were not run. |
| Multipart uploads and downloads | **Requires Buzz validation** | Exact-source evidence covers multipart upload create/part/complete/abort and [conditional completion](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/reliant/conditional_writes.rs#L145-L260). Buzz's client thresholds, retries, streaming/parallel range-download behavior, and error semantics were not run. |
| Paginated object listings | **Requires Buzz validation** | The exact-source [matrix](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/architecture/s3-compatibility-matrix.md) and [test inventory](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/scripts/s3-tests/implemented_tests.txt) list `ListObjectsV2` continuation behavior; Buzz's client pagination and boundary cases were not run. |
| Object metadata and tags | **Requires Buzz validation** | The exact-source [matrix](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/architecture/s3-compatibility-matrix.md) lists user metadata and object-tagging support; Buzz round trips were not run. |
| Bucket versioning and `ListObjectVersions` | **Requires Buzz validation** | Exact-source [version tests](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/version_id_regression_test.rs) and [listing regressions](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/list_object_versions_regression_test.rs) exercise enabled/suspended buckets, versions, delete markers, and prefixes. Buzz's dual key/version-marker pagination was not run. |
| Exact-version and delete-marker deletion | **Requires Buzz validation** | [Exact-source regressions](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/delete_regression_test.rs#L241-L378) delete a specified object version and delete-marker version. Buzz's bulk identifiers, retries, `null` versions, and final-emptiness checks were not run. |
| Buzz's unchanged Git-storage startup probe | **Requires Buzz validation** | Not run because Gate 0 failed. The [Buzz startup gate](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/main.rs#L495) is default-on and fatal; source-level similarity to RustFS conditional-write tests is not application evidence. |
| Buzz media, Git, community-deletion, and storage-sweep tests | **Requires Buzz validation** | Not run because Gate 0 failed. The [media store](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/src/storage.rs), [Git store](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/api/git/store.rs), [deletion pipeline](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-deletion/src/lib.rs#L1208), and sweep must all execute unchanged against the final digest and hardened fixture. |
| Persistence across clean and unexpected RustFS restarts | **Requires Buzz validation** | [`/data` persistence](https://docs.rustfs.com/en/installation/container/podman) and [strict durability](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/operations/durability-modes.md) are documented, but no exact-image clean restart, kill/restart, or post-restart object/version/delete-marker assertions were run. |
| Documented usable backup/restore preserving objects, versions, delete markers, credentials, and RustFS metadata | **Unproven** | The [single-node guidance](https://docs.rustfs.com/en/installation) says to rely on backups, but no supported complete object-data backup/restore procedure or consistency contract was found. `rc mirror`, replication, and a persistent volume do not by themselves prove preservation of the required state. |
| Isolated restore coordinated with matching PostgreSQL backup | **Requires Buzz validation** | Not run because Gate 0 failed, and it cannot be designed credibly until the missing RustFS backup/restore method and consistency boundary exist. |
| Acceptable resource use on the Aegis ARM64 host | **Requires Buzz validation** | Not run; no upstream benchmark can substitute for the exact Buzz workload, limits, disk, and Aegis host. |
| Every requirement proven against the exact immutable deployed image | **Failed** | Only artifact identity, selected image inspection, and a bounded hardened startup check reached the immutable ARM64 child. Required upstream gates failed and the initializer, Buzz suites, restarts, recovery rehearsal, exposure checks, and Aegis resource run are absent. |

## Release and immutable image identity

The GitHub Releases API returned no non-prerelease “latest” release; the newest
published release was `1.0.0-rc.5`, published 2026-09-02 and explicitly marked
prerelease ([release record](https://github.com/rustfs/rustfs/releases/tag/1.0.0-rc.5)).
The annotated tag object `bba4ea767c14818f5d39c5db5cfdb158a3b8b1c9`
is unsigned and resolves to commit
`40a2470feb567201165a5b809b7598bb4b1f68f5`; the commit itself carries a valid
GitHub signature ([tag API](https://api.github.com/repos/rustfs/rustfs/git/tags/bba4ea767c14818f5d39c5db5cfdb158a3b8b1c9),
[commit API](https://api.github.com/repos/rustfs/rustfs/commits/40a2470feb567201165a5b809b7598bb4b1f68f5)).

The exact source is licensed under Apache License 2.0
([license](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/LICENSE)).
That is an acceptable redistribution and modification posture in principle;
it does not resolve the candidate's ambiguous support status or other Gate 0
blockers.

The official GHCR package publishes native Linux AMD64 and ARM64 images. The
lighter musl image is the relevant candidate; the glibc variant is not needed
for Buzz.

| Item | Exact value | Evidence |
| --- | --- | --- |
| Human tag | `ghcr.io/rustfs/rustfs:1.0.0-rc.5` | [official package version](https://github.com/rustfs/rustfs/pkgs/container/rustfs/1198172886?tag=1.0.0-rc.5) |
| Multi-architecture index | `sha256:c36b3efea3d1e503f1a2581abd0e7611e0e5820dd30e1850a52384b3fc52bda4` | [official package version](https://github.com/rustfs/rustfs/pkgs/container/rustfs/1198172886?tag=1.0.0-rc.5) |
| Native `linux/arm64` manifest | `sha256:f664ef3f971f7b99ac34bce467e1246511b87eeb62487e063b5d45bcf5b0186b` | [official package version](https://github.com/rustfs/rustfs/pkgs/container/rustfs/1198172886?tag=1.0.0-rc.5) |
| ARM64 attestation manifest | `sha256:1f9127a617945168f79cf31a138bcd075bf9bd2a4a71bb584c12ce01639c90c0` | Registry index inspection; publication mechanism is the [exact image workflow](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/.github/workflows/docker.yml#L436-L467) |
| ARM64 release binary | `rustfs-linux-aarch64-musl-v1.0.0-rc.5.zip`, `sha256:686657d95d399648ffe441e2b5152baa98cbd2c196e582d04b3e11c34691e5a6` | [release assets](https://github.com/rustfs/rustfs/releases/tag/1.0.0-rc.5) |

Only digest references are immutable. The `rc`, `latest`, and moving release
asset aliases are not candidate pins.

## Provenance, SBOM, signature, and vulnerability posture

Registry inspection found BuildKit SLSA provenance for both runtime
architectures. The ARM64 predicate names source
`https://github.com/rustfs/rustfs`, revision
`40a2470feb567201165a5b809b7598bb4b1f68f5`, `Dockerfile`, and builder run
`33577946836`. The image workflow explicitly enables `provenance: true` and
`sbom: true` ([workflow](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/.github/workflows/docker.yml#L436-L467),
[builder run](https://github.com/rustfs/rustfs/actions/runs/33577946836)).

The attached ARM64 SPDX 2.3 document contains 36 package records. It identifies
the base/runtime packages but does not identify the downloaded RustFS binary
or its Cargo dependency graph. The release separately publishes a CycloneDX
1.6 SBOM with 1,128 components, including RustFS `1.0.0-rc.5`, and a SLSA
provenance JSON whose subjects include the exact ARM64 musl archive digest
([release SBOM](https://github.com/rustfs/rustfs/releases/download/1.0.0-rc.5/rustfs-1.0.0-rc.5.sbom.cdx.json),
[release provenance](https://github.com/rustfs/rustfs/releases/download/1.0.0-rc.5/rustfs-1.0.0-rc.5.provenance.json)).
The Dockerfile verifies the release asset's GitHub-recorded SHA-256 before
copying the binary into the runtime image, providing a traceable chain between
those two evidence sets
([Dockerfile](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/Dockerfile#L16-L66)).

No Cosign/Sigstore image-signing step or signature artifact was found in the
exact image workflow. The OCI attestations are digest-bound within the index,
but this review did not verify a separate publisher signature. The annotated
release tag is also unsigned, although its target commit is GitHub-verified
([tag API](https://api.github.com/repos/rustfs/rustfs/git/tags/bba4ea767c14818f5d39c5db5cfdb158a3b8b1c9),
[image workflow](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/.github/workflows/docker.yml)).

The first-party GitHub advisory review and the container-package scan must
remain distinct. GitHub listed 34 published RustFS advisories at the evidence
snapshot: 4 Critical, 14 High, 12 Medium, and 4 Low. `1.0.0-rc.5` is outside
every advisory's published vulnerable-version range. In particular, the most
recent High advisories were patched in `1.0.0-beta.12` or `1.0.0-rc.1`
([repository advisories](https://github.com/rustfs/rustfs/security),
[`GHSA-j548-9grx-fh4f`](https://github.com/rustfs/rustfs/security/advisories/GHSA-j548-9grx-fh4f),
[`GHSA-6r96-hmgc-726c`](https://github.com/rustfs/rustfs/security/advisories/GHSA-6r96-hmgc-726c),
[`GHSA-v9cp-qfw9-9pfp`](https://github.com/rustfs/rustfs/security/advisories/GHSA-v9cp-qfw9-9pfp),
[`GHSA-5w8r-p896-6vq2`](https://github.com/rustfs/rustfs/security/advisories/GHSA-5w8r-p896-6vq2)).
That is positive first-party evidence, not proof that every image package is
clean or that no undisclosed issue exists.

Two image-scan observations also must remain distinct:

- Upstream's Trivy artifact for the musl variant reported zero Critical/High
  results, but the workflow uses `ignore-unfixed: true` and `exit-code: "0"`.
  A successful job is report publication, not an admission gate
  ([scan job](https://github.com/rustfs/rustfs/actions/runs/33577946836/job/100086668957),
  [workflow policy](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/.github/workflows/docker.yml#L472-L516)).
- Pinned Grype `0.116.1`, using database `v6.1.9` built
  `2026-09-03T06:30:55Z`, found 36 matches in the exact ARM64 manifest:
  16 Medium and 20 Unknown. The 20 Unknown findings affect installed
  `curl`/`libcurl` `8.21.0-r0` and report `8.22.0-r0` as fixed. The official
  Alpine 3.24 ARM64 repository still exposes `8.21.0-r0`, so an ordinary
  rebuild/`apk upgrade` cannot yet close the set
  ([Alpine package record](https://pkgs.alpinelinux.org/package/v3.24/main/aarch64/curl),
  [Grype release](https://github.com/anchore/grype/releases/tag/v0.116.1)).

The second bullet is a local digest-bound measurement, not an upstream claim.
It found no Critical or High result at that database snapshot, consistent with
the first-party advisory range review. However, Buzz has not documented an
accept, mitigate, or defer decision for any of the 16 Medium or 20 Unknown
findings, and Unknown severity cannot be treated as Low. Because fixed findings
remain in the selected manifest and the required lower-severity dispositions
do not exist, the complete vulnerability requirement fails closed.

## Runtime user, writable paths, and startup

The exact image configuration declares `USER rustfs`, entrypoint
`/entrypoint.sh`, command `rustfs`, working directory `/`, and volume `/data`.
The Dockerfile creates `rustfs` as UID/GID `10001:10001`, owns `/data` and
`/logs`, and declares only `/data` as a volume
([Dockerfile](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/Dockerfile#L69-L116)).
The entrypoint creates configured data and log directories, so `/logs` must
also be writable or logging must be redirected to stdout when the root
filesystem is read-only
([entrypoint](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/entrypoint.sh#L220-L294)).

A bounded local check of the exact ARM64 child under emulation confirmed UID
and GID 10001, source/version output for `1.0.0-rc.5`, and a server process that
stayed alive with a read-only root, no network, all capabilities dropped,
`no-new-privileges`, and writable tmpfs mounts at `/data` and `/logs`. Its
loopback `/health` endpoint returned the expected `ok` status and exact release
version. No S3 operation was asserted. This is startup evidence only, not
application or persistence qualification.

The image exposes ports 9000 and 9001 and defaults Console CORS to `*`; neither
is acceptable as a published host listener. A future fixture would have to
disable the Console, publish no port, join only `buzz-data`, mount only the
explicit writable paths, and preserve all hardening. Those are T073/T081
contracts, not properties proven here
([container source](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/Dockerfile#L89-L116),
[Console guidance](https://docs.rustfs.com/en/administration/console)).

## Bootstrap, privacy, persistence, and recovery

RustFS starts with root credentials supplied by canonical environment variables
or `_FILE` variants. Root credentials bypass policies and are intended only for
bootstrap; upstream recommends scoped users/service accounts for ordinary use
([credential management](https://docs.rustfs.com/en/operations/credentials),
[IAM model](https://docs.rustfs.com/en/security-compliance/iam)). The official
CLI can create a bucket, policy, IAM user, and policy-bound service account and
can manage anonymous access
([`rc` command reference](https://github.com/rustfs/cli#command-overview)). This
is a plausible one-shot bootstrap seam, but T057 has not qualified an immutable
ARM64 `rc` artifact, its SBOM/provenance/user, or a no-secret-leak invocation.
Accordingly the initializer requirement is **incomplete**.

Single-node container persistence is documented through a named or bind-mounted
`/data` volume, and upstream describes SNSD as having no redundancy
([Podman guide](https://docs.rustfs.com/en/installation/container/podman),
[topology guide](https://docs.rustfs.com/en/installation)). RustFS's exact
source also says single-node deployments must use strict durability. However,
new buckets default to a `relaxed` per-bucket override unless
`RUSTFS_NEW_BUCKET_DURABILITY_MODE=strict` is set, so a future initializer must
set or verify strict durability for the pilot bucket
([durability contract](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/operations/durability-modes.md)).

No official object-data backup/export and restore/import procedure, quiescence
contract, or single-node recovery rehearsal was found in the release source or
current operations documentation. The documentation says SNSD must rely on
backups but does not define them. Filesystem archiving, CSI snapshots, `rc
mirror`, or replication would each require a separate correctness and recovery
design; none may be assumed to preserve versions, delete markers, RustFS system
metadata, and a coherent PostgreSQL/object-store point. Restart persistence and
the complete backup/restore contract therefore remain **incomplete**.

## Operation-level evidence matrix

“Documented” below means the exact release source makes a claim or contains an
executable upstream test. It does not mean that OvernightDesk ran that test
against the exact image. RustFS itself says it provides broad, not complete,
S3 compatibility
([compatibility matrix](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/architecture/s3-compatibility-matrix.md)).

| Buzz object-store contract | RustFS `rc.5` evidence | Evidence class | Gate 0 result |
| --- | --- | --- | --- |
| Path-style addressing | RustFS accepts the S3 endpoint without configured server domains; current official client guidance states path-style is the default ([environment reference](https://docs.rustfs.com/en/reference/environment-variables), [client guidance](https://docs.rustfs.com/en/installation/windows)). | Documented current behavior; not exact-Buzz tested | **Requires Buzz validation** |
| Conditional `PutObject` with `If-Match` and `If-None-Match` | Exact-source tests cover matching/nonmatching ETags, missing objects, `If-None-Match: *`, and 412 failures ([conditional tests](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/reliant/conditional_writes.rs)). | Exact source test | **Requires Buzz validation** |
| One-winner concurrent create race | Exact-source cluster test launches concurrent `If-None-Match: *` PUTs through different nodes and requires exactly one winner and 412 losers ([cluster race](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/cluster_concurrency_test.rs#L43-L216)). | Exact source test; release S3 gate failed | **Requires Buzz validation** |
| Byte-range reads | Upstream compatibility matrix names range and conditional reads as supported, and the implemented Ceph list contains range cases ([matrix](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/architecture/s3-compatibility-matrix.md), [implemented list](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/scripts/s3-tests/implemented_tests.txt)). | Documented claim/test selection | **Requires Buzz validation** |
| Multipart create/upload/complete/abort | The compatibility matrix and implemented list cover ordinary multipart behavior; exact conditional tests also exercise conditional multipart completion ([matrix](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/architecture/s3-compatibility-matrix.md), [conditional multipart test](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/reliant/conditional_writes.rs#L145-L260)). | Exact source tests plus claim | **Requires Buzz validation** |
| Paginated `ListObjectsV2` | Matrix claims prefix, delimiter, marker and `max-keys`; implemented tests include continuation-token cases ([matrix](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/architecture/s3-compatibility-matrix.md), [implemented list](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/scripts/s3-tests/implemented_tests.txt)). | Documented claim/test selection | **Requires Buzz validation** |
| User metadata and object tags | Both are supported areas in the matrix and named tests are in the implemented list ([matrix](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/architecture/s3-compatibility-matrix.md), [implemented list](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/scripts/s3-tests/implemented_tests.txt)). | Documented claim/test selection | **Requires Buzz validation** |
| Bucket versioning | Exact source creates enabled and suspended versioned buckets and checks returned version IDs ([version tests](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/version_id_regression_test.rs)). | Exact source test | **Requires Buzz validation** |
| `ListObjectVersions`, versions and delete markers | Exact regression tests require both object versions and delete markers to be visible immediately and support a prefix ([listing regression](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/list_object_versions_regression_test.rs), [bulk-delete regression](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/delete_objects_versioning_test.rs)). Dual-marker pagination must still be exercised with Buzz's client. | Exact source tests; Buzz pagination still missing | **Requires Buzz validation** |
| Exact-version and delete-marker deletion | Exact-source regression deletes a specific object version and a specific delete-marker version, then verifies visibility ([delete regression](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/crates/e2e_test/src/delete_regression_test.rs#L241-L378)). Buzz's bulk `DeleteObjects` identifiers remain untested here. | Exact source test; exact Buzz bulk form missing | **Requires Buzz validation** |
| Restart persistence | `/data` volume persistence is documented, and exact source defines strict durability for single-node use; no exact-image restart assertion was performed ([container guide](https://docs.rustfs.com/en/installation/container/podman), [durability contract](https://github.com/rustfs/rustfs/blob/40a2470feb567201165a5b809b7598bb4b1f68f5/docs/operations/durability-modes.md)). | Documentation only | **Requires Buzz validation** |
| Backup and isolated restore | No supported object-data procedure or coherent snapshot contract was found; SNSD documentation merely says to rely on backups ([installation guide](https://docs.rustfs.com/en/installation)). | Missing upstream method; no Buzz rehearsal | **Unproven** |

## Exact Buzz path status

RustFS source evidence is not a substitute for the following application-level
contracts:

| Buzz path | What is known | What remains |
| --- | --- | --- |
| Media upload/read/delete | Buzz performs ordinary and streaming PUT/GET, range GET, HEAD, DELETE, metadata/tag operations, and paginated listing ([Buzz media store](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/src/storage.rs)). RustFS documents the constituent APIs. | Run the exact `rust-s3` client through the relay, including multipart thresholds and error semantics, in T070/T081. |
| Git object store | Buzz requires ETag-based conditional replacement and `If-None-Match: *` one-winner races; its startup probe is default-on and fatal ([Buzz Git store](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/api/git/store.rs), [startup gate](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/main.rs#L495)). RustFS contains similar source tests. | Run Buzz's probe unchanged plus independent race assertions; upstream's exact release S3 check is currently red. |
| Community deletion | Buzz lists versions and delete markers using key and version markers, then bulk-deletes exact version IDs ([Buzz version listing](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/src/storage.rs#L553), [deletion pipeline](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-deletion/src/lib.rs#L1208)). RustFS has component-level version tests. | Prove dual-marker pagination, `null` versions, bulk exact-version/delete-marker deletion, retries, and final physical emptiness with synthetic objects. |
| Storage sweep | Buzz mounts the sweep against the same store and it is enabled by default in the proposed deployment ([Buzz relay state](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/state.rs#L841)). | Run sweep after media/Git/version mutations, across restart, and confirm no live object is removed. |
| Coherent recovery | PostgreSQL references and object data are one authoritative recovery set under ADR-009. RustFS provides no accepted procedure in this review. | T070/T078/T081 must define, implement, and rehearse one quiesced backup plus isolated restore with completeness marker, RPO and RTO. |

## Final disposition and next action

`ghcr.io/rustfs/rustfs@sha256:c36b3efea3d1e503f1a2581abd0e7611e0e5820dd30e1850a52384b3fc52bda4`
and its ARM64 child are **not** admitted as provisional local candidates.
Capability evidence is promising, but Gate 0 fails independently on
release/support status, red exact-source S3 and E2E checks, unresolved image
findings, missing initializer qualification, and missing object-data recovery
evidence.

Next action:

1. Wait for or evaluate a newer **stable** RustFS release whose exact commit
   has green S3 and full-E2E checks.
2. Re-resolve the immutable index/ARM64/attestation digests and repeat the full
   all-severity scan; do not carry the `rc.5` digest forward.
3. Require unambiguous upstream support status and either a publisher signature
   or an explicitly accepted provenance policy.
4. Qualify a digest-bound one-shot `rc` or other initializer that creates one
   private bucket, sets strict durability, creates only a scoped Buzz
   credential, exits, and retains no ongoing authority.
5. Define a supported, quiesced object-data backup/restore method before T070;
   if no such method exists, reject RustFS and evaluate another maintained
   backend under the same contract.
6. Only after those Gate 0 blockers close, run the complete exact-Buzz matrix in
   T070/T081. No-S3 operation and disabling the Git probe remain rejected.

## Search and inspection record

Primary-source searches covered the RustFS GitHub releases, exact tag/commit,
release assets, GHCR package/index, image Dockerfiles and workflow, security
policy, all 34 published repository security advisories, compatibility matrix,
implemented/unimplemented/excluded S3 lists,
conditional-write and versioning tests, IAM/credential documentation,
container/topology/durability guidance, CLI bootstrap commands, operations
documentation, and exact-commit checks. Registry observations used Docker
Buildx against the digest; runtime checks used only the exact local ARM64
manifest. No credentials, external account data, Aegis state, production
network, image publication, issue comment, or remote mutation was involved.
