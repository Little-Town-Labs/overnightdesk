# Research: Composable Agent Workspace

## Decision 1: Keep chat embedded and launch the dashboard independently

**Decision**: The initial composition keeps the qualified Open WebUI chat iframe
and presents the native Hermes dashboard as a normal safe link opening in a new
tab or window.

**Rationale**: The operator can keep both surfaces available while each retains
its authentication and navigation lifecycle. A native link works without popup
APIs, maps naturally to mobile, and does not require weakening the dashboard's
framing policy. MDN documents `frame-ancestors` as the target-controlled policy
for which parents may embed a page and documents `noopener` as preventing a new
browsing context from controlling its opener.

**Alternatives considered**:

- Fixed split-view iframes: rejected for the initial prototype because it
  presumes dashboard framing permission and prescribes a desktop layout.
- JavaScript-sized popup: rejected because it adds a browser API/client bundle,
  popup-blocker behavior, and focus complexity without improving the contract.
- Replace chat with the dashboard in one iframe: rejected because it loses the
  simultaneous-availability requirement and can reset chat state.

**Sources**:

- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/noopener

## Decision 2: Resolve authority in a Server Component

**Decision**: Keep membership, instance, OIDC linkage, and URL derivation in the
App Router page and pass only the safe serializable composition to presentation.

**Rationale**: Next.js documents pages as Server Components by default and
recommends server-side access for databases and private data. The workspace
needs no client state for a native external link, so the server boundary also
keeps the client bundle unchanged.

**Alternatives considered**:

- Client fetch for capability URLs: rejected because it creates another auth
  boundary and loading state without user value.
- Put dashboard linkage into the Open WebUI directory query: deferred because
  instance dashboard auth state remains owned by the platform instance record.

**Sources**:

- https://nextjs.org/docs/app/getting-started/server-and-client-components
- https://nextjs.org/docs/15/app/guides/data-security

## Decision 3: Reuse the stable capability contract

**Decision**: `open_chat` and `advanced_dashboard` remain stable capability IDs
and feed one pure composition builder; no Walter/Titus variants are introduced.

**Rationale**: Feature 022 already established shared state semantics and exact
selected-agent resolution. Adding a second capability model would create drift
across Overview, Settings, Admin, and Chat.

**Alternatives considered**:

- A new workspace-only surface enum: rejected as duplicate policy.
- Persona-key switch statements: rejected because persona is presentation data,
  not an authorization or deployment boundary.

## Decision 4: Qualify Walter as a separate deployment boundary

**Decision**: Walter receives independent data, hostname, OIDC, service-account,
runtime, provider, and rollback resources. The interface reuses the shared
contract only after canonical assignment exists.

**Rationale**: Interface consistency must not merge credential, memory, session,
or provider boundaries. Walter's main Hermes model path deliberately uses Codex
OAuth, unlike Titus. OpenRouter can be used only as a named separately qualified
supplemental/fallback credential for chat integration.

**Alternatives considered**:

- Reuse Titus Open WebUI or its service account: rejected as cross-runtime
  authority and data leakage.
- Change Walter primary provider to match Titus: rejected as contrary to the
  accepted provider policy.
- Render a Walter chat placeholder before deployment: rejected because the UI
  must report not deployed truthfully.
