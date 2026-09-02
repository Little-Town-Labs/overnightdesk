# Gate 0 Current Image Requalification

**Captured**: `2026-09-02T17:52:00Z` through `2026-09-02T17:56:00Z`

**Task**: T057

**Result**: incomplete; registry identity and ARM64 availability are recorded,
but the candidate set cannot yet pass the image gate.

## Current registry snapshot

These are observations of mutable upstream tags, not approved Compose pins:

| Role / observed tag | OCI index digest | Linux ARM64 manifest | Declared user |
| --- | --- | --- | --- |
| Buzz relay `ghcr.io/block/buzz:sha-2af9773` | `sha256:7f76dc54d211a38d5d2d65486a3d8a32b5d1939bb7344bdd3d7b818bf8f26b5e` | `sha256:39ef881a08b7e50d5ce29cf93f86032663dfdd41c5e2c4ab961fa5706c8df4dd` | `buzz:buzz` |
| PostgreSQL `postgres:17-alpine` | `sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73` | `sha256:dfc2780980fe6ca2d158bfe4342660db5e4c6431fb969088e543430d09f8d0f2` | unset in config |
| Redis `redis:7-alpine` | `sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf` | `sha256:f8d15882ba108587477ce13c00ab0551933a84138427b7cc9abadfbe45ffd973` | unset in config |
| MinIO `minio/minio:latest` | `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` | `sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f` | unset in config |
| MinIO initializer `minio/mc:latest` | `sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727` | `sha256:37d109dddbbb2c95873f5fc81ac93f37023264770fc580a7564148892087b1b7` | unset in config |
| possible Hermes-intake base `ghcr.io/block/buzz-sprig:main` | `sha256:3b0923bc2a34edbecf773650dbcaf86ac69263c70b04a6dfbcef78014ae94b42` | `sha256:f8575e3627092453c240c6c178e91961d16dbb653e64bc19fdec36e043d956aa` | `agent` |

The relay and possible Sprig candidate both bind their OCI revision to current
Buzz commit `2af9773...`. All observed roles have native Linux ARM64 manifests.

## Why the gate is incomplete

1. The checked-in Wolfi wrapper still pins the historical upstream relay
   `571c190...` and historical Wolfi packages. It was qualified on 2026-09-01,
   but Buzz supports only current `main`; the wrapper needs an intentional
   source update and repeatable rebuild before it can be selected.
2. Neither current Buzz relay nor Sprig exposes an embedded SBOM through
   Buildx. No current independent Syft/Grype result has yet been produced for
   these exact manifests.
3. The store tags are mutable. Their current index and ARM64 digests are known,
   but provenance, independent SBOMs, vulnerability dispositions, non-root
   runtime compatibility, read-only-root behavior, writable-path boundaries,
   health checks, and startup/restore behavior have not been qualified.
4. PostgreSQL, Redis, MinIO, and `mc` have no image-level `User`. Their
   entrypoints may drop privileges internally, but the pilot contract requires
   explicit non-root execution and cannot infer that behavior from metadata.
5. The Hermes intake-worker implementation and image are not selected.
   `buzz-sprig` is only a possible upstream artifact; it has not been shown to
   satisfy the route-specific signed-owner and Hermes Runs API contract. T057
   cannot approve an unspecified intake image.

## Required next local evidence

Before T057 can be checked:

- select the exact current Buzz source and update the wrapper contract without
  changing the copied relay binary;
- select immutable store and initializer manifests, preferably versioned tags
  before resolving digests;
- define the minimum intake-worker image/entrypoint and prove route-specific
  signature/channel checks, exact Hermes API mapping, and no authority expansion
  for Walter, Titus, and Mitchel/Trevor profiles;
- generate independent SBOMs and current vulnerability scans for every exact
  ARM64 manifest;
- document every Critical/High finding with fixed-version and reachability
  disposition rather than accepting severity counts alone;
- run each image locally as the intended UID/GID with read-only root,
  allowlisted writable paths, dropped capabilities, and bounded resources; and
- execute startup, readiness, graceful-stop, and persistence probes using only
  synthetic local data.

All of this remains local Gate 0 work. Publishing a rebuilt wrapper or intake
image is a separate remote-state decision.

## Decision

T057 remains unchecked. The registry snapshot proves ARM64 availability, not
production qualification.
