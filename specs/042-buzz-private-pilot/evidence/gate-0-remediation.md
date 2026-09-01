# Gate 0 Remediation Evidence

**Date**: 2026-09-01

**Scope**: Local, throwaway image/runtime experiments only. No Aegis, Phase,
tailnet control-plane, identity, GitHub, or remote-Git mutation occurred.

## Question

Can Gate 0 preserve the exact upstream Buzz relay artifact while replacing its
vulnerable runtime, and can the dedicated Tailscale ingress meet the same
non-root and vulnerability gates?

## Fixed Inputs

- Buzz source: `571c1902d0ca55cfd4ccf6b91eeb731909cc10be`
- Upstream Buzz index:
  `sha256:aa5180ce58ac367a125a1c079bfde88f8c158daa99e1aa5df86e8814649669f5`
- Upstream Buzz ARM64 manifest:
  `sha256:fcf052a4ee60324b4efd095539ce54afa9764b4d62013bc29721f9901e902aa1`
- Debian Trixie Slim index:
  `sha256:d7e12182ce18b85b93007c1dedf31f2d29e01ccf3182cc4017c709b6259bc132`
- Wolfi base index:
  `sha256:7e62cecd3c5712dba6e52c5260afb8f9d7a23b9bbcdd26ad7508a811e74b766d`
- Tailscale stable index:
  `sha256:8c42c4574ab066384fcb72f69e086a2ff1dd3652eb6f56856cee34bcf0d2f680`
- Tailscale ARM64 manifest:
  `sha256:7e3d9602f072a01ced5bb294d431cd9406a097f54e07cf48514fe2d6930691ab`
- Syft image: `anchore/syft:v1.51.0`, index
  `sha256:678bfa565b60f747aac0f8e964fe5588a24445b8d0a480e91f6efd70020dfbb0`
- Grype image: `anchore/grype:v0.116.1`, index
  `sha256:1e71065c0a4cff3e6bd3b8add525ffac4343eb4971694eb90a31cf6d4d3e85db`
- Grype DB: schema `v6.1.9`, built `2026-09-01T06:32:09Z`, valid.

## Exact Artifact Compatibility

The upstream ARM64 relay dynamically links only `libgcc_s`, `libm`, `libc`, and
the ARM64 loader. Source verification shows the runtime also shells out to Git
and installs a pre-receive hook that uses cURL and OpenSSL. Both wrapper
experiments therefore retained Git, cURL, OpenSSL, CA certificates, glibc, and
libgcc, copied only `/usr/local/bin/buzz-relay` and `/srv/buzz/web`, and ran as
UID/GID `1000:1000`.

Both wrappers passed these local runtime assertions under ARM64 emulation:

- exact entrypoint is `/usr/local/bin/buzz-relay`;
- effective identity is `1000:1000`;
- relay dynamic dependencies resolve;
- Git, cURL, and OpenSSL execute;
- the web entrypoint is readable;
- `/data/git` is writable while `/` is not writable by the runtime user.

## Experiment A: Debian Trixie Wrapper

- Local prototype result: `sha256:444b0859d8ac0199cb9dc2190f953b410e605094b1fd85cc0d2e520e8c3e05c5`
- Size: 92,670,886 bytes
- Vulnerability matches: 40 Critical, 62 High, 61 Medium, 6 Low, 90
  Negligible, 8 Unknown
- SBOM SHA-256:
  `37a799a4c1f0a142e25732ed6ef3852b063344b8febe182632437d817d1affa9`
- Scan SHA-256:
  `71a66e29b2f9a792b4f2c832f1b23257bf7a3cb6de3b1e8c9f5ac80fafdf9d8b`

**Disposition**: Rejected. It runs correctly but does not improve the hard
vulnerability gate.

## Experiment B: Wolfi Wrapper

- Qualified ARM64 manifest:
  `sha256:f98fe0e1cc0e66c547adbe325f93df48fb0c451753983e95abb6b89c97da54a2`
- Byte-identical OCI archive SHA-256 from two uncached builds:
  `1cbaf6065f92de8c999b3591c7cd65cd357af382ee0380d7cb02b14a270f5803`
- Size: 45,841,818 bytes
- SBOM components: 645
- Vulnerability matches: zero
- SBOM SHA-256:
  `35ddc0ae196521c9ce135f754a7a41622a60b03ced544c8e33725cf159eb18d5`
- Scan SHA-256:
  `196bc3adaf62d0b4ff39df4229e6302d04d29a015ca8ad07ffc4ce3cb1e1c7bb`
- Relay binary SHA-256 in both upstream and candidate images:
  `9347147d5d0f8c9f612d1fa7ee01b8fa6635e04768b63e2531ed2b805fbcf5b7`
- Contract result: 9/9 passing.

The promoted source is `infra/buzz/relay/Dockerfile`. It pins the Dockerfile
frontend, upstream image, Wolfi base, and every installed package version. Two
uncached ARM64 OCI exports used `SOURCE_DATE_EPOCH=1788236887`, disabled
provenance output, and enabled the OCI exporter's `rewrite-timestamp=true`.
They became byte-identical after removing the generated
`/var/cache/ldconfig/aux-cache`; the copied relay and web layers were already
identical. Runtime contracts proved UID/GID `1000:1000`, read-only root,
writable `/data/git`, Git/cURL/OpenSSL availability, exact entrypoint and
binary identity. A network-isolated process probe loaded the web and relay
configuration and then failed only at the deliberately unavailable synthetic
Postgres endpoint.

**Disposition**: Qualified as the local relay candidate. It is not yet a
deployable registry reference: publishing this exact OCI result and recording
the resulting registry digest require separate remote-state authorization.

## Experiment C: Official Tailscale Sidecar

- Version: `1.102.3-t53a0d659a`
- Default image user: root
- Non-root experiment: containerboot/tailscaled started in userspace mode as
  UID/GID `65532:65532` with state and LocalAPI socket redirected to a writable
  path. Startup produced expected non-fatal warnings for the unavailable root
  cache/symlink and UDP buffer tuning; setting `HOME` and supplying approved
  writable state/socket paths are required in the final contract.
- SBOM components: 585
- Vulnerability matches: 2 Critical, 22 High, 15 Medium, 6 Unknown
- Critical findings: `CVE-2026-63073` in `libcrypto3` and `libssl3` 3.5.7-r0;
  the scanner identifies 3.5.8-r0 as fixed.
- High findings include fixed OpenSSL package findings and fixed Go module
  findings in `golang.org/x/image` and `golang.org/x/crypto`.
- SBOM SHA-256:
  `01712ce20667c01139601a18052d7593aed254fcb711b11ce63c728b170a1806`
- Scan SHA-256:
  `dfe4f386de5f4a846881eb7e8728a0969f88610ac7162646f80a0992ae79bc9a`

**Disposition**: Rejected pending a fixed immutable upstream Tailscale release.
The pilot will not carry a custom Tailscale fork.

## Verdict

The relay half of Gate 0 passes locally. Gate 0 remains blocked solely on a
fixed immutable official Tailscale image that passes the same non-root runtime
and vulnerability contract. No Compose implementation or production approval
should proceed until both runtime images pass together; publishing the relay
candidate is also a later, separately authorized remote-state action.

## Primary References

- [Buzz source and container definition](https://github.com/block/buzz)
- [Tailscale Docker configuration parameters](https://tailscale.com/docs/features/containers/docker/docker-params)
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
- [Tailscale OAuth clients](https://tailscale.com/docs/features/oauth-clients)
- [Tailscale HTTPS certificates](https://tailscale.com/docs/how-to/set-up-https-certificates)
- [Wolfi overview](https://edu.chainguard.dev/open-source/wolfi/overview/)
- [Using Chainguard images](https://edu.chainguard.dev/chainguard/containers/how-to-use/how-to-use-chainguard-images/)
- [Docker reproducible builds](https://docs.docker.com/build/ci/github-actions/reproducible-builds/)
