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
5. Add the separate platform OIDC/resource increment only after disabled
   qualification passes.

Rollback stops only this candidate and preserves its volume. It does not stop,
restart, or reconfigure the native Walter dashboard, Hermes API, email intake,
or primary Codex OAuth provider.
