# Walter Open WebUI Runtime

This source defines one pinned Open WebUI `v0.10.2` candidate for the Walter
platform-operations runtime. It installs without a public route, has its own
Linux account, runtime directory, container identity, named volume, OIDC client
metadata, cookie state, and rollback target, and reaches only
`http://hermes-walter:8642/v1` on the private OvernightDesk Docker network.

The host loader uses the `overnightdesk` Phase app-boundary service account at
`/opt/overnightdesk/secrets/phase-service-token` and reads only environment
`production`, path `/agents/open-webui/hermes-walter`. The candidate receives
an internal Hermes API bearer as `OPENAI_API_KEY` plus its own
`WEBUI_SECRET_KEY`; it never receives the Phase token or an OpenRouter key.

Walter's live Hermes configuration remains authoritative for model routing.
The private qualification requires provider `openai-codex`, default model
`gpt-5.6-sol`, and an `openai-codex` stored credential before and after the
candidate starts. OpenRouter may remain a separately named fusion reference in
Hermes, but interface installation cannot make it Walter's primary provider.

Rollout order:

1. Populate the exact Phase path without printing either value.
2. Run `deploy-aegis.sh install-disabled` and `verify-private`.
3. Confirm `walter-chat.overnightdesk.com` remains unrouted and no Nginx vhost
   was installed.
4. Run the log sentinel, restart-persistence, provider, and rollback gates.
5. Apply the reviewed platform OIDC/resource increment with the Walter client
   disabled, then verify the exact five bindings and one secret boundary.
6. Deploy the shared canonical authorization increment and set the platform
   `OPEN_WEBUI_AUTH_MODE=canonical` gate with its exact confirmation.
7. Start the candidate, enable the Walter OIDC client, run `enable-route`, and
   verify that unauthenticated access fails closed before owner acceptance.

Controlled rollback first disables the Walter OIDC client, then runs
`deploy-aegis.sh rollback`. That removes the Walter Nginx route and stops only
the Walter Open WebUI candidate while preserving its volume. TLS material may
remain for renewal and later recovery; it grants no route or application
authority by itself.

Rollback stops only this candidate and preserves its volume. It does not stop,
restart, or reconfigure the native Walter dashboard, Hermes API, email intake,
or primary Codex OAuth provider.

The deployment keeps the provider-facing model ID `hermes-agent` unchanged but
reconciles one public-read, deployment-owned model presentation named `Walter`.
Its avatar resolves through the canonical platform persona-logo endpoint. Arena
models are explicitly disabled and the runtime defaults to that single model
ID. `deploy-aegis.sh reconcile-persona` installs the same shared idempotent
seeder used by Titus, restarts only Walter Open WebUI, and preserves chats,
native-dashboard state, and unrelated database records.
