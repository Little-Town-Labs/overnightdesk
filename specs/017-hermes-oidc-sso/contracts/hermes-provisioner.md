# Contract: Hermes Dashboard Auth Provisioning

## Authentication

All endpoints remain protected by the existing constant-time
`Authorization: Bearer <PROVISIONER_SECRET>` check. The provisioner secret is
never included in request bodies, logs, tenant config, or callback evidence.

## Provision request extension

`POST /provision`

```json
{
  "tenantId": "tenant-slug",
  "subdomain": "tenant-slug.overnightdesk.com",
  "plan": "starter",
  "callbackUrl": "https://www.overnightdesk.com/api/provisioner/callback",
  "dashboardAuth": {
    "provider": "self-hosted",
    "issuer": "https://www.overnightdesk.com/api/auth",
    "clientId": "opaque-public-client-id",
    "publicUrl": "https://tenant-slug.overnightdesk.com",
    "callbackUrl": "https://tenant-slug.overnightdesk.com/auth/callback",
    "scopes": ["openid", "profile", "email"]
  }
}
```

The engine rejects the request before changing files or containers unless:

- tenant ID passes the existing slug validation;
- subdomain is an HTTPS OvernightDesk tenant host;
- provider is exactly `self-hosted`;
- issuer is HTTPS and equals the provisioner's configured allowed issuer;
- client ID is non-empty and within the bounded length;
- public URL has no path, query, fragment, user info, or non-default port;
- callback is exactly `<publicUrl>/auth/callback`;
- scopes are exactly `openid`, `profile`, and `email`, with no duplicates.

## Existing-tenant configuration

`POST /dashboard-auth`

```json
{
  "tenantId": "tenant-slug",
  "dashboardAuth": { "...": "same object as above" },
  "restart": true
}
```

The operation is idempotent. It validates first, reads the existing
tenant-local YAML, changes only `dashboard.public_url` and `dashboard.oauth`,
writes a same-directory temporary file with restrictive permissions, fsyncs,
renames atomically, and optionally restarts the exact tenant container. Unknown
Hermes configuration fields remain semantically unchanged.

Success response:

```json
{ "status": "configured", "restarted": true }
```

Failure responses are generic and must not echo config contents or credentials.
The original `config.yaml` remains in place on validation or write failure.

## Startup contract

The generated start script runs:

```text
hermes dashboard --host 0.0.0.0 --port 9119 --no-open
```

It must not use `--insecure`. Hermes reads the self-hosted provider from the
tenant config before binding publicly.

## Nginx contract

- Browser dashboard paths continue to use `/auth-verify` and exact
  `X-Original-Host` ownership verification.
- The proxy forwards `Host`, `X-Forwarded-Proto`, and `X-Forwarded-For` so
  Hermes generates the configured public callback.
- OIDC callback traffic uses the same browser owner gate.
- Hermes machine API authentication remains separate and is not replaced by
  the OIDC browser contract.

## Deprovision and rollback

Platform lifecycle code disables the OAuth client before calling
`POST /deprovision`. The provisioner preserves the data directory. Rollback
restores the previous protected dashboard auth block, removes only the OIDC
consumer block, restarts the canary container, and never deletes its volume or
tenant data directory.
