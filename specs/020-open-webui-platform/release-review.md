# T020d/T020e Open WebUI v0.10.2 Release and Authentication Review

**Reviewed**: 2026-07-20

**Decision**: CONDITIONAL GO for the active Titus/Gary production canary;
expansion remains blocked until each remaining T020e gate passes

**Production gate**: T020e must re-check the release/advisory state and pass the
value-suppressed container, callback-log, Nginx, and browser canary checks.

## Immutable review baseline

| Item | Pinned value |
| --- | --- |
| Release | `v0.10.2`, published 2026-07-01 |
| Signed source commit | `ecd48e2f718220a6400ecf49eafd4867a38feb10` |
| Image tag | `ghcr.io/open-webui/open-webui:v0.10.2` |
| Linux arm64 manifest | `sha256:0d58a66704d69e52da83f72bcd43869ad4fd0c761313778bc95ef6940a0b81e3` |
| Linux amd64 manifest | `sha256:1e65dff0143ff8de0be8082da9d461f298dee9cbd23b2023ac89929b284ce8e4` |
| Release fixture | `infra/open-webui/release.json` |

The tag resolves to the signed source commit above. The upstream compose file
uses `ghcr.io/open-webui/open-webui`, and the registry manifest exposes both
Linux architectures required for local qualification and the Aegis host.
T020e must deploy an architecture-specific digest, not a mutable tag.

Sources: [v0.10.2 release notes](https://github.com/open-webui/open-webui/releases/tag/v0.10.2),
[signed commit](https://github.com/open-webui/open-webui/commit/ecd48e2f718220a6400ecf49eafd4867a38feb10),
[upstream compose at v0.10.2](https://github.com/open-webui/open-webui/blob/v0.10.2/docker-compose.yaml).

## License and provenance decision

The selected source uses the Open WebUI License. It permits source and binary
redistribution but protects Open WebUI branding, with an exception for
deployments serving no more than 50 natural-person end users in a rolling
30-day period. The canary will retain the upstream branding. Any later
rebranding or rollout beyond that exception requires a fresh license review or
an enterprise license; this fixture is not approval for either.

Source: [license at v0.10.2](https://github.com/open-webui/open-webui/blob/v0.10.2/LICENSE).

## Release and advisory review

The release includes database-upgrade fixes and additional security/access
control fixes. The repository's published advisories were enumerated on
2026-07-20. Every published affected range ended below `0.10.0` or earlier, so
none listed `v0.10.2` as affected at review time. This is a point-in-time
result, not a durable safety claim: the project security policy supports
`main`, and the release notes warn that some fixes may be withheld briefly.
T020e therefore must repeat the advisory query immediately before production.

Sources: [v0.10.2 release notes](https://github.com/open-webui/open-webui/releases/tag/v0.10.2),
[published advisories](https://github.com/open-webui/open-webui/security/advisories),
[security policy](https://github.com/open-webui/open-webui/security/policy).

## Database and state behavior

- The default database is SQLite at `/app/backend/data/webui.db`.
- Database migrations are enabled by default.
- The upstream container health check calls `/health` on port 8080.
- OAuth tokens are encrypted and stored server-side in the `oauth_session`
  table. The browser receives an opaque `oauth_session_id` cookie.
- The dedicated `/app/backend/data` volume remains a new Titus conversation
  store. Rollback stops access but does not delete that volume.

Sources: [environment source at v0.10.2](https://github.com/open-webui/open-webui/blob/v0.10.2/backend/open_webui/env.py),
[OAuth session migration](https://github.com/open-webui/open-webui/blob/v0.10.2/backend/open_webui/migrations/versions/38d63c18f30_add_oauth_session_table.py),
[Dockerfile](https://github.com/open-webui/open-webui/blob/v0.10.2/Dockerfile).

## OIDC and session result

The pinned release supports one generic OIDC provider, the exact
`/oauth/oidc/callback` redirect, `openid email profile`, and secretless public
client operation when `OAUTH_CODE_CHALLENGE_METHOD=S256`. The T020d client is
therefore distinct from the native Hermes dashboard client and uses PKCE with
`token_endpoint_auth_method=none`.

The OIDC audience is the exact client ID. The adapter does not set Open
WebUI's optional `OAUTH_AUDIENCE`, which would add a separate authorization
query parameter; it instead requires the server-owned audience and client ID
to be identical and relies on normal ID-token `aud` validation.

Open WebUI's local lookup uses its fixed `oidc` provider key plus `sub`. The
OvernightDesk adapter preserves the stronger `(issuer, subject)` contract by
fixing one exact issuer per isolated deployment and deriving the deployment,
hostname, audience, runtime, and Hermes target server-side. Email is required
as a display claim by upstream, but `OAUTH_MERGE_ACCOUNTS_BY_EMAIL=false` keeps
it out of account linking.

The application JWT cookie is intentionally JavaScript-readable in this
release. It is an Open WebUI application session, not the platform authority.
Nginx must re-check the Better Auth session and current canonical membership
for ordinary HTTP, SSE, and WebSocket requests. Platform logout, membership
suspension/expiry, or route rollback therefore denies a retained Open WebUI
session before the upstream application.

Sources: [Open WebUI SSO/OIDC documentation](https://docs.openwebui.com/features/auth/sso/),
[OAuth implementation at v0.10.2](https://github.com/open-webui/open-webui/blob/v0.10.2/backend/open_webui/utils/oauth.py).

## Framing and browser policy

Security headers are opt-in environment variables in `v0.10.2`. The fixture
sets a `Content-Security-Policy` whose `frame-ancestors` are only `self`,
`https://overnightdesk.com`, and `https://www.overnightdesk.com`. It omits
`X-Frame-Options` because `DENY` and `SAMEORIGIN` would both conflict with the
approved cross-origin subdomain embed. Camera, microphone, and geolocation are
denied. T020e must verify the effective response contains one non-conflicting
CSP and no duplicate proxy/application frame header.

Sources: [security-header implementation at v0.10.2](https://github.com/open-webui/open-webui/blob/v0.10.2/backend/open_webui/utils/security_headers.py),
[hardening guide](https://docs.openwebui.com/getting-started/advanced-topics/hardening/).

## Log-hygiene blocker for T020e

Some malformed OIDC callback paths in `v0.10.2` log the token or full claim
object at warning level. The disabled fixture sets `GLOBAL_LOG_LEVEL=ERROR`,
disables Open WebUI's file audit log, and retains only the platform's
metadata-only authorization outcomes. That reduces exposure but is not enough
to approve production because broad exceptions may still render sensitive
details at error level.

Before enabling T020e, malformed callback tests must inspect container and
Nginx logs using known sentinel values and prove that tokens, cookies, raw
subjects, email, claims, prompts, and secrets are absent. If any sentinel is
present, patch or filter the upstream logger and re-run the test; do not enable
the route.

## Fixture evidence and rollback

`src/lib/open-webui-auth-spike.ts` and its controlled Titus fixtures prove:

- an active canonical Titus member receives the exact workspace;
- non-member, wrong-use-case, suspended, unauthenticated, wrong host/audience,
  trusted-header, unapproved-frame, oversized, unavailable-backend, optional
  capability, tool-authority, and storage-unavailable cases fail closed;
- top-level bootstrap, embedded session reuse, local logout/re-login, and
  platform logout have distinct state transitions;
- HTTP, SSE, and WebSocket requests all re-run the outer authorization gate;
- rollback disables only the new assignment while retaining the Open WebUI
  volume, Hermes runtime, Matrix, and email state.

This is deterministic contract evidence. It does not claim that an Open WebUI
container, Nginx route, Phase path, Better Auth client row, Vercel assignment,
Tenet 2 record, or Gary membership exists in production.

The separate local Chromium fixture adds browser proof for approved versus
unapproved framing, OIDC bootstrap/session reuse, workspace logout and
re-login, platform logout with a retained upstream cookie, and assignment
rollback. It contains no live identity, production endpoint, or secret.

## T020e production-source and advisory recheck

On 2026-07-20, the upstream release and advisory query were repeated before
production source was prepared. `v0.10.2` remained the latest release, and no
published Open WebUI advisory listed that version in an affected range. The
Aegis source pins the Linux arm64 image directly as
`ghcr.io/open-webui/open-webui@sha256:0d58a66704d69e52da83f72bcd43869ad4fd0c761313778bc95ef6940a0b81e3`;
it never deploys the mutable tag.

The platform dependency audit reports no high or critical findings. It does
report the existing moderate `@better-auth/oauth-provider` resource-indicator
advisory. OvernightDesk does not accept OAuth resource indicators: its outer
Better Auth hook rejects every `/oauth2/token` request whose body contains
`resource` before the provider handles the exchange. Unit coverage proves the
rejection and the normal fixed client/audience path. This is an explicit
mitigation pending a compatible fixed provider release, not a claim that the
installed package itself is patched.

The reviewed source adds:

- an exact public S256 PKCE client whose canonical database row is disabled by
  default and whose client contract is regression-tested against the OIDC
  authorization adapter;
- five exact Tenet 2 resource bindings, one dedicated Phase boundary, and
  separate confirmations for provision, enable, and disable operations;
- a pinned, rootless, read-only Open WebUI container with no published port,
  a dedicated persistent volume, and a private `hermes-titus:8642/v1`
  connection;
- an Nginx route that rechecks the Better Auth session and current canonical
  membership for HTTP, SSE, and WebSocket traffic, strips identity headers,
  constrains framing, request size, rate, concurrency, and capabilities, and
  logs URI metadata without query strings;
- a malformed-callback sentinel that is a hard stop if its known marker
  appears in Open WebUI or Nginx logs; and
- rollback that removes public routing, disables the OIDC client and Vercel
  canary mode, stops the service, and preserves the named volume and existing
  Titus Matrix/email paths.

This source review does not itself claim production identity rows, secrets,
containers, certificates, routes, sessions, chats, or browser evidence. Those
claims may be added only from the ordered post-merge T020e deployment record.

## Observed T020e production result — 2026-07-21

The ordered post-merge deployment is now active for the exact Gary/Titus
canary. Canonical identity, isolated workload and volume, TLS ingress, SSO,
clean browser load, real streaming chat, logout, and SSO re-entry passed. The
database retained one active non-orphaned chat for the same user, but that
conversation did not appear in the UI after re-entry and the browser made no
chat-list request. One earlier auxiliary OAuth refresh failed and removed that
auxiliary session while the chat itself completed through the static
server-side Hermes credential.

This result leaves the release decision conditional. Resolve retained-history
visibility and the OAuth refresh/session-lifetime contract, then complete
container recreation, controlled denial/restoration, rollback-time proof,
standard publication, and observation before broad rollout.
