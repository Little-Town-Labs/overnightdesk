# Quality Review: Hermes Dashboard OIDC SSO

**Date**: 2026-07-18

**Gateway**: `code-review-and-quality`

**Verdict**: Approve for merge behind disabled rollout controls and isolated
database/preview qualification. Production OIDC activation remains blocked by
the explicit canary tasks.

## Context and scope

The change makes OvernightDesk a narrow self-hosted OIDC issuer for the native
Hermes dashboard, restricts authorization to the recorded instance owner, adds
an authenticated engine configuration boundary, and preserves Basic Auth as
the verified live rollback path. Review covered the platform feature branch
from `8f037b6`, the engine branch from `2d07f10`, the OIDC-only platform-standard
commit `70106d5`, and the current platform working tree.

The branch is intentionally split into specification, provider foundation,
authorization, provisioner, lifecycle, and qualification commits. Although the
aggregate feature is large, each runtime boundary remains separately reviewable
and owned by its existing repository.

## Resolved findings

1. **Required — Correctness/Security: requested `disabled` was stripped by the
   Better Auth create-client schema.** The client is now created secretless,
   persistently disabled and verified, and only then linked. Failed disablement
   removes the unlinked client and aborts provisioning. Regression tests assert
   ordering and cleanup.
2. **Required — Security: stopped linked instances escaped lifecycle
   revocation.** Account deletion and Stripe suspension/cancellation now revoke
   every linked instance, while deprovisioning remains limited to eligible
   infrastructure states. Running and stopped cases are tested.
3. **Required — Architecture/Security: the documented rollout flag was not an
   enforcement boundary.** New-tenant wizard completion now fails closed unless
   broad OIDC provisioning is explicitly enabled. Existing-tenant canary work
   uses an admin-authenticated route and exact tenant allowlist, so one canary
   does not enable all customers.
4. **Required — Correctness/Observability: existing-tenant reconfiguration had
   no platform orchestration, and several required event categories were only
   declared.** The admin route now orders ensure/recover, engine configure and
   restart, then activation; failure marks the client error and disabled.
   Revocation, callback failure, tenant mismatch, and JWKS failure paths emit
   redacted best-effort events.
5. **Required — Security: callback details could retain raw engine errors.**
   Stored details now use the stable `provisioning_failed` code, and tests prove
   raw callback text is absent.
6. **Required — Correctness: an active linkage with a missing client hid the
   launch button without recovery guidance.** The UI now presents a safe
   recovery state and never constructs an unsafe launch URL.
7. **Required — Security: authorization accepted an omitted response type at
   the local policy layer.** The owner policy now requires exact `code` response
   type in addition to exact callback, scopes, state, nonce, and S256 challenge.

All Required findings were corrected and their affected tests rerun. No
Critical or Required finding remains open.

## Five-axis result

### Correctness

- Owner authorization and token-time authorization use indexed canonical
  instance/client lookups and fail closed on ownership or lifecycle drift.
- Client creation, activation, disable, error and recovery transitions have
  ordering and rollback tests.
- Engine validation is exact for issuer, host, callback, client ID and scopes;
  YAML replacement is atomic and restart failure restores the prior config
  without touching tenant data.
- Full platform and engine automated suites pass. Actual code exchange, cookie
  behavior and production dashboard navigation remain canary evidence, not
  assumed results.

### Readability and simplicity

- OIDC contract building, authorization/lifecycle policy, audit redaction, and
  launch policy are separated into focused modules.
- The operator route is an orchestration layer over canonical lifecycle and
  provisioner helpers; it does not duplicate persistence or engine validation.
- Generic customer errors are distinct from internal status codes and audit
  categories.

### Architecture

- Platform identity, database and owner authorization remain in `overnightdesk`;
  filesystem/container mutation remains in `overnightdesk-engine`; live-state
  claims remain in `overnightdesk-platform-standard`.
- The browser OIDC flow never receives the Hermes machine API key.
- Broad rollout and the exact existing-tenant canary are separate controls.

### Security

- Public client, S256, RS256, exact issuer/audience/callback, short code/token
  lifetimes, no refresh grant, no dynamic registration, pre-code owner checks,
  and token-time rechecks are enforced.
- The known moderate OAuth resource-indicator advisory is mitigated by rejecting
  `resource` on the token endpoint before exchange. The remaining moderate npm
  findings are confined to the non-production Drizzle CLI toolchain.
- Changed-file inspection found no credentials, tokens, private keys or raw
  protocol artifacts. Audit records contain allowlisted metadata and a short
  client fingerprint only.

### Performance

- Authorization uses one bounded indexed join; token-time checking uses one
  bounded instance lookup. There are no new list endpoints or unbounded public
  queries.
- Lifecycle operations are administrative and bounded by the user's instance
  set. Dashboard UI changes do not add client-side fetching or bundle-heavy
  dependencies.

## Verification evidence

- Platform: 47 Jest suites passed, 1 skipped; 645 tests passed, 22 skipped.
- TypeScript: `npx tsc --noEmit` passed.
- Next.js: production build passed on 15.5.18 with build-only placeholders; no
  database was contacted.
- Engine: `go test ./...`, `go vet ./...`, and static provisioner build passed.
- Dependencies: MIT licenses verified for the two new auth packages; audit is
  0 critical, 0 high, 5 moderate with the boundaries documented above.
- Migration/diffs: additive SQL inspected; all three repository diff checks
  passed. Database-backed migration assertions remain for an isolated database.

## Non-merge rollout blockers

- T026: healthy native dashboard launch timing, 900-second Hermes cookie and
  logout clearing.
- T027/T036: isolated full authorization-code exchange and negative replay /
  verifier matrix.
- T055: approved production canary, key overlap, rollback timing and tenant-data
  preservation evidence.

The rollout controls keep these missing runtime proofs from becoming customer
exposure. Rerun this gateway after isolated database/preview work and again
after the approved production canary.
