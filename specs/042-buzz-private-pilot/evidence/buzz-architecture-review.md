# Buzz architecture review for the media-free pilot

**Evidence snapshot:** 2026-09-03

**Current Buzz `main` observed:** `c6ca9d94d94230a315257a87beb8dc116fec56cc`

**Pinned pilot relay source:** `0dbd036f5bff33e7ade75e7639f3218d424a6e73`
**Disposition:** **media-free messaging is technically plausible but is not an
upstream-supported deployment mode; do not treat it as qualified without the
bounded startup and behavior proof below**

This is a read-only architecture review. It does not amend the pilot
specification, approve a reduced durability or deletion contract, qualify T057,
or authorize a Compose, Aegis, route, image publication, or production change.

## Executive conclusion

The architecture document confirms that Buzz's core communication path is the
Nostr WebSocket relay backed by PostgreSQL and Redis. S3 is described separately
as the `buzz-media` backing store, while Git uses the same object-store
configuration through its own relay subsystem. Plain messages, authentication,
subscriptions, membership, persistence, search, and local fan-out do not use S3
in the documented event pipeline
([architecture overview](https://github.com/block/buzz/blob/c6ca9d94d94230a315257a87beb8dc116fec56cc/ARCHITECTURE.md#L1-L91),
[event pipeline](https://github.com/block/buzz/blob/c6ca9d94d94230a315257a87beb8dc116fec56cc/ARCHITECTURE.md#L218-L267)).

That separation does **not** mean the current relay has an official no-S3
profile. The relay always constructs `MediaStorage` and `GitStore`, always
mounts the media and Git routes, and by default performs a startup-fatal Git
object-store conformance probe. Buzz's own deployment documentation explicitly
says minimal mode is not yet supported and that even quickstart starts real
Redis and S3
([startup construction and probe](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/main.rs#L447-L534),
[upstream limitation](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/deploy/charts/buzz/README.md#L258-L269)).

Consequently, the earlier phrase "configure an unreachable fail-closed S3
endpoint" is incomplete as an implementation recommendation. It can allow
startup only when the default Git probe is explicitly disabled, storage metrics
are disabled, the edge denies every storage-backed HTTP route, and the pilot
does not submit storage-backed WebSocket event forms. This would be a deliberate
unsupported pilot profile requiring owner approval and live contract evidence,
not an ordinary supported Buzz configuration.

## Verified dependency boundaries

| Concern | Verified behavior | Consequence for the pilot |
| --- | --- | --- |
| Core event truth | The relay is the single source of truth; stored events go to PostgreSQL. The EVENT path authenticates, verifies, checks membership, inserts into the DB, publishes through Redis when channel-scoped, and fans out to subscribers. | PostgreSQL remains mandatory for durable messaging. Redis is part of the configured fan-out/presence runtime and production readiness contract. |
| Search | Search is PostgreSQL FTS over the persisted event row, not a separate object store. | Messaging/search does not require S3. |
| Media | `buzz-media` is the Blossom/S3 subsystem. Upload and read handlers access `MediaStorage`. | Plain text messaging can avoid this subsystem, but attachments cannot. |
| Git | Git smart HTTP uses a durable S3 object store for manifests, packs, and the CAS-protected pointer. | Git hosting cannot be honestly offered without a conforming object store. |
| Readiness | Production readiness evaluates PostgreSQL, Redis, and the PostgreSQL deletion catalog; it does not check S3. | With the startup probe off, a relay can report ready while S3 is absent. Readiness alone is not proof of a valid media-free profile. |

Primary sources:

- [PostgreSQL and Redis architecture](https://github.com/block/buzz/blob/c6ca9d94d94230a315257a87beb8dc116fec56cc/ARCHITECTURE.md#L32-L69)
- [Subsystem responsibilities](https://github.com/block/buzz/blob/c6ca9d94d94230a315257a87beb8dc116fec56cc/ARCHITECTURE.md#L76-L94)
- [PostgreSQL event store](https://github.com/block/buzz/blob/c6ca9d94d94230a315257a87beb8dc116fec56cc/ARCHITECTURE.md#L403-L437)
- [Redis pub/sub](https://github.com/block/buzz/blob/c6ca9d94d94230a315257a87beb8dc116fec56cc/ARCHITECTURE.md#L441-L455)
- [Readiness dependency implementation](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/readiness.rs#L302-L357)

## Startup and runtime behavior without reachable S3

### Verified facts

1. `Config::from_env` supplies concrete S3 defaults. `MediaConfig` is not
   optional
   ([relay configuration](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/config.rs#L828-L882)).
2. `MediaStorage::new` constructs a `rust-s3` client from endpoint, bucket, and
   credentials but performs no network operation in the constructor
   ([media client construction](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-media/src/storage.rs#L204-L256)).
3. `AppState::new` constructs `GitStore` from the same S3 endpoint, bucket, and
   credentials
   ([state construction](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/state.rs#L839-L849)).
4. `BUZZ_GIT_CONFORMANCE_PROBE` defaults to enabled. When enabled, it contacts
   S3 before the listener opens and any failure terminates startup. Upstream
   documents that disabling it removes this startup reachability check and that
   storage errors then surface at the first operation
   ([startup gate](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/main.rs#L498-L534),
   [chart behavior](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/deploy/charts/buzz/README.md#L111-L116)).
5. The hourly storage sweep defaults on. `BUZZ_STORAGE_METRICS=off` is its hard
   kill switch and prevents storage calls from that path
   ([sweep configuration](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/storage_sweep.rs#L30-L80)).

### Inference requiring proof

With a syntactically valid but unreachable S3 endpoint,
`BUZZ_GIT_CONFORMANCE_PROBE=false`, and `BUZZ_STORAGE_METRICS=off`, the source
indicates the relay should open its listener and its plain-message path should
continue to use PostgreSQL and Redis. This is a strong source-grounded
inference, not qualification evidence: the profile is expressly unsupported by
upstream and has not yet passed an exact-image startup/restart/message contract
test in this work.

## Can media and Git be excluded without relay source changes?

**At the relay router: no.** `build_router` unconditionally mounts both
`/upload` and `/media/upload`, `/media/{sha256_ext}`, all `/git/{owner}/{repo}`
smart-HTTP routes, and `/internal/git/policy`. There is no media-enabled or
Git-enabled configuration switch around those routers
([router construction](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/router.rs#L30-L53),
[router merge](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/router.rs#L146-L153),
[Git routes](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/api/git/transport.rs#L2111-L2123)).

**At a sole ingress edge: conditionally.** Nginx can deny the public storage
surface before proxying to the relay, provided the relay port is not otherwise
reachable. The deny set must include the legacy `/upload` alias, `/media/`, and
`/git/`; `/internal/git/` must never be proxied externally. That removes HTTP
reachability but does not remove the handlers or storage clients from the relay.

Ingress denial is also not the full runtime boundary:

- An EVENT carrying `imeta` tags invokes S3 sidecar and object checks during
  ingestion. Plain events with no `imeta` tags skip that call
  ([ingest branch](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/handlers/ingest.rs#L2966-L2985),
  [storage verification](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/handlers/imeta.rs#L207-L255)).
- A NIP-34 repository announcement seeds a manifest and CAS pointer in the Git
  object store. Avoiding only the HTTP Git routes does not make repository event
  behavior usable
  ([manifest-pointer seed](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/handlers/side_effects.rs#L2864-L2936)).
- Blob-target moderation reports query media storage, while event- and
  pubkey-target reports do not
  ([report handling](https://github.com/block/buzz/blob/0dbd036f5bff33e7ade75e7639f3218d424a6e73/crates/buzz-relay/src/handlers/report.rs#L39-L75)).

Therefore, a no-source-change pilot can be **bounded away** from storage-backed
features, but cannot truthfully claim that those features are disabled inside
Buzz. Fail-closed ingress policy plus an explicit feature-use prohibition is a
pilot workaround, not a product feature flag.

## Effect on the media-free recommendation

The architecture document supports the narrow premise that owner/Hermes plain
messaging does not intrinsically need S3. It invalidates any broader claim that
S3 is an optional supported deployment dependency.

The minimum defensible experiment is:

1. Explicitly set `BUZZ_GIT_CONFORMANCE_PROBE=false` and
   `BUZZ_STORAGE_METRICS=off`.
2. Supply syntactically valid, non-secret placeholder S3 configuration pointing
   to a deliberately unreachable internal endpoint. Do not use cloud metadata
   credential fallback.
3. Deny `/upload`, `/media/`, `/git/`, and `/internal/git/` at the sole Nginx
   ingress and prove the relay container has no other ingress path.
4. Test the exact pinned ARM64 relay image through startup, readiness, restart,
   NIP-42 owner and Hermes authentication, plain EVENT/REQ persistence, search,
   Redis fan-out, and PostgreSQL backup/restore.
5. Add negative tests proving the denied HTTP routes never reach Buzz and that
   `imeta`, repository-announcement, and blob-report attempts fail closed within
   a bounded time without degrading ordinary messaging.
6. Treat media, Git, object-version deletion, and object-store recovery as
   unavailable and outside the pilot acceptance contract.

Items 1, 2, and 6 intentionally bypass or narrow existing Buzz guarantees.
They require owner approval and synchronized changes to the pilot spec, plan,
tasks, recovery model, and operator documentation before implementation.

## Version-drift assessment

At capture time GitHub resolved `main` to
[`c6ca9d94d94230a315257a87beb8dc116fec56cc`](https://github.com/block/buzz/commit/c6ca9d94d94230a315257a87beb8dc116fec56cc),
15 commits ahead of the pinned relay commit. The two `ARCHITECTURE.md` blobs are
byte-identical (`sha256:c85df28d133b32c238da4a23e0e35918681b89eb7664011e09fe25c4367d0d85`).

Across the architecture-adjacent files reviewed, `main.rs` and `state.rs` have
changed since the pin, but the changes concern community bootstrap/maintenance,
pool metrics, and huddle liveness. The media construction, default-on Git probe,
storage sweep controls, readiness dependency set, and unconditional router
mounts described above remain unchanged. This finding is therefore applicable
to the pinned image; it is not based on a newer-only architecture.

## Decision boundary

### Verified facts

- Core plain messaging is PostgreSQL/Redis based and does not traverse S3.
- Current Buzz always constructs S3 clients and always mounts storage-backed
  routes.
- The default Git S3 probe makes an unreachable store startup-fatal.
- Probe and storage-sweep kill switches exist, and readiness omits S3.
- Some WebSocket event forms invoke S3 even if HTTP media/Git routes are denied.
- Upstream expressly says minimal mode is not supported.

### Inference

- The pinned relay should support a carefully bounded, plain-message-only pilot
  without reachable S3 after the two kill switches are set. This must be proven
  against the exact image and topology.

### Owner decisions required

- Whether an unsupported pilot profile is acceptable.
- Whether FR-016/FR-017, deletion evidence, recovery, and any Git/media
  acceptance criteria may be removed or deferred.
- Whether external edge denial plus operational non-use is an adequate control,
  or whether a small upstream/source patch adding real media/Git feature flags
  is required.

## Validation status

- Reviewed the full current architecture document and the identical document at
  the pinned commit.
- Verified conclusions against pinned executable source for startup, state,
  routing, ingestion, Git side effects, readiness, and storage metrics.
- Used only official Buzz repository sources and commit identities.
- No relay was started and no behavior contract test was run; technical
  plausibility remains **unqualified**.
- No files other than this evidence record were changed by this review. No
  commit, push, registry publication, Aegis access, or production mutation
  occurred.
