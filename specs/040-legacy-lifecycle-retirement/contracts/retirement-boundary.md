# Contract: Limited TTS Frontend Retirement Boundary

## Surviving user contract

| Surface | Required outcome |
| --- | --- |
| `/` | Minimal entry; direct an unauthenticated user to sign-in and an authenticated user to the dashboard |
| `/sign-in` | Existing account can authenticate; invalid credentials fail safely |
| `/reset-password` | Existing account can request and complete password recovery |
| `/dashboard` | Authenticated, membership-scoped selected-agent overview remains available |
| `/dashboard/chat` | Authorized selected-agent chat remains available |
| Advanced Dashboard links/OIDC | Exact current membership and active binding remain required |
| Managed variables | Only qualified catalog/boundary combinations can invoke the typed replacement contract |

No surviving response presents a plan, subscription status, billing action,
customer setup state, or customer lifecycle control.

## Registration denial contract

- `/sign-up` and `/verify-email` are absent and return 404.
- Direct Better Auth email-signup requests are disabled at the server boundary.
- A registration attempt creates zero `user`, `account`, `session`,
  verification, membership, subscription, or instance records.
- Sign-in and password reset remain functional for existing accounts.

## Retired route contract

These routes are absent after source activation and return 404 without redirect,
external call, or database mutation:

- `/pricing`
- `/checkout/success`
- `/api/stripe/checkout`
- `/api/stripe/portal`
- `/api/stripe/webhook`
- `/api/subscription`
- `/api/account/delete`
- `/api/wizard/write-step`
- `/api/wizard/complete`
- `/api/provisioner/callback`
- legacy customer `/api/instance/status`, `/auth-status`, and
  `/terminal-ticket` routes
- `/api/engine/restart`
- `/api/admin/hermes/dashboard-auth`

If implementation discovery proves one listed route is a current required
named-runtime read, work stops and the spec must be changed before preserving
it. A route is not retained merely because it has tests or is authenticated.

## Surviving service contract

### Privileged mutation

`POST /v1/managed-variable-replacements` remains governed by
`specs/022-agent-control-surfaces/contracts/managed-variable-replacement.md`.
No contract field or authority is widened.

### Operational support

- Health/readiness for the managed-variable service remains.
- A read-only session or Mitchel summary call may remain only when its current
  dashboard consumer is proven and it cannot mutate runtime, secret, ingress,
  certificate, or data state.

### Removed service authority

Dynamic provision, arbitrary write-secrets, configure-dashboard-auth, broad
restart, and deprovision operations are removed from the frontend client and
the eventual isolated Aegis service. Unknown or ambiguous consumers block
service-side deletion but do not authorize new callers.

## Error and security semantics

- Retired routes return no internal detail and perform no authentication lookup
  that could trigger side effects.
- Protected surviving routes retain current 401/403/404 semantics and exact
  membership checks.
- Submitted managed-variable values remain absent from logs, audits, metrics,
  errors, and responses.
- No Stripe, provisioner, Phase, Docker, ingress, certificate, or database
  mutation may occur while testing retired routes.
