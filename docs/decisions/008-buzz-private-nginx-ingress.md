# ADR-008: Route Buzz through a private-only Aegis Nginx listener

## Status

Proposed — planning approved and Issue #249 reopened on 2026-09-02; transport
and participant scope simplified by owner decision on 2026-09-02.
Implementation and production mutation remain separately unauthorized.

## Context

ADR-007 isolated Buzz behind a dedicated Tailscale container/device with its
own hostname, tag, certificate, and state. The qualified Buzz relay wrapper
passed local checks, but the official Tailscale runtime image failed the image
gate. That made the whole pilot depend on an ingress artifact outside our
control.

Reusing the existing Nginx process removes that dependency, but two naive forms
are unsafe:

- OvernightDesk `auth_request` requires a Better Auth session cookie and a
  known platform runtime. Buzz Desktop instead uses NIP-42 over WebSocket and
  NIP-98 signed HTTP, so the subrequest would reject the intended client.
- A hostname on the public Nginx listener is publicly selectable by known IP
  plus SNI/Host even if the hostname has no public DNS record.

The design must retain tailnet-only reachability, preserve Buzz's native signed
authentication, let the three named Hermes agents participate, and prevent any
change to existing public Nginx routes or the host's `ob1-mcp` Tailscale Serve
root.

## Decision

- Reuse the existing qualified Nginx process through a dedicated listener bound
  only to a freshly verified secondary private Aegis address with no public NAT
  path. After explicit approval, assign that exact address to the approved OCI
  VNIC and intended host interface and prove local binding before enabling
  Nginx or advertising the route.
- Advertise exactly that assigned address as `/32` through the existing Aegis
  Tailscale node. Accept the current tailnet-wide policy for the bounded pilot;
  do not add a Buzz-specific grant, tag, or temporary Tailscale API credential.
  Buzz's closed-relay membership is the participant authorization boundary.
- Use `wss://buzz.overnightdesk.com` as the exact WebSocket relay URL for relay,
  Desktop, Hermes intake workers, tests, and signed relay tags. Use the distinct HTTPS origin
  `https://buzz.overnightdesk.com` for NIP-98 and freeze every supported exact
  method and full request URL, including raw path and query, before testing.
  Neither external URL form includes an explicit default `:443` port. Use a
  private resolution override, treat any public wildcard DNS answer as
  untrusted, prove the public listener cannot select Buzz, and issue/renew TLS
  through DNS-01.
- Do not use OvernightDesk `auth_request`. Preserve Host, method, path, query,
  WebSocket upgrade, NIP-98 `Authorization`, and external HTTPS semantics;
  strip unrelated cookies and do not rewrite the URI.
- Require complete NIP-42 and NIP-98 contract tests through Nginx, not only a
  successful WebSocket upgrade.
- Use `buzz-ingress` for Nginx+relay, `buzz-data` for relay+stores, and
  `buzz-agents` for Nginx plus the Walter, Titus, and Mitchel/Trevor intake
  workers. No worker can address relay or stores directly.
- Give the owner and each named Hermes agent a separate Nostr identity. Agent
  identities have read/write messaging membership, are admitted one at a time
  after a canary, respond automatically only to the owner in one pilot channel,
  and gain no new business-action authority. Reuse the accepted route-worker
  pattern: validate the exact signed owner and channel, call only the mapped
  authenticated Hermes Runs API, and retain Hermes's existing tools, memory,
  model routing, and human approval policy. Do not add AgentMail's staging
  database boundary to this authenticated pilot channel.
- Install disabled. Activate and deactivate only the private include/listener
  with `nginx -t` and reload. Roll back the listener first, then the exact
  `/32`, then remove only the Buzz host-interface and OCI VNIC secondary
  address while preserving workload data and verifying existing services.

The exact private address, VNIC/interface assignment and removal procedure,
internal port, NIP-98 method/URL pairs, certificate automation, named-agent
intake contract, image digests, and capacity limits remain Gate 0 facts and
are not assumed here.

## Consequences

- The unqualified Tailscale container image, separate node state, OAuth key,
  MagicDNS hostname, and tag-owned certificate are removed.
- Tailnet transport remains independent of Buzz's Nostr membership gate.
  Transport rollback is an exact route/listener operation; participant
  revocation removes only the selected Buzz membership/intake identity.
- Buzz shares the existing Nginx process and its availability domain. Listener
  isolation, validation, reload-only lifecycle, and baseline comparisons are
  mandatory compensating controls.
- The hostname is certificate-visible and may inherit a public wildcard answer,
  but the public listener cannot select Buzz.
- Existing Tailscale Serve and public Nginx configuration must remain unchanged.
- This proposal does not qualify current upstream artifacts or authorize any
  production DNS, route, secret, identity, admission, or deployment mutation.

## Alternatives considered

### Keep the dedicated Tailscale sidecar

Rejected for this pilot because its unqualified runtime image remains a hard
dependency. ADR-007 preserves the historical rationale and evidence.

### Put Buzz on the public Nginx listener with no public DNS

Rejected because public clients can address the public IP and select the vhost
with SNI/Host.

### Put Better Auth/OIDC `auth_request` in front of Buzz

Rejected because the Desktop client does not carry the expected session and
would be blocked before native NIP-42/NIP-98 authentication.

### Extend the existing Tailscale Serve root

Rejected because it couples Buzz activation and rollback to the existing
`ob1-mcp` handler and retains hostname/path contract risk.

### Redesign the tailnet policy for owner-device-only reachability

Deferred because all visible devices are owner-controlled, share one Tailscale
user identity, and the current broad grant would not be narrowed by adding an
additive Buzz grant. Revisit device tags and deny-by-default policy before a
device or person outside this accepted pilot boundary joins the tailnet.

### Publish the relay directly or use bundled Caddy

Rejected because it adds a public or separately managed ingress surface and
does not reuse the qualified Aegis boundary.
