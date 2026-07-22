# Research: Agent Control Surfaces

## Decision 1: One server-resolved selected-agent context

**Decision**: Extend the existing canonical membership-filtered directory and
derive one selected-agent context used by Overview, Settings, and agent-scoped
Admin content.

**Rationale**: The production inconsistency is caused by mixing canonical agent
selection with a legacy `instances[0]` fallback. A single exact context removes
cross-agent leakage and makes capability differences data.

**Alternatives considered**: Per-page resolvers duplicate authorization and
drift. A client global store would turn presentation state into an authority
input. Hard-coded Titus/Walter components violate the variable identity model.

## Decision 2: Explicit capabilities, stable panel structure

**Decision**: Runtime and capability rows always render. Availability is one of
`available`, `not_deployed`, `unavailable`, or `not_applicable`.

**Rationale**: Omitting sections makes two agents look like different products
and hid the Titus Runtime data defect. Explicit states communicate truth while
keeping the interface predictable.

**Alternatives considered**: Hiding unavailable features is compact but caused
the reported inconsistency. Placeholder actions could imply authority or a
deployment that does not exist.

## Decision 3: URL selection with Server Components

**Decision**: Keep `?agent=<presentation-key>` as shareable UI state; validate it
against the authenticated server-side directory on each page request.

**Rationale**: Next.js App Router pages/layouts are Server Components by default,
which keeps database/session work on the server while small Client Components
handle interaction. An explicit invalid selection can return not found instead
of silently changing agent. Source:
https://nextjs.org/docs/app/getting-started/server-and-client-components.

**Alternatives considered**: Browser storage is non-shareable and can become
stale. Cookies add hidden state and cross-tab confusion. Client-side directory
fetching delays authorization-sensitive rendering.

## Decision 4: Global versus agent scope is visible

**Decision**: Account controls, fleet, and aggregate metrics are global;
Runtime, integrations, and managed variables are selected-agent scoped.

**Rationale**: Scope clarity prevents an operator from rotating or interpreting
data for the wrong runtime. It also keeps account controls available if the
agent directory is unavailable.

**Alternatives considered**: Making every page agent-scoped mislabels fleet and
account data. Keeping mixed cards preserves the current ambiguity.

## Decision 5: Allowlisted replacement, never a Phase browser

**Decision**: Clients submit only a catalog variable ID, selected authorized
agent key, new value, and confirmation. The server derives Phase coordinates
and never returns existing values.

**Rationale**: Phase documents server-side REST secret create/update support,
service-account role inheritance, App SSE requirements, and account rate
limits. A server broker can enforce the platform's narrower policy. Sources:
https://docs.phase.dev/public-api,
https://docs.phase.dev/public-api/secrets,
https://docs.phase.dev/access-control/service-accounts,
https://docs.phase.dev/access-control/authentication/tokens.

**Alternatives considered**: A generic proxy exposes paths and keys. PATs bind
automation to a human and can return personal overrides. A browser token would
expose secret-store authority. Direct Vercel tokens for both Apps unnecessarily
centralize blast radius.

## Decision 6: Provisioner enhancement is a separate gate

**Decision**: Harden the frontend now, but do not claim canonical Phase writes
until `overnightdesk-engine` supports an exact boundary-aware contract.

**Rationale**: The live provisioner currently writes an arbitrary map to one
configured Phase App at `/{tenantId}`. Titus and Walter have separate approved
Apps/paths. Reusing the current endpoint would violate the secret boundary.

**Alternatives considered**: Translating canonical bindings back to tenant IDs
would silently collapse trust boundaries. Putting multiple Phase service tokens
in Vercel is possible but expands frontend compromise impact and duplicates the
existing Aegis secret-injection owner.

## Decision 7: Metadata-only audit with fail-closed success

**Decision**: Record actor ID, use-case/runtime IDs, catalog variable ID,
operation, outcome, and timestamp. Never record value length, hash, prefix,
external body, token, email, or raw subject. Success is not returned if required
audit persistence fails.

**Rationale**: This supports repudiation controls without creating a derivative
secret oracle. Existing `platform_audit_log` is sufficient; no schema migration
is required.

**Alternatives considered**: Logging value hashes can enable confirmation
attacks on low-entropy values. Best-effort audits violate the production trust
requirement.
