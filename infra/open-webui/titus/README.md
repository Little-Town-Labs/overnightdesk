# Titus Open WebUI Runtime

This source provisions one pinned Open WebUI `v0.10.2` workload for the Titus
use case. It is isolated from Walter and Trevor, has its own named volume, and
reaches only `http://hermes-titus:8642/v1` on the private OvernightDesk Docker
network.

The runtime loads only `OPENAI_API_KEY` and `WEBUI_SECRET_KEY` from Phase App
`timeless-tech-solutions`, environment `production`, path
`/agents/open-webui/hermes-titus`. The service has no published host port.
Nginx is the only public ingress and calls the Vercel membership gate for every
HTTP, SSE, and WebSocket request.

Rollout order:

1. Apply and verify the guarded Tenet 2 foundation and Gary membership.
2. Provision the dedicated Phase path without printing either value.
3. Run `deploy-aegis.sh install-disabled` and `verify-private`.
4. Keep `TITUS_OPEN_WEBUI_AUTH_MODE=disabled` while running the log sentinel.
5. Install the route, enable the exact canonical canary confirmation in Vercel,
   and complete member/denial/logout/persistence checks.

Rollback removes the Nginx vhost and stops the service. It never deletes the
Open WebUI volume or changes Hermes Titus, Matrix, AgentMail, Teams, or Austin
authorization.

The one-shot volume initializer retains only the capabilities required to
traverse and normalize an existing UID-1000-owned `0700` data directory. This
makes restoration idempotent without weakening the long-running container.

The OIDC client requests `openid email profile offline_access` with S256 PKCE.
Access and ID tokens remain 15 minutes; the OvernightDesk provider rotates a
seven-day refresh token and rechecks canonical membership during issuance.
Native Hermes dashboard clients remain authorization-code-only.
