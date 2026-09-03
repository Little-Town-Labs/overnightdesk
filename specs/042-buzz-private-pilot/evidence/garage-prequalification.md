# Garage prequalification for Buzz T057

**Evidence snapshot:** 2026-09-02

**Buzz source under review:** `0dbd036f5bff33e7ade75e7639f3218d424a6e73`

**Garage release under review:** `v2.3.0`
**Disposition:** **REJECT / fail closed as a Buzz object-store replacement**

This is a bounded, read-only prequalification. It does not approve Garage,
change the ADR/specification, qualify an image for production, or authorize a
Compose, Aegis, registry, route, identity, or production mutation.

## Executive finding

Garage is actively developed, lightweight, distributed under AGPL-3.0, and
publishes an immutable Linux ARM64 image. Those facts do not make it compatible
with the pinned Buzz relay.

Two independent application contracts reject Garage `v2.3.0`:

1. Buzz community deletion always performs `ListObjectVersions` before the
   durable write fence and later bulk-deletes exact `(Key, VersionId)` entries.
   Garage explicitly says bucket versioning is absent and
   `ListObjectVersions` is missing.
2. Buzz Git-on-object-storage requires linearizable conditional `PutObject`
   using `If-Match` and `If-None-Match: *`; its default startup probe refuses
   to serve when that contract fails. Garage documents conditional writes as an
   architectural limitation caused by its no-consensus design.

The consultant's proposal to defer bucket versioning therefore does not make
Garage admissible. Buzz uses the version-listing API even for a never-versioned
bucket so deletion can prove final physical emptiness, and the separate Git CAS
contract would still fail. A basic `PutObject`/`GetObject`/`HeadObject`/
`DeleteObject`/`ListObjectsV2` media test would not cover either blocker.

## Exact Buzz object-store contract

Buzz uses the generic `rust-s3` crate at version `0.37`, not a MinIO-specific
client. Both the media and relay crates select the TLS, `fail-on-err`, and tags
features ([media dependency](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/Cargo.toml#L24),
[relay dependency](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/Cargo.toml#L67)).
The configuration supports SigV4 static credentials or the AWS credential
chain, a configurable region and endpoint, and either path- or virtual-hosted
addressing ([configuration source](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/src/config.rs)).

The pinned commit uses the following S3 behavior:

| Buzz path | Required behavior | Primary source |
|---|---|---|
| Media upload/read | `PutObject`, streaming `PutObject`, `GetObject`, streaming `GetObject`, ranged `GetObject`, `HeadObject`, and `DeleteObject` | [media storage implementation](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/src/storage.rs#L258) |
| Storage accounting and tenant enumeration | Paginated `ListObjectsV2`, including prefix and continuation-token behavior | [listing implementation](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/src/storage.rs#L497) |
| Community deletion | `ListObjectVersions` with `prefix`, `max-keys`, `key-marker`, and `version-id-marker`; response parsing must include both object versions and delete markers | [version listing implementation](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/src/storage.rs#L553) |
| Permanent deletion | `DeleteObjects` with an exact version ID on every identifier, including delete-marker versions; missing-version retries must remain idempotent | [exact-version deletion implementation](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/src/storage.rs#L398) |
| Git immutable objects | Conditional `PutObject` with `If-None-Match: *`; one concurrent writer succeeds and the rest return HTTP 412 | [Git store implementation](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/api/git/store.rs#L248) |
| Git mutable pointer CAS | `GetObject` returns a usable ETag, then conditional `PutObject` with either the same `If-Match` ETag or `If-None-Match: *`; losing writers return HTTP 412 | [pointer implementation](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/api/git/store.rs#L448) |

These are not dormant library helpers:

- At deletion approval, Buzz calls the version-listing preflight for every
  tenant prefix before it establishes the durable fence. A failure aborts the
  operation ([deletion pipeline](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-deletion/src/lib.rs#L1208)).
- At the destructive stage it deletes the frozen manifest by exact version ID
  ([deletion pipeline](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-deletion/src/lib.rs#L1315)).
- Buzz's own integration test requires `ListObjectVersions` to enumerate a
  never-versioned object's `null` version and proves that exact-version deletion
  leaves the version listing empty
  ([versioned-store contract test](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/tests/versioned_minio.rs#L132)).
- Media and Git share the same S3 endpoint, credentials, bucket, region, and
  addressing-style configuration
  ([state construction](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/state.rs#L841)).
- The Git conformance probe defaults on and makes relay startup fatal if the
  backend cannot provide its concurrent conditional-write guarantees
  ([startup gate](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/main.rs#L495)).

Disabling `BUZZ_GIT_CONFORMANCE_PROBE` would bypass an explicit integrity gate;
it would not make Garage implement conditional writes. That is not an image
qualification remedy.

## Garage `v2.3.0` compatibility

Garage's official compatibility document lists the ordinary operations Buzz
uses—SigV4, path and virtual-host addressing, `CreateBucket`, `HeadObject`,
`GetObject`, ranged reads, `PutObject`, `DeleteObject`, `DeleteObjects`, and
`ListObjectsV2`—as implemented. It also warns that serious compatibility
decisions require independent tests
([Garage S3 compatibility](https://github.com/deuxfleurs-org/garage/blob/v2.3.0/doc/book/reference-manual/s3-compatibility.md)).

That same document is decisive for the missing behavior:

- bucket versioning is missing;
- `ListObjectVersions` is missing;
- `PutBucketVersioning` is missing; and
- `GetBucketVersioning` is only a stub that always reports versioning disabled.

Garage also explicitly documents **no conditional writes** (`if-none-match`,
among others) as an architectural limitation. It says safe concurrent exclusion
cannot be implemented under the project's no-consensus design
([Garage known issues](https://github.com/deuxfleurs-org/garage/blob/v2.3.0/doc/book/reference-manual/known-issues.md#no-conditional-writes--locking--worm-support-if-none-match-)).
This conflicts directly with Buzz's Git A3 CAS invariant, where exactly one
parallel writer must win and every other writer must receive 412.

| Contract | Garage `v2.3.0` | Preliminary result |
|---|---|---|
| Basic media CRUD, range GET, `ListObjectsV2` | Documented implemented | Requires a later live client contract only if all hard blockers are resolved |
| `ListObjectVersions` with dual-marker pagination | Documented missing | **Hard fail** |
| Exact-version/delete-marker enumeration and deletion | Versioning absent | **Hard fail** |
| Conditional `PutObject` CAS | Documented architectural limitation | **Hard fail** |
| Bucket ACL or policy commands | Not implemented; Garage uses its own per-key/per-bucket permission model | Replace `mc anonymous set none` with Garage-native authorization if ever reconsidered |

## Official ARM64 image observations

The latest stable Garage tag observed from the official Docker Hub repository
on 2026-09-02 was `dxflrs/garage:v2.3.0`, published 2026-04-16
([official Docker Hub tags](https://hub.docker.com/r/dxflrs/garage/tags)). The
official release process defines `vX.Y.Z` tags as stable, publishes Linux static
binaries and Docker containers for `amd64`, `i686`, `aarch64`, and `armv6`, and
publishes the containers to Docker Hub
([release process](https://github.com/deuxfleurs-org/garage/blob/v2.3.0/doc/book/development/release-process.md)).

Registry inspection produced these immutable values:

| Item | Observed value |
|---|---|
| Multi-arch index | `docker.io/dxflrs/garage@sha256:866bd13ed2038ba7e7190e840482bc27234c4afaf77be8cfa439ae088c1e4690` |
| Linux ARM64 manifest | `docker.io/dxflrs/garage@sha256:2d3f94a89a8a02dc49fa75594d6df67ed9c6ffe08fe55ed023d0c9776f71a9bd` |
| ARM64 config digest | `sha256:4a53620ee2088de01a185899412889ade13c420df74ac9ca12699c27a8ab18b2` |
| Entrypoint/Cmd | no entrypoint; `CMD ["/garage", "server"]` |
| Declared image user | unset, so the container defaults to root |
| OCI labels | none |

The official Dockerfile is `FROM scratch`, copies only the static `/garage`
binary, declares no `USER`, and starts `/garage server`
([Dockerfile](https://github.com/deuxfleurs-org/garage/blob/v2.3.0/Dockerfile)).
The official release pipeline builds architecture-specific images and combines
them into a multi-arch tag, but it does not show an SBOM, provenance
attestation, or signing step
([release workflow](https://github.com/deuxfleurs-org/garage/blob/v2.3.0/.woodpecker/release.yaml),
[publish workflow](https://github.com/deuxfleurs-org/garage/blob/v2.3.0/.woodpecker/publish.yaml)).

Local registry inspection corroborated that limitation:

- `docker buildx imagetools inspect ... --format '{{json .Provenance}}'`
  returned `{}`;
- the equivalent `.SBOM` query returned `{}`;
- the schema-2 manifest list contained only four runtime manifests and no
  attestation descriptors; and
- no digest-named Cosign signature tag was exposed by the Docker Hub tags API.

This records what was observable; it is not proof that no artifact exists in
any other system. No upstream source-to-image provenance or signature was
verified, so the image does not satisfy T057's provenance requirement.

Syft `v1.51.0` detected zero packages in the scratch ARM64 image. Grype
`v0.116.1`, using database schema `v6.1.9` built
`2026-09-02T06:35:12Z`, reported zero matches. This is **not** a clean
dependency proof: neither scanner identified the statically linked Rust
dependency graph, and no upstream SBOM was available to supply it.

A bounded execution check did prove that the exact ARM64 manifest can execute
under emulation as UID/GID `10000:10000` with a read-only root filesystem, no
network, all capabilities dropped, and `no-new-privileges`; `/garage --version`
reported `garage v2.3.0`. This proves only binary execution under an explicit
user override. It does not change the image's root-default metadata or prove a
non-root server startup with persistent volumes.

## Initialization and access model

Garage `v2.3.0` can initialize a single-node layout and one default key/bucket
without a separate `mc`, AWS CLI, or custom HTTP initializer. Its documented
flow uses `GARAGE_DEFAULT_ACCESS_KEY`, `GARAGE_DEFAULT_SECRET_KEY`, and
`GARAGE_DEFAULT_BUCKET`, then starts
`garage server --single-node --default-bucket`
([quick start](https://github.com/deuxfleurs-org/garage/blob/v2.3.0/doc/book/quick-start/_index.md#configuring-initial-access-credentials)).
The same guide says the configuration, metadata directory, and data directory
must be readable by the user running Garage, but it does not prescribe a
container UID/GID. A deployment would therefore need an explicit user plus
pre-provisioned ownership on both persistent volumes.

Garage does not implement S3 ACLs or bucket policies. It uses its own
per-access-key/per-bucket read, write, and owner permissions
([compatibility documentation](https://github.com/deuxfleurs-org/garage/blob/v2.3.0/doc/book/reference-manual/s3-compatibility.md#acl-policies-endpoints)).
Consequently, the MinIO initializer command `mc anonymous set none` is not a
portable replacement contract. If Garage were otherwise compatible, private
access would have to be established and tested through Garage's key/bucket
permission model, with the S3, RPC, and admin listeners isolated appropriately.

The quick start explicitly warns that its single-node deployment is not for
production because it has no redundancy. Garage's known-issues documentation
also warns that `replication_factor = 1` leaves only one copy of metadata. That
is a material durability caveat for the feature specification's authoritative
object-store and coherent-backup requirements.

## Maintenance, licensing, and support caveats

- `v2.3.0` is an official stable release, and current source and development
  image activity was visible on 2026-09-02. This is evidence of active
  maintenance, not a support-life guarantee.
- No formal LTS, end-of-life, or supported-versions policy was found in the
  official `v2.3.0` documentation. Garage documents upgrade classifications
  and says major migrations are supported only between contiguous versions
  ([upgrade documentation](https://github.com/deuxfleurs-org/garage/blob/v2.3.0/doc/book/operations/upgrading.md)).
- The project is licensed under GNU AGPL-3.0
  ([license](https://github.com/deuxfleurs-org/garage/blob/v2.3.0/LICENSE)).
  Any adoption or modified redistribution should receive the project's normal
  license/compliance review; this technical note is not legal advice.
- The current project security policy directs confidential reports to the core
  team and says acceptance/rejection feedback may take a few weeks
  ([security policy](https://github.com/deuxfleurs-org/garage/blob/main-v2/SECURITY.md)).

## Fail-closed conclusion

Do not replace MinIO with Garage in T057, do not change the Compose topology,
and do not add a Garage initializer on the basis of this proposal. The image
also lacks verified provenance/SBOM and defaults to root, but those are
secondary to the two hard application-compatibility failures.

Garage can be reconsidered only after an upstream release implements and
documents both of the following, followed by tests against the exact Buzz
client:

1. `ListObjectVersions` dual-marker pagination plus exact object-version and
   delete-marker deletion with final physical-emptiness proof; and
2. linearizable `If-Match` and `If-None-Match: *` conditional `PutObject` under
   concurrent writers, sufficient to pass Buzz's unmodified startup
   conformance probe.

Neither requirement should be waived merely because the pilot minimizes media,
excludes the Git UI, or does not plan to exercise community deletion. Those
choices reduce expected use; they do not change the relay's current integrity
and erasure contracts.

## Reproduction commands

The registry and bounded runtime observations above were collected without
publishing an image or touching Aegis:

```bash
docker buildx imagetools inspect dxflrs/garage:v2.3.0
docker buildx imagetools inspect \
  dxflrs/garage:v2.3.0@sha256:2d3f94a89a8a02dc49fa75594d6df67ed9c6ffe08fe55ed023d0c9776f71a9bd \
  --format '{{json .Image}}'
docker buildx imagetools inspect dxflrs/garage:v2.3.0 \
  --format '{{json .Provenance}}'
docker buildx imagetools inspect dxflrs/garage:v2.3.0 \
  --format '{{json .SBOM}}'
docker run --rm --platform linux/arm64 --user 10000:10000 --read-only \
  --network none --cap-drop ALL --security-opt no-new-privileges:true \
  docker.io/dxflrs/garage@sha256:2d3f94a89a8a02dc49fa75594d6df67ed9c6ffe08fe55ed023d0c9776f71a9bd \
  /garage --version
```
