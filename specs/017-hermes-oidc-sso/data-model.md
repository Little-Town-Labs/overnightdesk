# Data Model: Hermes Dashboard OIDC SSO

## Platform-owned entities

### `instance` additions

| Field | Type | Rules |
|---|---|---|
| `hermesOidcClientId` | text, nullable, unique | References `oauthClient.clientId`; null means no OIDC registration. |
| `hermesDashboardAuthStatus` | enum | `legacy`, `pending`, `active`, `disabled`, or `error`; defaults to `legacy`. |
| `hermesDashboardAuthUpdatedAt` | timestamptz, nullable | Last lifecycle transition; operational metadata only. |

The canonical authorization predicate is:

```text
instance.id == client.metadata.instanceId
AND instance.hermesOidcClientId == authorization.client_id
AND instance.userId == authenticated user.id
AND instance.status == running
AND instance.hermesDashboardAuthStatus == active
AND client.disabled == false
```

### `oauthClient`

Better Auth-owned OAuth client table generated from the provider plugin.

Required Hermes values:

| Field | Value/rule |
|---|---|
| `clientId` | Generated opaque identifier; unique; linked from one instance. |
| `clientSecret` | null |
| `disabled` | true until consumer configuration is verified; true on revoke. |
| `skipConsent` | true only for server-provisioned Hermes clients. |
| `redirectUris` | Exactly one `https://<instance.subdomain>/auth/callback`. |
| `tokenEndpointAuthMethod` | `none` |
| `grantTypes` | `authorization_code` only |
| `responseTypes` | `code` only |
| `public` | true |
| `requirePKCE` | true |
| `scopes` | `openid`, `profile`, `email` only |
| `metadata` | `{ kind: "hermes-dashboard", schemaVersion: 1, instanceId: <id> }`; no owner email, token, code, verifier, or secret. |

Client rows are created and changed only through server-side lifecycle code.
Dynamic registration and user-facing client CRUD are disabled.

### `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent`

These are Better Auth provider tables. Access tokens are hashed at rest and
expire after 900 seconds. Hermes clients never request `offline_access` and do
not permit the refresh-token grant, so refresh rows are not expected for this
flow. Consent is skipped only after owner authorization for a pre-provisioned
Hermes client; the table remains present because it is part of the provider's
supported schema.

### `jwks`

Better Auth JWT key table containing the public/private serialized key material,
creation time, and optional expiry. The private key is never returned by public
endpoints or included in logs. RS256 is configured explicitly. Keys rotate
every 30 days and old public keys remain discoverable for a one-hour grace
period, exceeding the maximum token lifetime, code lifetime, and clock skew.

### `platformAuditLog`

Existing table used for redacted events. Allowed OIDC details are limited to:

```json
{
  "instanceId": "internal instance id",
  "clientFingerprint": "non-reversible short fingerprint",
  "category": "start|success|denied|callback_failure|jwks_failure|revoked",
  "reason": "owner_mismatch|inactive_instance|invalid_client|invalid_callback|invalid_scope|tenant_mismatch|expired",
  "requestId": "platform correlation id"
}
```

Never store authorization query strings, email addresses, state, nonce, code,
PKCE verifier/challenge, access/ID token, cookie, private key, or raw provider
error bodies.

## State transitions

```text
legacy -> pending -> active
            |          |
            v          v
           error <-> disabled

active -> disabled on suspension, cancellation, deletion, or operator revoke
disabled -> pending only through an explicit recovery/reconfigure operation
```

- `pending`: client exists but tenant configuration is not yet qualified.
- `active`: client enabled, exact tenant config applied, launch may target root.
- `disabled`: client disabled before infrastructure cleanup; no new tokens.
- `error`: a lifecycle step failed; launch remains on the protected fallback.

## Integrity and indexing

- Unique `instance.hermesOidcClientId` prevents one OAuth client from serving
  multiple tenants.
- Foreign key uses `ON DELETE SET NULL` so provider cleanup cannot delete an
  instance; lifecycle code must transition status explicitly.
- Better Auth indexes client ID and token ownership fields.
- Owner checks query the primary instance ID and compare the linked client ID;
  no unbounded tenant scan is required.
- Existing `instance.userId` remains the sole owner authority. No duplicate
  team or membership model is introduced.

## Tenant-local entity

The engine atomically merges this non-secret document into the existing Hermes
configuration:

```yaml
dashboard:
  public_url: https://<tenant-host>
  oauth:
    provider: self-hosted
    issuer: https://<platform-auth-host>/api/auth
    client_id: <per-instance-public-client-id>
    scopes:
      - openid
      - profile
      - email
```

The exact callback is derived by Hermes as
`https://<tenant-host>/auth/callback`. No client secret or platform machine API
key appears in this document.
