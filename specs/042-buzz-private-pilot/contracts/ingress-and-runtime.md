# Contract: Private Ingress and Runtime Isolation

## Static invariants

- `buzz.overnightdesk.com` is the only configured relay hostname;
  `wss://buzz.overnightdesk.com` is the byte-exact client/agent WebSocket
  relay URL, and it contains no explicit default `:443` port.
- NIP-98 uses the distinct HTTPS origin `https://buzz.overnightdesk.com`. The
  Gate 0 manifest lists every supported literal method and byte-exact full URL
  where the full URL equals that origin plus the raw request target. The target
  begins with the absolute path and includes the exact `?` plus raw query when
  present; templates are invalid in fixtures and production evidence.
- Private resolution maps the canonical hostname to the selected private
  address for owner devices and to Nginx's fixed `buzz-agents` address for
  intake workers. Both retain the same signed hostname and URL. Any public
  wildcard A/AAAA answer is treated as hostile and cannot select Buzz. The
  certificate uses DNS-01 issuance.
- The Buzz server block has exactly two non-public listener endpoints: Nginx's
  fixed `buzz-ingress` address at `8443` for owner traffic from the host socket
  proxy, and Nginx's fixed `buzz-agents` address at `443` for intake workers.
  No public/shared-network `listen`, wildcard address, default server, or
  public port mapping can select it.
- The shared Nginx container receives no new Docker host-port publication and
  is not recreated. Nginx listens on its fixed `buzz-ingress` bridge address at
  internal port `8443`; a hardened `systemd-socket-proxyd` socket on the host
  forwards raw TCP only from the selected private address at port `443`.
- No Buzz relay, health, metrics, database, Redis, MinIO, or management port is
  published publicly.
- Nginx configuration contains no `auth_request` for Buzz.
- Nginx preserves method, path, query, Host, NIP-98 `Authorization`, external
  HTTPS semantics, and WebSocket upgrade headers; it strips unrelated cookies
  and does not rewrite the URI.
- `buzz-ingress` contains only Nginx and relay; `buzz-data` contains only relay
  and stores; `buzz-agents` contains only Nginx and the three named Hermes
  intake workers. All three are Docker-internal bridges. Workers never join the
  existing OvernightDesk network or receive a default external-egress path. A
  fixed-target Nginx egress broker exposes only `GET /v1/capabilities`,
  `POST /v1/runs`, and `GET /v1/runs/{run_id}` for each named runtime, forwards
  the caller's runtime-bound bearer credential, accepts a status `run_id` only
  when it matches `^run_[0-9a-f]{32}$`, and denies queries on broker requests,
  every other method/path (including approval-response paths), redirects,
  variable upstreams, and cross-runtime credentials.
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
- Address assignment and route advertisement/approval are represented and
  verified separately.
- The existing tailnet-wide policy is accepted and remains unchanged. Network
  reachability alone grants no Buzz subscription, read, or write permission.
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
SNI/Host, an unadmitted identity from a reachable tailnet device, an invalid
signature, an alternate hostname, and a direct relay/store target.

## Activation and rollback

Activation requires passing local contracts, `nginx -t`, recovery proof, and
baseline capture; assigning the exact secondary private IP to the frozen OCI
VNIC and host interface; proving local bind and public denial; approving the
route without a tailnet-policy change; reloading the internal Nginx listener;
starting only the private systemd socket proxy; and passing positive and
negative protocol checks. Socket-first rollback stops the exact socket proxy,
proves Buzz unreachable, removes the private include with a validated Nginx
reload, withdraws the exact `/32` with approval, confirms no remaining listener
or route uses the Buzz address, and removes only its host-interface and OCI
VNIC assignments. Workload state is preserved and existing addresses, public
vhosts, Serve, routes, container identity, and health remain unchanged.
