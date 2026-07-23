# Contract: Native Dashboard Current-Authority Verification

## Nginx request

The internal Nginx subrequest sends:

```http
GET /api/auth/verify-tenant HTTP/1.1
Host: www.overnightdesk.com
Cookie: <opaque browser cookie>
X-Original-Host: titus-dashboard.overnightdesk.com
```

The request body is disabled and `Content-Length` is empty. The route is
dynamic and never trusts a browser-provided instance, runtime, use case, role,
or upstream URL.

## Resolution

1. Normalize and validate the exact lowercase original host.
2. Resolve exactly one running dashboard instance by that host.
3. Reject missing, duplicate, stopped, partial-link, or ambiguous state.
4. Verify the Better Auth session from the forwarded headers.
5. For a canonically linked instance, authorize the user through the exact
   use-case/runtime membership boundary.
6. For an unlinked legacy instance only, require exact `instance.user_id`.

Canonical authorization permits only an active membership with:

- active use case and runtime;
- matching exact runtime or use-case-wide membership;
- no suspension or revocation timestamp;
- no expired membership.

## Responses

| Result | Status | Body |
|---|---:|---|
| Authorized | 200 | empty |
| Missing/invalid session or authority | 401 | empty |
| Store failure or ambiguity | 401 | empty |

The route fails closed and returns no redirect, JSON, IDs, hostnames, membership
details, or internal error. Nginx owns the browser redirect behavior.

## OIDC parity

Hermes authorization-code and token issuance use the same canonical-vs-legacy
authority distinction. The exact callback, client audience, PKCE, verified
email, client state, dashboard state, and scopes must also pass. A valid Nginx
subrequest cannot compensate for a denied native OIDC request, or vice versa.

## Audit

Denials may record only bounded reason category, authorized internal instance
reference when already resolved, client fingerprint where applicable, request
ID, authority mode, and timestamp. Cookies, URLs, queries, email, names, tokens,
and exception messages are prohibited.
