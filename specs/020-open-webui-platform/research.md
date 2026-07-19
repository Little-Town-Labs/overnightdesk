# Research: Embedded Open WebUI Workspace

## Sources

- Hermes Agent, [Open WebUI Integration](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/open-webui)
- Open WebUI, [Environment Variable Configuration](https://docs.openwebui.com/getting-started/env-configuration/)

Reviewed 2026-07-19. Pin and re-review the selected Open WebUI release during
implementation; the configuration surface is version-sensitive.

## Threat Model

| Boundary | STRIDE concern | Required control |
|----------|----------------|------------------|
| Browser -> Vercel assignment | Spoofing/elevation through a client-supplied runtime or origin | Derive the assignment only from active membership, canonical runtime/resource bindings, and exact canary policy. |
| Browser -> Aegis Nginx | Spoofing, clickjacking, session confusion | Better Auth exact-membership gate, restrictive frame ancestors, secure cookies, denial tests, and metadata-only auth audit. |
| Nginx -> Open WebUI | Header spoofing or alternate-path bypass | Keep Open WebUI off host ports, strip inbound identity headers, and do not approve trusted-header auth without a separate threat model. |
| Open WebUI OIDC callback | Login CSRF, account collision, token disclosure | Exact redirect URI, state/nonce, S256 where supported, stable issuer/subject, email merging disabled, server-side token storage. |
| Open WebUI -> Hermes | Secret disclosure, SSRF-like connection changes, cross-runtime access | Fixed private-network connection, server-side key, non-admin user role, no user-controlled base URL. |
| Prompt -> Hermes tools | Prompt injection, excessive agency, cost/denial of service | Preserve Hermes tool policy, require approval for impactful actions, disable optional Open WebUI capabilities, and bound requests/concurrency/cost. |
| Open WebUI volume | Conversation disclosure, tampering, accidental deletion | Per-runtime volume, least-privilege process, backup/retention policy, restore test, and no deletion during rollback. |
| Logs and health endpoints | Repudiation or information disclosure | Metadata-only security events; exclude prompts, responses, headers, cookies, tokens, user lists, and connection details. |

Abuse tests must include an unauthenticated request, a valid user targeting
another workspace, a forged workspace origin, a forged identity header, framing
from an unapproved origin, an oversized request, an unavailable Hermes backend,
and a prompt that attempts to expand tool authority. Open WebUI is a user
interface, not an authorization boundary for Hermes tools.

## Decision 1: Aegis, not Vercel, owns the Open WebUI process

Open WebUI is a stateful Python application with accounts, chat history,
connection configuration, a secret key, and a persistent database. Hermes'
documented Docker setup mounts `/app/backend/data`. This does not fit a Vercel
Function lifecycle. Vercel remains the authenticated shell; Aegis owns the
long-running service and storage.

## Decision 2: One deployment per Hermes runtime/use case

A shared Open WebUI instance would place multiple use cases in one local user,
chat, connection, and admin database. Open WebUI model permissions can organize
access, but they are not the same boundary as separate runtime state. The
platform therefore mirrors its existing rule: separate primary memory means a
separate Hermes runtime and a separate Open WebUI deployment.

## Decision 3: Use OpenID Connect, with a canary auth spike

Open WebUI supports one generic OIDC provider with `OPENID_PROVIDER_URL`,
`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, an exact `OPENID_REDIRECT_URI`, and
optional S256 PKCE. Its default callback is `/oauth/oidc/callback`.
OvernightDesk already operates an OIDC provider for native Hermes dashboards,
but Open WebUI must use a distinct client and callback.

The spike must verify:

- the Open WebUI session cookie is usable when its same-site, cross-origin UI
  is embedded by `www.overnightdesk.com`;
- login/callback pages are not blocked by frame policy;
- logout semantics are understandable when the Better Auth SSO session remains
  valid;
- local signup/password login can be disabled only after OIDC is proven;
- account identity is based on a stable OIDC subject, with
  `OAUTH_MERGE_ACCOUNTS_BY_EMAIL=false`.

Trusted-header authentication is documented by Open WebUI but is not the
default choice. It requires Nginx to assert identity headers and the upstream
to be unreachable through any path that could spoof them.

## Decision 4: Use Chat Completions for the first release

Hermes documents `/v1/chat/completions` as the recommended Open WebUI mode.
Open WebUI sends full conversation history; Hermes creates an agent in the API
server runtime with that runtime's profile, model, memory, skills, and enabled
toolsets. Responses mode remains experimental and does not currently remove
Open WebUI's full-history behavior, so it adds risk without a required MVP
benefit.

## Decision 5: Treat Open WebUI as an untrusted capability surface

The UI can expose uploads, web search, model connections, tools, and admin
settings. Initial configuration is text-only, disables Ollama, restricts the
visible Hermes model/connection, disables public signup and local login after
OIDC verification, and grants no additional Hermes toolset merely because the
request came from Open WebUI. Tool calls execute on Aegis where Hermes runs.

## Decision 6: Embed only after explicit frame-policy validation

The Open WebUI response must allow `frame-ancestors` only for approved
OvernightDesk origins. Any upstream `X-Frame-Options` behavior must be inspected
against the pinned version before Nginx modifies it. The Vercel application's
current `microphone=()` policy means the MVP is text-only; voice requires a
later, narrowly scoped permissions-policy change.

## Rejected Alternatives

- **Keep extending the custom Vercel chat**: duplicates upstream conversation,
  account, tool-progress, and UI work while retaining the undeployed
  `/sessions` dependency.
- **Host Open WebUI in Vercel Functions**: incompatible with its durable data
  and long-running server lifecycle.
- **One shared Open WebUI for all runtimes**: creates a new cross-use-case data
  and administration boundary.
- **Expose Hermes API keys to the browser**: violates the secrets boundary and
  lets clients bypass Open WebUI and platform controls.
- **Make `/sessions` a prerequisite**: Open WebUI owns its own chat history; the
  provisioner session bridge would be legacy work with no Feature 020 benefit.
