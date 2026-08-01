# Quickstart: Titus Transcript Custody

## Local qualification

```bash
cd tenants/hermes-titus/meeting-processor
go test ./...
go test -race ./...
go vet ./...
../../../../scripts/qualify-mvp.sh 2>/dev/null || true
scripts/qualify.sh
```

Run the SecurityTeam contract tests in its own repository before the meeting
processor qualification.

## Production sequence

1. Deploy and verify the backward-compatible SecurityTeam block-mode contract.
2. Deploy the meeting processor with transcript content disabled.
3. Verify all four existing cursors, totals `1/1/0/0`, and version-2 state.
4. Run `scripts/deploy-aegis.sh enable-content`.
5. Observe only aggregate safe evidence until one transcript is `processed`.
6. Verify the private handoff structurally without printing the Titus output.
7. Restart only the meeting processor and prove `new_count=0` and
   `newly_processed=0` with the processed total retained.
8. Synchronize the platform standard and append `deploys.log`.

## Rollback

`scripts/deploy-aegis.sh disable-content` removes the root marker and restarts
only the meeting processor. It does not delete state, cursors, or derived
outputs and does not stop metadata discovery. Full worker rollback remains a
separate operator action.

## Production evidence policy

Print only service state, container hardening, cursor presence, artifact counts,
content lifecycle counts, retry counts, safe error codes, digests-present
booleans, and output-present booleans. Never print transcript or Titus output,
provider IDs/URLs, organizer IDs, credentials, or request bodies.

## Production result — 2026-08-01

- SecurityTeam dependency: PR 3, merge `4759c3f`, block-mode zero-queue canary
- Meeting worker: PR 161, merge `f7a4f3d`
- Disabled-first migration: state v2, retained totals `1/1/0/0`, one pending
  transcript, content credentials absent
- Gary transcript canary: processed `1`, blocked `0`, retryable `0`, retries `0`
- Custody verification: 22 value-safe checks passed; no retained raw/screened
  transcript payload and no secret-bearing container environment
- Restart idempotency: zero content lifecycle events, one processed retained
- Platform standard: PRs 74–76, canonical Aegis checkout `5112f11`
- Consumers: both OvernightDesk Ops listeners HTTP 200; meeting worker, Hermes
  Titus, and SecurityTeam healthy with scoped restart continuity
- Issue evidence: `#issuecomment-5152570035`; issue remains open only because
  recording ingestion and an Austin-organized pilot are separate remaining scope
