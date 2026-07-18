# Research: Hermes Dashboard OIDC SSO

## Decision 1: Use the supported Better Auth OAuth provider package

**Decision**: Upgrade `better-auth` from 1.5.5 to 1.6.23 and add
`@better-auth/oauth-provider` 1.6.23. Do not build on the legacy built-in OIDC
provider.

**Rationale**: The current package is the documented OAuth 2.1/OIDC provider,
defaults dynamic registration off, requires S256 PKCE for public clients, and
supports server-only client administration. The 1.6 line also contains provider
security and continuation fixes newer than the repository's 1.5.5 dependency.

**Alternatives rejected**:

- Legacy Better Auth `oidcProvider`: older surface, weaker historical defaults,
  and not the current supported path.
- A new custom issuer: duplicates authorization, token, JWKS, rotation, replay,
  and discovery logic with greater security risk.
- Nous-hosted identity: breaks the product requirement that OvernightDesk own
  the customer relationship and login.

**Sources**: [Better Auth OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider),
[Better Auth 1.6](https://better-auth.com/blog/1-6),
[Better Auth changelog](https://better-auth.com/changelog)

## Decision 2: Use public authorization-code clients with S256 PKCE

**Decision**: Provision one public client per instance with token endpoint auth
method `none`, response type `code`, grant type `authorization_code`, exact
callback `https://<tenant-host>/auth/callback`, and S256 PKCE. Dynamic client
registration and refresh-token grants remain disabled.

**Rationale**: Hermes documents itself as a public client and explicitly
requires authorization code plus S256 PKCE. A secret embedded in the tenant
runtime would not be confidential. Per-instance clients give exact callback,
audience, lifecycle, and revocation boundaries.

**Alternatives rejected**:

- One shared client: widens callback and tenant-confusion blast radius.
- Confidential client secret: the runtime cannot protect it as a confidential
  server credential.
- Basic Auth: documented for trusted networks or VPNs, not a public multi-tenant
  product, and creates a second login.

**Sources**: [Hermes dashboard authentication](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard),
[OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700),
[PKCE](https://www.rfc-editor.org/rfc/rfc7636)

## Decision 3: Enforce owner-only authorization twice

**Decision**: At authorization time, read the provider's verified signed OAuth
state, resolve its client, and query the canonical instance record. Require the
client link, owner ID, running state, active auth status, callback, and exact
scope set before issuing a code. Repeat the canonical owner/lifecycle check in
custom ID-token claims using server-managed client metadata.

**Rationale**: Normal OAuth answers whether a user authorized a client; this
product must additionally answer whether that user owns the exact tenant behind
that client. A token-time check prevents stale authorization state from
becoming a valid Hermes session if ownership or lifecycle changes mid-flow.

**Alternatives rejected**:

- Nginx check alone: important defense in depth, but it does not constrain ID
  token issuance or audience.
- UI-only launch checks: links and authorization endpoints are directly
  addressable.
- Trusting client metadata alone: metadata identifies the instance but the
  canonical instance row remains authoritative.

## Decision 4: Use RS256 with database-backed rotation

**Decision**: Enable Better Auth's JWT plugin with RS256 explicitly, store key
pairs through its JWKS schema, publish discovery/JWKS at the issuer path, and
retain an overlap window during rotation.

**Rationale**: Hermes accepts RS256 or ES256 and verifies against discovered
JWKS with pinned issuer and audience. Better Auth otherwise defaults to EdDSA,
which is outside Hermes' documented accepted algorithms.

**Alternatives rejected**:

- EdDSA default: not documented as accepted by Hermes.
- HS256/client-secret signing: incompatible with a public client and expands
  secret distribution.
- Static signing key in source or Vercel environment only: makes safe rotation
  and overlap harder than the provider's supported JWKS storage.

**Sources**: [Better Auth JWT](https://better-auth.com/docs/plugins/jwt),
[OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html),
[Hermes dashboard authentication](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)

## Decision 5: Short-lived tokens without offline access

**Decision**: Set authorization codes to 120 seconds and access/ID tokens to
900 seconds. Advertise and permit only `openid profile email`; do not allow
`offline_access` or the refresh-token grant for Hermes clients.

**Rationale**: The user accepted a short-lived independent Hermes session. A
valid OvernightDesk browser session can silently repeat SSO, while revocation
and ownership changes converge quickly without long-lived browser credentials.

**Alternatives rejected**:

- Better Auth's long default ID-token lifetime: unnecessarily extends access to
  a high-impact dashboard.
- Refresh tokens: increase durable token storage and revocation complexity for
  little user benefit in a browser SSO flow.
- Coordinated global logout: useful later, but explicitly out of scope for the
  first release.

## Decision 6: Keep nginx authorization and machine API auth separate

**Decision**: Retain `/auth-verify` for browser dashboard routes and retain the
existing Hermes machine API-key boundary for programmatic endpoints. OIDC
claims or tokens are not exposed to the product UI and do not replace the
machine API key.

**Rationale**: These controls protect different consumers. Nginx adds an exact
host/owner check at every browser request, while Hermes OIDC creates the native
dashboard session. Machine API authentication is not a browser credential.

## Decision 7: Use an additive, staged cross-repository rollout

**Decision**: Keep existing tenants on their current protected path until an
OIDC client is provisioned, the engine applies valid tenant configuration, and
the platform marks the linkage active. Add a reconfiguration operation for one
existing canary. Update the platform standard only after qualification.

**Rationale**: Identity deployment, provider configuration, and tenant runtime
configuration cannot be made atomic across Vercel, PostgreSQL, and a host
container. Explicit states and idempotent operations make retries and rollback
observable without deleting tenant data.

**Alternatives rejected**:

- Enable every tenant on code deploy: no isolated proof or safe rollback.
- Replace the native dashboard: rejects the user's product and UX constraint.
- Modify production manually without durable code: creates drift and cannot be
  reliably repeated for customers.
