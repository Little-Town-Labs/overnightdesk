# ADR-002: Use OvernightDesk OIDC for Hermes Dashboard SSO

## Status

Accepted for implementation; production activation requires an isolated canary.

## Date

2026-07-18

## Context

OvernightDesk exposes each customer's native Hermes dashboard through a tenant
hostname. Hermes now requires a dashboard authentication provider when bound to
a reachable address. Basic Auth would introduce credentials customers do not
have, while Nous Portal OAuth would create a second account system and move the
customer identity boundary outside OvernightDesk.

The platform already authenticates customers with Better Auth and records one
authoritative owner for each Hermes instance. Hermes supports a self-hosted OIDC
provider using authorization code flow with S256 PKCE and an exact public
callback.

## Decision

Use OvernightDesk's Better Auth installation as a narrowly scoped OIDC provider
for Hermes dashboards:

- upgrade to the supported Better Auth 1.6.23 OAuth provider and compatible
  Drizzle ORM;
- provision one server-managed public client per instance, with no secret,
  exact callback, `openid profile email`, code flow, and S256 PKCE;
- issue RS256 access and ID tokens for 15 minutes, rotate signing keys every 30
  days, and publish old public keys for a one-hour grace period;
- enforce the canonical instance owner, running state, active client linkage,
  callback, and scope before code issuance and again during token creation;
- preserve nginx's exact host/owner verification as defense in depth and keep
  Hermes machine API-key authentication separate from browser SSO;
- keep existing tenants on their current protected auth until an isolated
  canary proves discovery, callback, full dashboard, expiry, logout, denial,
  key rotation, restart, and rollback.
- keep broad new-tenant provisioning disabled by default and permit an
  existing-tenant canary only through an admin-authenticated operation plus an
  exact tenant allowlist.

The `overnightdesk` repository owns issuer and client lifecycle behavior.
`overnightdesk-engine` owns non-secret Hermes configuration rendering and
restart. `overnightdesk-platform-standard` remains the live-state authority and
must label the design planned/canary until qualification succeeds.

## Alternatives Considered

### Retain Basic Auth for customers

- Pros: Small runtime change.
- Cons: Requires a second credential, weakens tenant lifecycle integration, and
  is documented for trusted networks or VPNs rather than public products.
- Rejected: Does not satisfy one-login customer access.

### Use Nous Portal OAuth

- Pros: Native hosted Hermes provider.
- Cons: Requires a Nous identity and transfers the customer login relationship.
- Rejected: Conflicts with the product ownership requirement.

### Replace the Hermes dashboard

- Pros: Complete UI control.
- Cons: Duplicates a mature high-impact management surface and creates ongoing
  compatibility and security work.
- Rejected: The native dashboard is an explicit product requirement.

### Build a custom OAuth server

- Pros: Maximum implementation control.
- Cons: Reimplements discovery, PKCE, token issuance, JWKS, rotation, replay
  protection, and security fixes already supplied by the supported provider.
- Rejected: Greater security and maintenance risk.

## Consequences

- Customers use one OvernightDesk login and retain the full Hermes UI.
- Dashboard access remains owner-only; teams and delegated administrators are
  deferred.
- Hermes maintains its own 15-minute cookie and logout. OvernightDesk logout is
  not globally coordinated in this release.
- The provider adds OAuth/JWKS tables and a nullable client link to the platform
  database, but deploying the schema does not activate a tenant.
- Provisioning becomes a cross-repository contract and requires idempotent,
  observable retries.
- Rollback disables the client and restores the prior protected config without
  deleting tenant data.

## Sources

- [Hermes dashboard authentication](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- [Better Auth OAuth provider](https://better-auth.com/docs/plugins/oauth-provider)
- [Better Auth JWT and key rotation](https://better-auth.com/docs/plugins/jwt)
- [OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700)
