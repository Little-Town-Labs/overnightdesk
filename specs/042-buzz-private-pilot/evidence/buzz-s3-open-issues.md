# Buzz open-issue review: S3 and object-store conformance

**Captured:** 2026-09-03T11:15:57Z–2026-09-03T11:20:00Z

**Repository:** [`block/buzz`](https://github.com/block/buzz)
**Scope:** Open GitHub issues and their linked pull requests; no comments, reactions,
or other remote changes were made.

## Conclusion

There is **no open issue that establishes a supported no-S3, media-free, Git-free,
or storage-free Buzz deployment mode**. There is also no open Buzz issue for Garage,
SeaweedFS, or `ListObjectVersions` compatibility.

The closest issue, [#2470](https://github.com/block/buzz/issues/2470), says that
turning off `BUZZ_GIT_CONFORMANCE_PROBE` and operationally quarantining Git allowed
a pilot to start on a non-conforming GCS backend. The reporter explicitly classifies
that as an availability workaround rather than a correctness fix. Its linked
[PR #2511](https://github.com/block/buzz/pull/2511) would expose a Helm toggle and
improve the failure message, but the PR remains open and review-required. Even if
merged, that toggle would waive only the Git CAS startup test; it would not make the
media and Git object-store clients or routes optional.

Open issues therefore support two narrower conclusions:

1. The probe can be disabled as an operator workaround, but doing so does not prove
   the backend satisfies Buzz's Git pointer-consistency contract.
2. S3-compatible implementations need operation-level qualification. “S3-compatible”
   alone is insufficient: existing issues document failures in conditional writes,
   range reads, ETag handling, addressing style, credentials, and deployment wiring.

The issue search does **not** validate the proposed storage-free pilot profile. That
profile remains an OvernightDesk-specific scope and architecture decision requiring
negative tests and an explicit statement that Git/media paths are unsupported.

## Directly relevant open issues

| Issue | Opened / updated | Evidence and relevance | Does it resolve our question? |
|---|---|---|---|
| [#2470 — Git object-store A3 conformance probe fails on GCS S3-interop](https://github.com/block/buzz/issues/2470) | 2026-07-23 / 2026-07-23 | GCS media operations worked, but Git pointer CAS failed because its S3 interoperability API did not honor the required conditional PUT behavior. Disabling the probe plus quarantining Git was used only as an availability workaround. A contributor links PR #2511. | **No.** It validates the distinction between bypassing the probe and satisfying the Git contract; it does not support running without S3. |
| [#2618 — Evaluate RustFS as the default S3 backend](https://github.com/block/buzz/issues/2618) | 2026-07-23 / 2026-07-23 | Proposes RustFS as a default or Compose-profile alternative. Its own acceptance plan requires Buzz's object-store suite plus conditional writes, ranges, multipart operations, listings, metadata, restart, and persistence tests. There are no comments or maintainer disposition. | **No.** It identifies RustFS as a candidate and argues for full qualification; it contains no compatibility evidence from Buzz itself. |
| [#2723 — Git conformance probe can hang startup](https://github.com/block/buzz/issues/2723) | 2026-07-24 / 2026-08-09 | Reports an unbounded startup hang, including with the bundled MinIO. Multiple reporters confirm that `BUZZ_GIT_CONFORMANCE_PROBE=false` restores startup while explicitly warning that it skips a real correctness gate. Linked PR #2724 adds timeouts but remains open and review-required. | **No.** It supports a temporary probe-disable workaround, not a storage-free mode or a conformance waiver. |
| [#3002 — Ceph RGW quoted-ETag incompatibility](https://github.com/block/buzz/issues/3002) | 2026-07-26 / 2026-07-26 | Ceph RGW returns a quoted ETag but rejects it when Buzz reuses it in `If-Match`, causing the CAS probe to fail. Linked PR #3003 normalizes the value but remains open and review-required. | **No.** It demonstrates that conditional-write compatibility is implementation-specific. |
| [#5241 — Probe leaves non-pack objects under `packs/`](https://github.com/block/buzz/issues/5241) | 2026-08-07 / 2026-08-07 | Reports that each startup probe leaves immutable test objects in the Git pack namespace, complicating safe retention and cleanup. There are no comments or linked accepted fix. | **No.** It questions probe hygiene, not whether Git storage can safely run without the probe or without S3. |
| [#4469 — Native Git repository unavailable after isolated restore](https://github.com/block/buzz/issues/4469) | 2026-08-03 / 2026-08-03 | A restored stack passed the S3 conformance probe while an authenticated repository clone still failed. | **No.** It shows that a passing CAS probe is necessary but not sufficient evidence for end-to-end Git recovery. |

## Adjacent S3 compatibility and deployment issues

These issues do not answer the conformance/no-S3 question, but they define additional
contracts any replacement backend must survive:

- [#3273](https://github.com/block/buzz/issues/3273) (opened/updated 2026-07-28):
  hardcoded path-style addressing prevents use of virtual-host-only providers.
- [#3786](https://github.com/block/buzz/issues/3786) (opened 2026-07-30; updated
  2026-08-17): Cloudflare R2 range reads fail through Buzz's pinned `rust-s3`
  behavior; linked PR #4079 remains open and review-required.
- [#3794](https://github.com/block/buzz/issues/3794) (opened/updated 2026-07-30):
  Compose hardcodes the MinIO endpoint and dependency, so an external backend needs
  an override that both replaces the endpoint and removes the MinIO dependency.
- [#5211](https://github.com/block/buzz/issues/5211) (opened/updated 2026-08-07):
  Helm defaults prevent selecting the AWS credential chain and can make the default
  conformance probe startup-fatal with placeholder credentials.
- [#4601](https://github.com/block/buzz/issues/4601) (opened/updated 2026-08-03):
  the media storage sweep can exceed its object cap and retry expensive bucket lists;
  its immediate mitigation is to turn storage metrics off, not to remove storage.

## Linked pull-request status

Status was read from the GitHub pull-request API at capture time.

| PR | Purpose | Status at capture |
|---|---|---|
| [#2511](https://github.com/block/buzz/pull/2511) | Clearer A3 error and Helm `git.conformanceProbe` toggle | Open; review required; not merged |
| [#2724](https://github.com/block/buzz/pull/2724) | Per-operation and whole-probe deadlines | Open; review required; not merged |
| [#3003](https://github.com/block/buzz/pull/3003) | Normalize Ceph ETags before `If-Match` | Open; review required; not merged |
| [#4079](https://github.com/block/buzz/pull/4079) | Media range-read fallback/diagnostics | Open; review required; not merged |

No submitted GitHub reviews were present on those four PRs at capture time. Issue
comments cited above were from users or contributors; no Block-member maintainer
statement accepting a no-S3 architecture was found.

## Search coverage

Queries used the official GitHub issue-search API with the common prefix
`repo:block/buzz is:issue is:open`. Relevant results were then inspected through the
official GitHub issue and pull-request APIs, including comments and linked PR status.

Broad and operation/backend terms:

- `S3`, `MinIO`, `"object storage"`, `"S3 backend"`, `BUZZ_S3_ENDPOINT`
- `"conformance probe"`, `"S3 conformance"`, `"object-store conformance"`,
  `BUZZ_GIT_CONFORMANCE_PROBE`, `A3`, `CAS`
- `"conditional writes"`, `"If-Match"`, `"If-None-Match"`
- `ListObjectVersions`, `versioning`
- `Garage`, `SeaweedFS`, `RustFS`

Optional/minimal-deployment terms:

- `"no S3"`, `"without S3"`, `"disable S3"`, `S3 optional`, `S3 required`
- `"optional media"`, `"media disabled"`
- `"optional Git"`, `"Git disabled"`
- `"storage-free"`, `"minimal mode"`

Zero-result or no-directly-relevant searches were especially important here:

- `Garage`: zero results.
- `SeaweedFS`: zero results.
- `ListObjectVersions`: zero results.
- `"storage-free"`, `"disable S3"`, `"optional media"`, and
  `"media disabled"`: zero results.
- `versioning` returned unrelated issues only.
- `"no S3"`, `"without S3"`, `"optional Git"`, and `"Git disabled"` returned
  lexical matches but no issue proposing or documenting a storage-free relay mode.
- `RustFS` returned #2618 and adjacent references, but no accepted implementation or
  maintainer decision.

GitHub's search API rate-limited some concurrent query attempts. Each material term
was either retried after reset or covered by a broader successful query and direct
inspection. The rate limiting did not change the zero/direct-match conclusions above.
