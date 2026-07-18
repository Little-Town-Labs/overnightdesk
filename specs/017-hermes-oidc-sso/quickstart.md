# Quickstart: Develop and Qualify Hermes OIDC SSO

This is a development and qualification guide. It does not authorize a
production rollout.

## 1. Platform repository

```bash
cd /home/frosted639/src/overnightdesk-suite/overnightdesk
npm ci
npm test -- --runInBand
npx tsc --noEmit
npm run build
```

Use an isolated PostgreSQL database, apply the generated additive migration,
and verify that existing Better Auth sign-in, verification, password reset,
session, and tenant-auth tests still pass after the 1.6.23 upgrade.

### Phase 2 checkpoint — 2026-07-18

- `npm test -- --runInBand`: 39 suites passed, 1 skipped; 565 tests passed,
  22 skipped.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed with build-only placeholder configuration; the
  placeholder database URL is intentionally unreachable and no database access
  occurs during this checkpoint.
- Schema constraint tests passed (3 structural assertions); 19 database-backed
  assertions remain intentionally skipped until `DATABASE_TEST_URL` points to
  the isolated migration test database.
- The generated migration was inspected as additive. Historical migration
  journal metadata in this repository is incomplete, so `0008_hermes_dashboard_oidc.sql`
  was authored in the repository's existing additive sequence instead of
  accepting Drizzle's destructive full-schema regeneration.
- No tenant OAuth client was created or activated. Existing tenants remain on
  their current protected dashboard authentication path.

## 2. Engine repository

```bash
cd /home/frosted639/src/overnightdesk-suite/overnightdesk-engine
go test ./internal/hermes ./cmd/hermes-provisioner
go test ./...
make build-hermes-provisioner
```

Tests must prove malformed issuer, callback, client ID, scope, or tenant host
input cannot change a config file or restart a container. Inspect generated
startup content to confirm `--insecure` is absent.

## 3. Local/preview provider qualification

With a test instance and test client only:

1. Fetch `<issuer>/.well-known/openid-configuration`.
2. Confirm issuer, authorization, token, userinfo, and JWKS URLs share the
   canonical origin and base path.
3. Confirm discovery advertises S256 and RS256, and does not advertise dynamic
   registration or refresh-token use for the client.
4. Start authorization with exact callback, state, nonce, and S256 challenge.
5. Sign in as the owner and confirm one code is returned.
6. Exchange the code once and verify RS256 signature, `iss`, `aud`, `nonce`,
   `sub`, `email`, `name`, and at most 900 seconds of lifetime.
7. Replay the code and repeat with altered or missing state/nonce, a missing or
   mismatched verifier, plain PKCE, a stale signed query, and a disabled client.
   Confirm no second token or session is created.
8. Repeat as a non-owner and with the wrong host/client/callback/scope. Confirm
   no code, token, session, or tenant content is created.
9. Rotate the signing key, confirm the old and new public keys overlap for one
   hour, verify an unexpired old token and a new token, then confirm the old key
   ages out after the grace period in a time-controlled test.
10. Confirm `hermes_session_at` expires with the 900-second access token and
    `POST /auth/logout` clears every dashboard-auth cookie.

Never paste returned codes, tokens, cookies, verifiers, private keys, or full
authorization URLs into tickets, logs, test snapshots, or deployment evidence.

## 4. Canary checklist

Use the `aegis-ssh` skill for production preflight and any approved canary
operation.

- Capture container, route, auth, database, and data-volume state read-only.
- Back up the canary's current dashboard auth configuration without printing
  its contents.
- Create a disabled client and verify discovery/JWKS first.
- Apply the canary config and restart only that tenant.
- Activate its linkage and launch the tenant root as the owner.
- Exercise all native dashboard sections and inspect browser/server errors.
- Measure owner launch and silent reauthentication; each must complete within
  10 seconds under healthy conditions.
- Verify `hermes_session_at` expiry and silent reauthentication after 15
  minutes, then verify Hermes logout clears all dashboard-auth cookies.
- Verify non-owner, copied-link, disabled-client, and callback abuse cases.
- Rotate a test signing key with the documented overlap.
- Inspect the canary process listing and captured metadata-only evidence for
  prohibited credentials or protocol artifacts without printing secret values.
- Disable and restore the client, then run the rollback within five minutes.
- Prove the tenant data directory and named volumes are unchanged.
- Only after successful qualification, promote the platform standard from
  planned/canary status to verified live state and append `deploys.log`.

## 5. Required quality gate

Run `code-review-and-quality` after automated evidence is available and repeat
it after canary evidence. Record every finding by severity and review axis. Any
Critical or Required finding blocks the relevant merge or rollout decision;
fix it and rerun the affected tests and the gateway.

### Local qualification checkpoint — 2026-07-18

- `npm test -- --runInBand`: 47 suites passed, 1 skipped; 645 tests passed,
  22 skipped. The skipped set contains database-backed migration assertions
  that require an isolated `DATABASE_TEST_URL`.
- `npx tsc --noEmit`: passed; the production Next.js 15.5.18 build passed with
  build-only placeholder configuration and emitted both OIDC metadata routes
  plus the admin-only existing-tenant canary route.
- `npm audit --json`: 0 critical, 0 high, 5 moderate. The direct OAuth-provider
  resource-indicator advisory has no patched stable release; the token endpoint
  rejects every `resource` parameter before exchange. The other four findings
  are the non-production Drizzle CLI's old esbuild toolchain; no development
  server is exposed and the suggested forced downgrade is not accepted.
- `go test ./...`, `go vet ./...`, and `make build-hermes-provisioner`: passed.
  `golangci-lint` was unavailable, so `go vet` is the recorded static check.
- Additive migration, repository diffs, generated artifacts, and changed-file
  secret/protocol-artifact boundaries were inspected; diff checks passed and
  no credential material was found in the feature changes.
- The initial code quality gate had no unresolved Critical or Required finding
  and approved the guarded branch to proceed into isolated database/preview
  qualification, not OIDC production activation.

### Isolated Neon qualification checkpoint — 2026-07-18

With `DATABASE_TEST_URL` loaded from the OvernightDesk Vercel Development
environment and `DATABASE_URL` retaining its distinct normal endpoint, run:

```bash
npm run test:hermes-oidc-db
```

The command refuses a shared production/test URL, creates a uniquely named
disposable database on the test branch, applies every migration, runs the
database and provider matrices, and force-drops only that disposable database
in a `finally` block. It does not print connection URLs or protocol artifacts.

- The configured test endpoint was distinct from the normal application
  endpoint and accepted read-write disposable-database operations.
- Migrations `0000` through `0008` applied cleanly.
- `src/db/__tests__/schema-constraints.test.ts`: 1 suite and all 22 assertions
  passed, including the 19 database-backed assertions previously skipped.
- `scripts/qualify-hermes-oidc.ts`: 25 real-provider checks passed, covering
  one successful S256 code exchange, RS256 signature and claim validation,
  state echo and nonce binding, 900-second token lifetime, no refresh token,
  replay/missing/wrong verifier denial, rejected resource indicators,
  callback/scope/state/nonce/PKCE and non-owner denial, and post-revocation
  denial.
- The run exposed and corrected a real integration defect: Better Auth's
  administrative create-client API requires a privileged authenticated
  session. Server-side lifecycle provisioning now writes the exact public
  provider record through Drizzle with a 256-bit random client ID and
  `disabled=true` atomically before instance linkage.
- The disposable database was dropped after the successful run. No production
  database migration or tenant activation occurred.

## 6. Existing-tenant canary control

Keep broad provisioning disabled and allowlist only the approved tenant:

```text
HERMES_DASHBOARD_OIDC_ENABLED=false
HERMES_DASHBOARD_OIDC_CANARY_TENANT_IDS=hermes-agent
```

An authenticated platform administrator may then call
`POST /api/admin/hermes/dashboard-auth` with metadata-only JSON
`{"tenantId":"hermes-agent","action":"configure"}`. The route creates or
recovers the disabled client, applies and restarts the exact tenant through the
engine, and activates only after configuration succeeds. Use action `disable`
before rollback. Do not record the admin session, authorization headers, OAuth
queries, or returned cookies in evidence.
