# Contract: Private Ingress and Runtime Isolation

## Static invariants

- `buzz.overnightdesk.com` is the only configured relay hostname and
  `wss://buzz.overnightdesk.com` is the only client/canary relay URL.
- Buzz has no public A/AAAA record and the certificate uses DNS-01 issuance.
- The Buzz server block listens only on the preflight-approved private address;
  no public `listen`, wildcard address, default server, or public port mapping
  can select it.
- No Buzz relay, health, metrics, database, Redis, MinIO, or management port is
  published publicly.
- Nginx configuration contains no `auth_request` for Buzz.
- Nginx preserves method, path, query, Host, NIP-98 `Authorization`, external
  HTTPS semantics, and WebSocket upgrade headers; it strips unrelated cookies
  and does not rewrite the URI.
- `buzz-ingress` contains only Nginx and relay; `buzz-data` contains only relay
  and stores; `buzz-canary` contains only Nginx and canary.
- Images use immutable ARM64 digests, explicit non-root users, read-only roots,
  dropped capabilities, bounded resources, health checks, and no embedded
  secrets.

## Route invariants

- Only the selected private address is advertised, with prefix length 32.
- Route advertisement/approval and source-device grant are represented and
  verified separately.
- The grant is deny-by-default and permits only approved owner devices to the
  selected address/port.
- Existing Tailscale node identity, routes, Serve handlers, and `ob1-mcp` root
  are byte-equivalent before and after the experiment except for the approved
  exact `/32` lifecycle.

## Protocol qualification

The positive test must traverse canonical Nginx and complete:

1. TLS hostname verification;
2. WebSocket upgrade;
3. NIP-42 challenge, signed authentication, and authenticated subscription;
4. a NIP-98 signed HTTP operation with the exact canonical URL; and
5. reconnect without URL or signed-relay-tag divergence.

The negative matrix must deny public IPv4/IPv6, known-public-IP plus forged
SNI/Host, an unapproved tailnet device, an unadmitted identity, an invalid
signature, an alternate hostname, and a direct relay/store target.

## Activation and rollback

Activation requires passing local contracts, `nginx -t`, recovery proof,
baseline capture, route/grant approval, a reload, and positive/negative
protocol checks. Rollback first disables the exact private include/listener,
validates and reloads Nginx, proves Buzz unreachable, then withdraws the exact
grant and `/32` with approval. Workload state is preserved and existing public
vhosts, Serve, routes, containers, and health remain unchanged.
