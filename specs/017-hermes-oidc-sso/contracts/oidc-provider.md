# Contract: OvernightDesk OIDC Provider for Hermes

## Issuer

The issuer is the deployed Better Auth base URL including its `/api/auth` base
path. Production configuration must use one canonical HTTPS origin; expected
shape:

```text
https://www.overnightdesk.com/api/auth
```

Hermes must configure and validate that exact issuer. Redirect aliases are not
valid issuer substitutes.

## Discovery and key endpoints

| Operation | Method and path |
|---|---|
| OIDC discovery | `GET <issuer>/.well-known/openid-configuration` |
| OAuth authorization server metadata | `GET /.well-known/oauth-authorization-server/api/auth` |
| Authorization | `GET <issuer>/oauth2/authorize` |
| Token exchange | `POST <issuer>/oauth2/token` |
| JWKS | URL advertised as `jwks_uri` by discovery |
| UserInfo | URL advertised as `userinfo_endpoint` by discovery |

Metadata must advertise `authorization_code`, response type `code`, token
endpoint auth method `none`, code challenge method `S256`, signing algorithm
`RS256`, and scopes `openid profile email`. Dynamic registration must not be
advertised.

## Per-instance client

```json
{
  "redirect_uris": ["https://<tenant-host>/auth/callback"],
  "scope": "openid profile email",
  "client_name": "OvernightDesk Hermes Dashboard",
  "token_endpoint_auth_method": "none",
  "grant_types": ["authorization_code"],
  "response_types": ["code"],
  "type": "user-agent-based",
  "skip_consent": true,
  "require_pkce": true,
  "metadata": {
    "kind": "hermes-dashboard",
    "schemaVersion": 1,
    "instanceId": "<internal-instance-id>"
  }
}
```

Client creation and restricted-field updates are server-only. The returned
client must have no client secret. The client remains disabled or the instance
link remains non-active until the tenant consumer configuration is verified.

## Authorization requirements

An authorization request is eligible only when all are true:

- the signed continuation query is valid and unexpired;
- `client_id` resolves to a server-provisioned Hermes client;
- the exact requested callback equals both the client callback and
  `https://<linked-subdomain>/auth/callback`;
- requested scopes are exactly a subset of `openid profile email` and include
  `openid`;
- PKCE challenge and method S256 are present;
- the authenticated and email-verified Better Auth user is the linked instance
  owner;
- the linked instance is running and dashboard auth is active;
- the client is not disabled.

Failure returns a standard OAuth-safe error or the existing generic sign-in
error. It must not reveal another tenant, owner, callback, or internal provider
exception.

## ID token contract

| Claim | Rule |
|---|---|
| `iss` | Exact issuer above |
| `aud` | Exact per-instance client ID |
| `sub` | Stable Better Auth user subject |
| `email` | Verified owner email when `email` scope is granted |
| `name` | Owner display name when `profile` scope is granted |
| `iat`, `exp` | Maximum 900-second lifetime |
| `nonce` | Echoes and binds the authorization transaction |

Tokens use RS256 and a `kid` present in the published JWKS. Signing keys rotate
every 30 days and prior public keys remain published for a one-hour grace
period. No instance secret, role elevation, machine API key, subscription
detail, or platform admin claim is issued.

Hermes binds `hermes_session_at` to the access-token TTL, so the dashboard
session expires after 900 seconds. `POST /auth/logout` clears the dashboard auth
cookies; OvernightDesk global logout coordination remains out of scope.

## Error and audit contract

Protocol errors are returned using OAuth/OIDC fields but logs record only a
safe category, reason code, internal instance ID where already authorized, a
client fingerprint, request ID, and timestamp. Raw queries and protocol
artifacts are prohibited from logs and error telemetry.
