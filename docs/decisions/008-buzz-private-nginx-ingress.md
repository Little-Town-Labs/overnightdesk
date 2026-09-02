# ADR-008: Route Buzz through a private-only Aegis Nginx listener

## Status

Proposed — planning approved and Issue #249 reopened on 2026-09-02.
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
authentication, and prevent any change to existing public Nginx routes or the
host's `ob1-mcp` Tailscale Serve root.

## Decision

- Reuse the existing qualified Nginx process through a dedicated listener bound
  only to a freshly verified private Aegis address with no public NAT path.
- Advertise exactly that address as `/32` through the existing Aegis Tailscale
  node. Treat route advertisement/approval and the deny-by-default grant for
  approved owner devices as separate controls.
- Use `wss://buzz.overnightdesk.com` as the exact relay URL for relay, Desktop,
  canary, and tests. Provide no public A/AAAA record and issue/renew TLS through
  DNS-01.
- Do not use OvernightDesk `auth_request`. Preserve Host, method, path, query,
  WebSocket upgrade, NIP-98 `Authorization`, and external HTTPS semantics;
  strip unrelated cookies and do not rewrite the URI.
- Require complete NIP-42 and NIP-98 contract tests through Nginx, not only a
  successful WebSocket upgrade.
- Use `buzz-ingress` for Nginx+relay, `buzz-data` for relay+stores, and
  `buzz-canary` for Nginx+canary. The canary cannot address relay or stores
  directly.
- Install disabled. Activate and deactivate only the private include/listener
  with `nginx -t` and reload. Roll back ingress first, then the exact grant and
  `/32`, while preserving workload data and verifying existing services.

The exact private address, internal port, certificate automation, grants, image
digests, and capacity limits remain Gate 0 facts and are not assumed here.

## Consequences

- The unqualified Tailscale container image, separate node state, OAuth key,
  MagicDNS hostname, and tag-owned certificate are removed.
- Tailnet transport remains independent of Buzz's Nostr membership gate, but
  revocation is now an exact route/grant/listener operation rather than deleting
  a dedicated device.
- Buzz shares the existing Nginx process and its availability domain. Listener
  isolation, validation, reload-only lifecycle, and baseline comparisons are
  mandatory compensating controls.
- The hostname is certificate-visible but has no public resolution or public
  listener path.
- Existing Tailscale Serve and public Nginx configuration must remain unchanged.
- This proposal does not qualify current upstream artifacts or authorize any
  production, DNS, route, secret, identity, Issue, Project, or Git mutation.

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

### Publish the relay directly or use bundled Caddy

Rejected because it adds a public or separately managed ingress surface and
does not reuse the qualified Aegis boundary.
