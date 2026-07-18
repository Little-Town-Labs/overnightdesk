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

Run `code-review-and-quality` only after all automated and canary evidence is
available. Record every finding by severity and review axis. Any Critical or
Required finding blocks merge/readiness; fix it and rerun the affected tests and
the gateway.
