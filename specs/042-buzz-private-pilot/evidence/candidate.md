# Gate 0 Candidate Evidence

**Captured**: 2026-09-01

**Result**: **FAIL — upstream runtime image rejected; exact artifacts retained
only through the separately qualified local wrapper**

No secret or production mutation was used. Registry, upstream GitHub, and
local scanner outputs were treated as untrusted evidence and independently
cross-checked where possible.

## Source and CI

- Source: `https://github.com/block/buzz`
- Commit: `571c1902d0ca55cfd4ccf6b91eeb731909cc10be`
- Immutable commit page:
  `https://github.com/block/buzz/commit/571c1902d0ca55cfd4ccf6b91eeb731909cc10be`
- Docker workflow at that commit:
  `https://github.com/block/buzz/blob/571c1902d0ca55cfd4ccf6b91eeb731909cc10be/.github/workflows/docker.yml`
- Image workflow run: `33469954219`, event `push`, head SHA exactly the
  candidate commit, completed `success` at `2026-09-01T04:58:19Z`:
  `https://github.com/block/buzz/actions/runs/33469954219`
- All eight reported image workflow jobs completed successfully. This includes
  native `linux/arm64` build and the `Qualify relay image source` job that
  requires a successful same-SHA upstream `ci.yml` push run before publication.

Upstream security policy says only current `main` is actively supported and
previous releases are best-effort:
`https://github.com/block/buzz/blob/571c1902d0ca55cfd4ccf6b91eeb731909cc10be/SECURITY.md`.
During final verification, the upstream branch had advanced to
`70895b355fcea9f99894b426c020052b715bd368`; its `sha-70895b3` image was not
yet published. The latest published `main` image was instead tied by provenance
to `bd73490418266f267d9bb3bdf13e64582adc8e80`. Neither moving ref changes the
identity of the assessed immutable candidate.

## Image and Provenance

- Tag checked: `ghcr.io/block/buzz:sha-571c190`
- OCI index digest:
  `sha256:aa5180ce58ac367a125a1c079bfde88f8c158daa99e1aa5df86e8814649669f5`
- ARM64 manifest:
  `sha256:fcf052a4ee60324b4efd095539ce54afa9764b4d62013bc29721f9901e902aa1`
- ARM64 attestation manifest:
  `sha256:9b4f8f0d812a4086ccd9c1269612e2510e618133865620f0cdddaeff4239abfa`
- Platforms: native `linux/amd64` and `linux/arm64`, each with a separate
  attestation manifest.
- SLSA provenance binds `BUZZ_SOURCE_SHA`, OCI revision, and VCS revision to
  `571c1902d0ca55cfd4ccf6b91eeb731909cc10be`, source
  `https://github.com/block/buzz`, Dockerfile target `runtime`, and Actions run
  `33469954219` attempt 1.
- The upstream Dockerfile creates UID/GID `1000:1000` and ends with
  `USER buzz:buzz`:
  `https://github.com/block/buzz/blob/571c1902d0ca55cfd4ccf6b91eeb731909cc10be/Dockerfile`.

The registry had provenance attestations but `docker buildx imagetools
inspect ... --format '{{json .SBOM}}'` returned `{}`. An independent SBOM was
therefore required.

## Independent SBOM and Vulnerability Scan

Exact scanned subject:
`ghcr.io/block/buzz@sha256:fcf052a4ee60324b4efd095539ce54afa9764b4d62013bc29721f9901e902aa1`
(`linux/arm64`).

Pinned tooling:

- Syft `1.51.0` OCI index
  `sha256:678bfa565b60f747aac0f8e964fe5588a24445b8d0a480e91f6efd70020dfbb0`
- Grype `0.116.1` OCI index
  `sha256:1e71065c0a4cff3e6bd3b8add525ffac4343eb4971694eb90a31cf6d4d3e85db`
- Grype DB `v6.1.9`, built `2026-09-01T06:32:09Z`, validity check `true`

Generated artifacts were temporary and contained package/vulnerability
metadata only; their reproducibility hashes were:

- CycloneDX 1.7 SBOM: 5,076 components, 107 dependency entries,
  SHA-256 `dabe6c1c9b381abcfc27570852de7017431c5a8966492abc8fdcf6f7047de4eb`
- Grype JSON result: 370 package matches,
  SHA-256 `77f0619b6d6c9615d8602721da44e6820f2c0a2dcc530ddb7dfa81f88fd35490`

Severity totals are 35 Critical matches, 63 High, 118 Medium, 9 Low, 119
Negligible, and 26 Unknown. Deduplicated, the image has 11 Critical CVE IDs
and 30 High CVE IDs. All 98 Critical/High package matches were classified by
the Debian provider as `not-fixed` or `wont-fix`; none had a fixed version in
the scan result.

Critical IDs:

`CVE-2026-10536`, `CVE-2026-11856`, `CVE-2026-12087`, `CVE-2026-13221`,
`CVE-2026-42496`, `CVE-2026-5450`, `CVE-2026-57433`, `CVE-2026-7598`,
`CVE-2026-8376`, `CVE-2026-8924`, `CVE-2026-8927`.

High IDs:

`CVE-2023-2953`, `CVE-2025-13151`, `CVE-2025-59375`, `CVE-2025-69720`,
`CVE-2026-12064`, `CVE-2026-25210`, `CVE-2026-41080`, `CVE-2026-41992`,
`CVE-2026-42497`, `CVE-2026-45186`, `CVE-2026-48959`, `CVE-2026-48962`,
`CVE-2026-5435`, `CVE-2026-54369`, `CVE-2026-54370`, `CVE-2026-54874`,
`CVE-2026-57432`, `CVE-2026-58050`, `CVE-2026-58051`, `CVE-2026-5928`,
`CVE-2026-6276`, `CVE-2026-63072`, `CVE-2026-63076`, `CVE-2026-66032`,
`CVE-2026-66034`, `CVE-2026-66046`, `CVE-2026-7017`, `CVE-2026-8286`,
`CVE-2026-8932`, `CVE-2026-9538`.

The matches are predominantly Debian 12 runtime packages including curl,
libcurl, Perl, glibc, OpenSSL, libssh2, expat, ncurses, and ACL libraries.
Reachability was not proven for every CVE, but absence of demonstrated
reachability is not an accepted disposition for an internet-protocol relay
running on the shared production host. The security gate requires a rebuilt
candidate and fresh evidence, not a waiver.

### Newer published main comparison

The exact ARM64 manifest of the newer published `main` image was also scanned:

- Source SHA from provenance:
  `bd73490418266f267d9bb3bdf13e64582adc8e80`
- OCI index:
  `sha256:075f2922822d304f227aae83b256ccd3576197153f999cb78d449a47810fa66d`
- ARM64 manifest:
  `sha256:925c3bd9073463d2301f18eeb4367cc1e1cc0e26c27671bdcc8a21852f5d4f0a`
- CycloneDX SBOM SHA-256:
  `52cc68978b81f69c38823389d06ec5829fa5ba7149e0d42cb638289a96ace09d`
- Grype JSON SHA-256:
  `d8333c5dc17800abde9a00a1c9dd908d109466c82fbfa6bc92d5967987497a93`

Using the same pinned scanner and valid DB, the newer image produced the same
370 total matches, 35 Critical matches (11 unique IDs), 63 High matches (30
unique IDs), and 98 Critical/High matches marked `not-fixed` or `wont-fix`.
It does not resolve the blocker.

## Rollback Candidate

- Upstream release: `relay-v0.2.1`, commit
  `6e5c462ac524de60d7edb46c66130fd779cc9006`
- Release page:
  `https://github.com/block/buzz/releases/tag/relay-v0.2.1`
- Image tag: `ghcr.io/block/buzz:0.2.1`
- OCI index digest:
  `sha256:4e31b7c7abb7d00b6f513dc559e58d2b980416f1dc400aa01bcf762cf2989cfc`
- ARM64 manifest:
  `sha256:02e6f7d0b89e0ff9ca427a5e48303a7c59d9d4994cb698501470bb5d64ff14e8`

This is an availability/rollback handle only. It is not approved for new
deployment: upstream supports previous releases only best-effort, and it has
not passed the current vulnerability gate.

## Disposition

The upstream image remains rejected as a production runtime and is used only as
the immutable source of the exact relay binary and web assets. The promoted
Wolfi wrapper passed the replacement image gate locally; its reproducibility,
SBOM, zero-match scan, binary identity, and runtime evidence are recorded in
[`gate-0-remediation.md`](gate-0-remediation.md). Overall Gate 0 remains blocked
on the official Tailscale ingress image. Do not publish the wrapper, create
production Phase secrets, install files/services, pull a candidate on Aegis,
add backup targets, create identities, or activate ingress without the later
gate-specific approval.
