# Quality Review: Hermes Dashboard OIDC SSO

**Date**: 2026-07-18

**Gateway**: `code-review-and-quality`

**Verdict**: Approved and verified live for the exact `tenant-0` canary.
Broad rollout remains disabled. Isolated provider qualification, production
browser qualification, rollback, reactivation, and data-preservation checks
pass.

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
   type in addition to exact callback, scopes, state, and S256 challenge. A
   nonce is validated when supplied; Hermes v0.18 intentionally omits it from
   its authorization-code PKCE request.
8. **Required — Correctness/Security: Better Auth's administrative client
   creation API rejected the unauthenticated server-side lifecycle caller.**
   The isolated real-provider matrix exposed this before rollout. Lifecycle
   provisioning now persists the exact provider record through Drizzle with a
   256-bit random client ID, no client secret, and `disabled=true` in the same
   insert before instance linkage. The reproducible database harness refuses a
   shared or non-disposable target and drops its unique database in `finally`.
9. **Required — Security: a failed protocol assertion could have included its
   unexpected value in qualification output.** Both harness layers now report
   only an allowlisted stage name and error class. Assertion messages, response
   bodies, connection URLs, cookies, codes, verifiers, and tokens are never
   emitted.

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
- Full platform and engine automated suites pass. Real authorization-code
  exchange, RS256 verification, claim/TTL checks, negative protocol cases and
  revocation pass against an isolated provider database. Hermes cookie behavior
  and production dashboard navigation remain canary evidence, not assumed
  results.

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
- Provider client creation is secretless and disabled atomically before the
  client identifier can be linked to an instance. The qualification command
  refuses the normal database name and never prints connection or protocol
  credentials.
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

- Platform: 47 Jest suites passed, 1 skipped; 645 tests passed, 22 skipped in
  the database-free full-suite run.
- Isolated Neon database: migrations `0000` through `0008` applied; all 22
  schema assertions passed, including 19 database-backed assertions; 25 real
  OIDC exchange/abuse checks passed; the disposable database was dropped.
- TypeScript: `npx tsc --noEmit` passed.
- Next.js: production build passed on 15.5.18 with build-only placeholders; no
  database was contacted.
- Engine: `go test ./...`, `go vet ./...`, and static provisioner build passed.
- Dependencies: MIT licenses verified for the two new auth packages; audit is
  0 critical, 0 high, 5 moderate with the boundaries documented above.
- Migration/diffs: additive SQL inspected; all three repository diff checks
  passed. The tracked qualification command reproduced the isolated migration,
  provider exchange, and cleanup sequence without retaining secret artifacts.

## Production canary evidence

- The verified owner completed the Nginx tenant gate, Hermes self-hosted OIDC
  selection, Better Auth authorization, callback, and native `/sessions`
  dashboard flow with no second credential prompt.
- The Hermes session cookie was `HttpOnly`, `Secure`, `SameSite=Lax`, and had
  896 seconds remaining from the 900-second contract. Logout returned to
  `/login` and removed the cookie.
- Dashboard WebSocket handshakes passed after adding upgrade forwarding; the
  final browser run reported no console or page errors.
- The public client remained secretless, exact-contract, linked, enabled, and
  active only after the provisioner confirmed the guarded restart.
- The rollback disabled the client, restored the exact protected pre-canary
  config SHA, advertised Basic Auth, retained 23,663 data files, and completed
  in 57 seconds. Reactivation restored self-hosted OIDC and the final browser
  checks.
- URL newline/path corruption and Hermes' optional-nonce request shape gained
  regression tests. The final gateway passed 655 tests, TypeScript, and the
  optimized production build. The repository's pre-existing `next lint`
  command remains interactive and is not a usable CI gate.

No Critical or Required finding remains open. Broad rollout remains controlled
by `HERMES_DASHBOARD_OIDC_ENABLED=false`; only `tenant-0` is allowlisted.
