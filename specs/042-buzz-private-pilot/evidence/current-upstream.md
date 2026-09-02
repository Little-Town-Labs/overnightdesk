# Gate 0 Current Buzz Upstream

**Captured**: `2026-09-02T17:52:00Z` through `2026-09-02T17:56:00Z`

**Task**: T056

**Result**: complete as a current-fact snapshot; no upstream artifact is
thereby approved for production.

## Repository and support policy

The public `block/buzz` repository is active, Apache-2.0 licensed, and not
archived. At capture time its `main` ref was the verified commit
`2af9773d6271ce62cbe5dfbd28fbe5dd79372465`, dated
`2026-09-02T17:12:25Z`.

Buzz remains pre-1.0. Its current security policy actively supports only the
latest `main`; previous releases are best-effort and security fixes land on
`main` first. This means the 2026-09-01 wrapper input at `571c190...` is
historical and cannot silently remain the current deployment candidate.

Sources:

- <https://github.com/block/buzz>
- <https://github.com/block/buzz/commit/2af9773d6271ce62cbe5dfbd28fbe5dd79372465>
- <https://github.com/block/buzz/blob/2af9773d6271ce62cbe5dfbd28fbe5dd79372465/SECURITY.md>

## Current relay image publication

The `main` and `sha-2af9773` tags resolved to the same OCI index:

- index: `sha256:7f76dc54d211a38d5d2d65486a3d8a32b5d1939bb7344bdd3d7b818bf8f26b5e`;
- native Linux ARM64 manifest:
  `sha256:39ef881a08b7e50d5ce29cf93f86032663dfdd41c5e2c4ab961fa5706c8df4dd`;
- image user: `buzz:buzz`;
- entrypoint: `/usr/local/bin/buzz-relay`; and
- OCI revision: exact current commit `2af9773...`.

The image annotation binds Docker workflow run
<https://github.com/block/buzz/actions/runs/33659634330> and CI run
<https://github.com/block/buzz/actions/runs/33659634511> to the same commit;
both push runs completed successfully. The registry publishes native AMD64 and
ARM64 manifests plus provenance-style attestation manifests, but Buildx
returned no embedded SBOM and no readable SLSA document. Independent SBOM and
vulnerability evidence remains required by T057.

The legacy Git tag `relay-v0.2.1` still points to `6e5c462...`, but no current
GitHub Release object was returned for that tag. It is a historical rollback
reference, not a supported new-deployment candidate.

Source: <https://github.com/block/buzz/blob/2af9773d6271ce62cbe5dfbd28fbe5dd79372465/.github/workflows/docker.yml>

## Desktop/client status

The latest GitHub Release is `desktop-v0.5.20`, published
`2026-08-26T00:23:37Z` from `95154bee...`. It offers:

- signed macOS application archives for ARM64 and x64, plus DMGs;
- signed Linux AMD64 AppImage and an AMD64 Debian package; and
- a Windows x64 alpha installer named
  `Buzz_0.5.20_x64-setup_alpha-unsigned.exe` with a detached signature.

There is no Linux ARM64 Desktop package and no Windows ARM64 package in that
release. The intended owner's exact operating system/architecture and the
signature-verification/install procedure must therefore be frozen before
owner qualification. The release name itself identifies the Windows package
as unsigned; a detached signature does not make it Authenticode-signed.

Sources:

- <https://github.com/block/buzz/releases/tag/desktop-v0.5.20>
- <https://github.com/block/buzz/tree/95154bee4034ca7a40b33095c2ddbde8c9aa1614>

## Canonical relay URL behavior

Current upstream documentation distinguishes the relay's advertised URL from
client connection configuration:

- relay `RELAY_URL` is advertised in NIP-11 and NIP-42 challenges;
- the CLI accepts HTTP(S) input and normalizes it;
- `buzz-acp` requires the WebSocket form in `BUZZ_RELAY_URL`; and
- the CLI signs REST operations with NIP-98.

The current test guide names NIP-98 support for `POST /events`, `POST /query`,
and `POST /count`, but this is not yet a complete production operation
manifest. T062 must derive and freeze every pilot operation from the exact
selected client/relay source rather than assuming these three are exhaustive.

Sources:

- <https://github.com/block/buzz/blob/2af9773d6271ce62cbe5dfbd28fbe5dd79372465/TESTING.md>
- <https://github.com/block/buzz/blob/2af9773d6271ce62cbe5dfbd28fbe5dd79372465/crates/buzz-acp/README.md>

## Issue 6281

Issue <https://github.com/block/buzz/issues/6281> remains open, unchanged since
`2026-08-19`, with no maintainer comments. It reports that `BUZZ_RELAY_URL`
simultaneously controls the TCP/TLS target, HTTP Host, and signed NIP-42 relay
tag. A colocated client cannot substitute a direct internal relay target while
retaining the public canonical identity. This continues to support the design
requirement that Desktop and every Hermes intake worker traverse canonical Nginx.

## NIP-AA authority and revocation behavior

The current NIP-AA document remains `draft`, `optional`, and relay-scoped. An
agent can present an owner-signed NIP-OA `auth` tag during NIP-42. If the owner
is an active relay member, the agent receives virtual relay membership without
a persistent member record.

Material limitations for this pilot:

- virtual membership is connection-level read/write access;
- `kind=` constraints are not enforced at admission and restrict events only
  if the relay implements optional per-event enforcement;
- channel and resource checks continue to use the agent's own public key, not
  the owner's memberships;
- removing the owner blocks the agent's next connection but does not forcibly
  terminate an already active session; and
- immediate revocation requires explicit session enumeration/termination or an
  independent deny mechanism.

The current repository's Hermes client exposes capabilities, run submission,
run status, and approval response, but no run-cancellation operation. The Buzz
intake contract therefore rejects queued events not yet submitted and future
submissions and suppresses late-result publication after revocation. It does
not claim to terminate an already-submitted Hermes run; that run remains under
the runtime's existing tool and human-approval policy. NIP-AA alone does not
satisfy even this narrower intake/session boundary, so it remains explicitly
tested.

Source: <https://github.com/block/buzz/blob/2af9773d6271ce62cbe5dfbd28fbe5dd79372465/docs/nips/NIP-AA.md>

## Decision

T056 is complete. The canonical-hostname approach remains necessary, while
current source movement, missing registry SBOMs, the Windows unsigned-alpha
client, incomplete NIP-98 operation manifest, and NIP-AA active-session
revocation semantics remain explicit inputs to later gates.
