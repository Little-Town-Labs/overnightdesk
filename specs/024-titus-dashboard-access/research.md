# Research: Titus Advanced Dashboard Access

## Decision 1: Use a dedicated Titus dashboard host

**Decision**: Route the native dashboard at
`titus-dashboard.overnightdesk.com`, separate from
`titus-chat.overnightdesk.com` and Walter's legacy
`aegis-prod.overnightdesk.com` host.

**Rationale**: Chat and dashboard are independent capabilities with different
applications, sessions, persistence, and rollback. A dedicated host keeps TLS,
cookies, routing, and recovery explicit while the platform still presents both
under the same selected Titus identity.

**Alternatives considered**:

- Reuse `titus-chat`: rejected because path sharing couples unrelated proxy,
  CSP, WebSocket, cookie, and rollback behavior.
- Reuse `aegis-prod`: rejected because that host is Walter's established native
  dashboard boundary.
- Use a path on `www`: rejected because it expands Vercel/proxy coupling and
  makes native-dashboard isolation less clear.

## Decision 2: Reuse the existing dashboard instance and OIDC lifecycle

**Decision**: Create one minimal, canonically linked dashboard-instance
projection for the existing Titus runtime and reuse the current Better Auth
Hermes public-client lifecycle. Do not create a second runtime or new schema.

**Rationale**: Selected-agent pages already resolve an exact linked instance by
runtime identity, and the established lifecycle already provides disabled,
pending, active, error, and rollback states. The projection carries only
dashboard routing/auth metadata and points to `hermes-titus`.

**Alternatives considered**:

- Add a new dashboard-assignment table and second OIDC implementation: rejected
  as duplicate lifecycle state for one existing capability.
- Treat Open WebUI's client as the dashboard client: rejected because callback,
  audience, application, and session boundaries differ.
- Expose only through Nginx with no native OIDC: rejected because the dashboard
  is a high-impact surface and the established native-session boundary provides
  defense in depth.

## Decision 3: Generalize current membership authority by canonical linkage

**Decision**: When a dashboard instance has exact use-case/runtime linkage,
both Nginx verification and Hermes OIDC authorization use the shared canonical
membership authorizer. Unlinked legacy instances retain the current exact-owner
fallback until migrated.

**Rationale**: The owner can have Titus and Walter, while another member may
have only one. A first-instance-per-user query or persona-name branch cannot
prove the requested host's authority. Canonical membership already models
active, suspended, revoked, expired, and runtime-scoped access.

**Alternatives considered**:

- Add Titus-only authorization logic: rejected as non-DRY and unsafe for the
  next agent.
- Keep `instance.user_id` as the only authorization rule: rejected because it
  cannot represent authorized non-owner members.
- Make every legacy tenant canonical in this increment: rejected as unnecessary
  blast radius; compatibility remains explicit and test covered.

## Decision 4: Require both Nginx authorization and native OIDC

**Decision**: Nginx rechecks the platform session, exact original host, and
current membership before every proxied request. Hermes independently requires
its short-lived self-hosted OIDC session.

**Rationale**: These gates fail at different boundaries. Nginx prevents direct
upstream access and converges membership changes on each request; Hermes binds
its own session to a public-client audience and continues to fail closed if the
proxy is misconfigured. Nginx officially allows only a 2xx authorization
subrequest, denies 401/403, and treats other results as errors.

**Sources**:

- https://nginx.org/en/docs/http/ngx_http_auth_request_module.html
- https://nextjs.org/docs/15/app/guides/data-security
- https://nextjs.org/docs/app/guides/authentication

## Decision 5: Bind on the private container network only

**Decision**: Configure a valid self-hosted OIDC provider first, then bind the
Titus dashboard to `0.0.0.0:9119` inside the existing private Docker network.
Continue publishing no host ports and never use `--insecure`.

**Rationale**: Nginx cannot reach a different container's loopback socket.
Hermes's supported remote-dashboard mode uses a non-loopback bind with a real
auth provider and refuses an unattended non-loopback start when no provider is
configured. Docker port publication is unnecessary because both containers
share the private network.

**Sources**:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard
- https://docs.docker.com/engine/network/
- https://docs.docker.com/engine/network/port-publishing/

## Decision 6: Keep the established public PKCE client contract

**Decision**: Use the existing exact callback, authorization-code, S256 PKCE,
`openid profile email`, no-secret, no-offline-access client contract.

**Rationale**: Hermes documents a self-hosted OIDC public client, and Better
Auth requires PKCE for public authorization-code clients. Separate clients
keep Titus and Walter audiences, callbacks, lifecycle, and revocation isolated.

**Sources**:

- https://better-auth.com/docs/plugins/oauth-provider
- https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard

## Decision 7: Stage activation with a reversible guarded reconciliation

**Decision**: Plan and verify the canonical projection and disabled client
before any route is active. Configure and privately test the exact runtime,
then enable TLS/routing and the client. Rollback disables auth first, removes
routing, restores loopback configuration, and preserves every volume.

**Rationale**: Database, Vercel, DNS/TLS, Nginx, and the Aegis runtime cannot be
changed atomically. Explicit state transitions and value-free evidence make
partial failure observable and recoverable.

**Alternatives considered**:

- Enable the link as soon as code deploys: rejected because it could advertise
  an unqualified or unprotected surface.
- Manual production-only edits: rejected because they drift from source and do
  not provide repeatable rollback.
