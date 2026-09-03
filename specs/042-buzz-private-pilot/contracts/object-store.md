# Contract: Buzz Object Store

This contract implements ADR-009. It distinguishes Gate 0 candidate admission
from later executable qualification. Neither stage authorizes publication or
production deployment.

## Gate 0 candidate admission

A provisional object-store candidate may enter the local Compose fixtures only
when current primary-source evidence establishes all of the following:

- a maintained release and native Linux ARM64 artifact;
- an immutable digest with attributable provenance and an inspectable SBOM;
- no unresolved vulnerability or support-policy blocker under FR-001;
- explicit non-root execution, a read-only root filesystem, and documented
  writable data paths;
- support for private bucket bootstrap without a permanently privileged
  management container;
- documented support for Buzz's required path-style addressing, conditional
  `If-Match` and `If-None-Match` writes, byte-range reads, multipart transfer,
  paginated listing, object tags and metadata, version listing, and exact-
  version deletion; and
- documented single-node restart persistence plus a usable backup/restore
  mechanism for the bounded pilot.

An S3-compatibility claim, ordinary PUT/GET smoke test, disabled conformance
probe, or undocumented behavior is insufficient. Historical MinIO images and
Garage v2.3.0 are rejected. RustFS `1.0.0-rc.5` is also rejected by the current
Gate 0 evidence; a newer RustFS release or a different maintained backend must
pass this same contract before admission.

## Local executable qualification

The exact digest admitted at Gate 0 must then pass against the exact Buzz relay
candidate on a disposable, unrouted network:

1. Create exactly one private bucket through the proposed initializer, restart
   the store, and prove anonymous access remains denied.
2. Exercise the configured path-style endpoint plus PUT, GET, HEAD, DELETE,
   byte-range reads, multipart upload/download, paginated listing, tags, and
   metadata.
3. Exercise conditional create and replace behavior under concurrent races,
   including the relay's default-on Git object-store conformance probe. The
   probe must not be disabled or treated as the complete test suite.
4. Enable object versioning, list versions, delete an exact version, and run the
   current Buzz community-deletion path against synthetic objects.
5. Exercise current Buzz media upload/read/delete, Git push/clone,
   community-deletion, and storage-sweep paths, including restart persistence.
   Disabled pilot UI features do not waive backend correctness for mounted
   relay routes.
6. Back up PostgreSQL and the object store in one marked maintenance window,
   restore them to a disposable network, and validate message/object references,
   media behavior, Git behavior, and community deletion.

Any unsupported operation, semantic mismatch, timeout, data loss, public
listener, root-only requirement, or digest drift fails qualification. A passing
Git startup probe is necessary but not sufficient.

## Runtime invariants

- Relay is the only application container on `buzz-data` that can address the
  object store.
- The object-store API, administration endpoint, metrics, and health endpoint
  publish no host port and are unreachable from Nginx and intake workers.
- Credentials are projected at runtime and scoped to the one pilot bucket.
- The initializer exits after idempotent private-bucket setup and has no
  ongoing management authority.
- The store image, initializer image or binary, configuration, and volume
  layout are digest-bound in evidence.
- PostgreSQL and the object store form one coherent authoritative recovery set;
  partial success never emits `COMPLETE`.

## Evidence required for final selection

- exact release, source commit, index and ARM64 manifest digests;
- provenance/signature and SBOM verification results;
- vulnerability disposition and runtime user/capability/mount evidence;
- machine-readable results for every operation above;
- Buzz relay and initializer logs reduced to safe outcome classes;
- backup artifact digests, completeness marker, isolated restore assertions,
  and measured RPO/RTO; and
- a clear `pass`, `fail`, or `incomplete` disposition with no conditional
  production approval.
