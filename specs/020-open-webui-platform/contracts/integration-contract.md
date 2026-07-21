# Open WebUI Integration Contract

## Assignment

- Active server-side membership plus the canonical runtime/resource bindings
  select exactly one approved Open WebUI origin.
- Client-supplied tenant IDs, hostnames, container names, or Open WebUI origins
  never select the workspace.
- No assignment returns unless the use case/runtime and membership are active
  and the canary or rollout policy enables Feature 020 for that exact runtime.

## Ingress

- Nginx is the only public route to Open WebUI.
- The Better Auth active-membership check runs before proxying. An existing
  runtime may retain its exact-owner read as migration compatibility. Titus has
  no legacy Open WebUI route: rollback disables its assignment and route.
- The membership check compares the requested Open WebUI host to the canonical
  runtime's recorded resource binding, not only to a broad Hermes classification.
- Inbound identity assertion headers are stripped even though OIDC is the
  preferred authentication mechanism.
- `Content-Security-Policy: frame-ancestors` permits only the approved
  OvernightDesk origins; framing is denied elsewhere.

## Identity

- Open WebUI uses a separate OIDC client per runtime deployment.
- Redirect URI: `https://<assigned-webui-host>/oauth/oidc/callback`.
- Scopes: `openid email profile offline_access` for Open WebUI only. Native
  Hermes dashboard clients remain authorization-code-only and do not request
  `offline_access`.
- PKCE: S256 when supported by both the pinned Open WebUI release and the
  OvernightDesk provider.
- Access and ID tokens remain limited to 15 minutes. Open WebUI receives a
  rotating refresh token with a seven-day maximum lifetime so an active
  Better Auth session can renew without storing platform credentials in the
  browser. The refresh-token grant re-runs the canonical membership check.
- Account linking by email remains disabled; stable issuer and subject claims
  identify the account.
- The exact `(issuer, subject)` pair is the local account key. The subject is
  the opaque Better Auth `user.id`; email and profile claims are display-only.
- OIDC client/audience, callback, requested hostname, canonical runtime, Open
  WebUI deployment, and Hermes target must all resolve to the same server-side
  assignment. A client-supplied Tenet number, tenant, runtime, hostname, or
  model endpoint cannot select or widen the workspace.
- Nginx rechecks the Better Auth session and active membership for HTTP,
  streaming, and WebSocket requests. An Open WebUI cookie does not remain
  authority after logout, suspension, expiry, or revocation.
- Local signup and password authentication remain available only for initial
  break-glass bootstrap, then are disabled after the OIDC rollback test.

The first adapter is Titus/Gary. It is valid only for the Titus Open WebUI
deployment and does not map Gary's membership to a Matrix MXID, AgentMail
sender, or Teams/Entra object. Walter follows with a separate client and
deployment; Mitchel/Trevor follows only after Mitchel's membership exists.

## Hermes Connection

- Open WebUI reaches only the assigned Hermes runtime on the private Docker
  network at `http://<runtime>:8642/v1`.
- The connection uses Chat Completions and a server-side `API_SERVER_KEY`.
- The key is read from Phase at deployment/start and never serialized into a
  Vercel response or browser-visible configuration.
- Open WebUI cannot add arbitrary model connections in the user role.

## Persistence

- One named volume stores one Open WebUI deployment's database and chats.
- Volume ownership follows the Hermes use-case boundary but does not replace
  Hermes runtime memory.
- Container recreation and rollback do not delete the volume.
- Backup, retention, and deletion policy must be documented before broad
  rollout because Open WebUI adds a new store of customer conversation data.

## Use-Case Secret Boundary

- Titus Open WebUI secrets use Phase App `timeless-tech-solutions`, environment
  `production`, under `/agents/open-webui/hermes-titus`.
- Walter Open WebUI secrets later use the `overnightdesk` App under a distinct
  runtime path.
- Each workload uses only the service-account identity for its Phase App. No
  Open WebUI secret or service-account token is stored in canonical identity
  records or shared between the deployments.

## Observability and Denial Tests

- Health checks report service readiness without exposing users, chats, keys,
  or connection configuration.
- Logs exclude prompts, responses, authorization headers, cookies, and Phase
  output.
- Authentication failures, cross-instance denials, canary changes, and
  administrative configuration changes emit metadata-only audit events.
- Request size, concurrency, model visibility, and model-cost consumption use
  explicit bounds; file upload and optional tools remain disabled in the MVP.
- Browser tests cover unauthenticated, non-member, suspended-member,
  wrong-use-case, active-member, logout, stale session, embedding denial from
  another origin, and fallback behavior.
