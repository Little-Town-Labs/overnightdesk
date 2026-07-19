# Open WebUI Integration Contract

## Assignment

- The authenticated server-side instance record selects exactly one approved
  Open WebUI origin.
- Client-supplied tenant IDs, hostnames, container names, or Open WebUI origins
  never select the workspace.
- No assignment returns unless the instance is running and the canary or
  rollout policy enables Feature 020 for that exact instance.

## Ingress

- Nginx is the only public route to Open WebUI.
- The existing Better Auth owner check runs before proxying.
- The owner check compares the requested Open WebUI host to the instance's
  recorded assignment, not only to a broad Hermes classification.
- Inbound identity assertion headers are stripped even though OIDC is the
  preferred authentication mechanism.
- `Content-Security-Policy: frame-ancestors` permits only the approved
  OvernightDesk origins; framing is denied elsewhere.

## Identity

- Open WebUI uses a separate OIDC client per runtime deployment.
- Redirect URI: `https://<assigned-webui-host>/oauth/oidc/callback`.
- Scopes: `openid email profile`.
- PKCE: S256 when supported by both the pinned Open WebUI release and the
  OvernightDesk provider.
- Account linking by email remains disabled; stable issuer and subject claims
  identify the account.
- Local signup and password authentication remain available only for initial
  break-glass bootstrap, then are disabled after the OIDC rollback test.

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

## Observability and Denial Tests

- Health checks report service readiness without exposing users, chats, keys,
  or connection configuration.
- Logs exclude prompts, responses, authorization headers, cookies, and Phase
  output.
- Authentication failures, cross-instance denials, canary changes, and
  administrative configuration changes emit metadata-only audit events.
- Request size, concurrency, model visibility, and model-cost consumption use
  explicit bounds; file upload and optional tools remain disabled in the MVP.
- Browser tests cover unauthenticated, wrong-owner, correct-owner, logout,
  stale session, embedding denial from another origin, and fallback behavior.
