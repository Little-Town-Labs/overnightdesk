# Contract: Private Ingress and Runtime Isolation

## Static invariants

- `buzz.overnightdesk.com` is the only configured relay hostname;
  `wss://buzz.overnightdesk.com` is the byte-exact client/canary WebSocket
  relay URL, and it contains no explicit default `:443` port.
- NIP-98 uses the distinct HTTPS origin `https://buzz.overnightdesk.com`. The
  Gate 0 manifest lists every supported literal method and byte-exact full URL
  where the full URL equals that origin plus the raw request target. The target
  begins with the absolute path and includes the exact `?` plus raw query when
  present; templates are invalid in fixtures and production evidence.
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

- The selected address begins unassigned. With explicit approval, that exact
  secondary private IP is assigned to the frozen OCI VNIC and intended host
  interface, and exact local-address plus bind proof passes before route or
  listener activation.
- Only the selected and locally assigned private address is advertised, with
  prefix length 32.
- Address assignment, route advertisement/approval, and source-device grant are
  represented and verified separately.
- The grant is deny-by-default and permits only approved owner devices to the
  selected address/port.
- Existing OCI VNIC and host-interface addresses, Tailscale node identity,
  routes, Serve handlers, and `ob1-mcp` root are byte-equivalent before and
  after the experiment except for the approved Buzz address and exact `/32`
  lifecycles.

## Protocol qualification

The positive test must traverse canonical Nginx and complete:

1. TLS hostname verification;
2. WebSocket upgrade;
3. NIP-42 challenge, signed authentication, and authenticated subscription;
4. every qualified NIP-98 operation using the exact method and byte-exact full
   HTTPS request URL from the Gate 0 manifest, including raw path and query; and
5. reconnect without URL or signed-relay-tag divergence.

The negative matrix must deny public IPv4/IPv6, known-public-IP plus forged
SNI/Host, an unapproved tailnet device, an unadmitted identity, an invalid
signature, an alternate hostname, and a direct relay/store target.

## Activation and rollback

Activation requires passing local contracts, `nginx -t`, recovery proof, and
baseline capture; assigning the exact secondary private IP to the frozen OCI
VNIC and host interface; proving local bind and public denial; approving the
route/grant; reloading the listener; and passing positive/negative protocol
checks. Listener-first rollback disables the exact private include/listener,
validates and reloads Nginx, proves Buzz unreachable, withdraws the exact grant
and `/32` with approval, confirms no remaining listener or route uses the Buzz
address, and removes only its host-interface and OCI VNIC assignments. Workload
state is preserved and existing addresses, public vhosts, Serve, routes,
containers, and health remain unchanged.
