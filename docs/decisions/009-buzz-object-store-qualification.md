# ADR-009: Require a conformance-qualified Buzz object store

## Status

Accepted for Gate 0 planning on 2026-09-03. No object-store image, deployment,
secret, bucket, or production state is approved by this decision.

## Date

2026-09-03

## Evidence update

RustFS `1.0.0-rc.5` was prequalified on 2026-09-03 and rejected at Gate 0.
This update applies the existing decision criteria; it does not change them.
See
[`rustfs-prequalification.md`](../../specs/042-buzz-private-pilot/evidence/rustfs-prequalification.md).

## Context

The current Buzz Compose example uses historical MinIO server and `mc` images.
T057 found that both upstream repositories are archived, neither image carries
the provenance expected for a new Aegis workload, both default to root, and
their current vulnerability results fail the pilot's image gate.

Buzz uses a generic S3 client, but its actual contract is broader than ordinary
upload and download operations. The relay constructs media and Git stores at
startup, its default-on Git probe checks conditional create/replace semantics,
community deletion lists and removes object versions, and media delivery uses
range requests. Open upstream issues document conditional-write failures with
GCS and Ceph, range-read failure with Cloudflare R2, and other provider-specific
addressing and deployment problems. A provider's claim of “S3 compatibility”
is therefore not qualification evidence.

Garage v2.3.0 was considered because it is maintained and has ARM64 artifacts.
Its official documentation says that bucket versioning, `ListObjectVersions`,
and conditional writes are not implemented. Those are active Buzz contracts,
so Garage cannot replace MinIO for this pilot.

Core text messaging is PostgreSQL/Redis based, but current Buzz does not expose
a supported storage-free mode. Disabling the Git conformance probe can allow
the listener to start, but it skips a real correctness gate; it does not remove
the media/Git clients or routes and cannot establish a supported no-S3 profile.

Upstream issue [block/buzz#2618](https://github.com/block/buzz/issues/2618)
proposes RustFS as a self-hosted alternative. The proposal has no maintainer
acceptance or Buzz conformance result and itself requires complete object-store
and media qualification before selection.

## Decision

- Keep an S3-compatible object store in the pilot's required data plane. Do not
  create an OvernightDesk-specific no-S3 or media-free runtime profile.
- Do not use the historical MinIO server or `mc` images, Garage v2.3.0, or a
  disabled Git conformance probe as a Gate 0 exception.
- RustFS `1.0.0-rc.5` does not pass Gate 0. A newer RustFS release or a
  different maintained candidate may be evaluated if it meets the same
  contract and image gates; no backend is currently selected.
- Select a backend only after its immutable native ARM64 image passes
  provenance, SBOM, vulnerability, non-root, read-only-root, persistence, and
  startup checks and the exact Buzz candidate passes disposable operation-level
  tests for:
  - bucket bootstrap and private access;
  - Buzz's required path-style addressing plus PUT, GET, HEAD, DELETE,
    byte-range reads, multipart transfer, paginated listing, tags, and metadata;
  - conditional `If-Match` and `If-None-Match` behavior under the relay's
    default Git conformance probe;
  - version listing and exact-version deletion used by community deletion;
  - restart persistence and isolated backup/restore; and
  - the current Buzz media, Git, community-deletion, and storage-sweep paths,
    not merely a standalone S3 client.
- Keep PostgreSQL and the selected qualified object store as one coherent
  authoritative recovery set. Redis remains diagnostic/cache state and Git
  scratch remains reproducible.
- Replace the MinIO-specific initializer with the smallest qualified,
  backend-appropriate bootstrap path. It must create only the required private
  bucket and credentials and must pass the same image and least-privilege gates.

## Consequences

- T057 remains incomplete until one backend and its initializer pass both the
  image gate and the documented Buzz contract preconditions.
- The RustFS rc.5 evaluation is complete and preserves useful capability
  evidence, but its release/support posture, exact-commit CI, image findings,
  initializer, and recovery gaps prevent admission.
- The pilot retains object-store operational cost and recovery complexity even
  though large media and Git UI are non-goals.
- A backend that passes the startup probe can still fail media or restore
  behavior, so local qualification and the later isolated restore gate remain
  separate requirements.
- Any future decision to support a storage-free Buzz fork/profile, relax
  community-deletion semantics, or waive a conformance operation is a new scope
  and risk decision rather than a T057 implementation detail.

## Alternatives considered

### Continue with historical MinIO images

Rejected. Immutable pins do not repair archived maintenance, missing
provenance, root-default execution, or current vulnerability failures.

### Replace MinIO with Garage v2.3.0

Rejected. Missing conditional writes and object version APIs conflict with
current relay contracts before image qualification is considered.

### Run text messaging with an unreachable placeholder S3 endpoint

Rejected for this pilot. It depends on kill switches and negative routing to
approximate a mode that upstream does not support, while readiness can still
report healthy and some WebSocket event forms can touch S3.

### Adopt RustFS immediately

Deferred pending qualification. The open upstream proposal establishes a
candidate and a useful test surface, not compatibility or maintainer support.
