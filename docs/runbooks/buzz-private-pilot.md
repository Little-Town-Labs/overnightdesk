# Buzz Private Pilot on Aegis

## Current status

Planning was reactivated on 2026-09-02 under ADR-008, and Issue #249 was
reopened. This runbook freezes the proposed operating contract but authorizes
no further GitHub, registry, Phase, DNS, certificate, OCI, Aegis, Tailscale,
identity, admission, deployment, or remote Git mutation.

The 2026-09-01 dedicated Tailscale-sidecar design is deprecated and was never
deployed. Its evidence remains historical. All values marked `GATE0` must be
resolved from current read-only evidence before implementation.

## Frozen workload boundary

| Item | Contract |
| --- | --- |
| Workload | `buzz-private-pilot` |
| Host | `aegis-prod` (`aarch64`), shared production |
| Accountable operator | Sol for production mutations |
| WebSocket relay URL | exact `wss://buzz.overnightdesk.com`; no explicit `:443` |
| NIP-98 HTTPS origin | exact `https://buzz.overnightdesk.com`; no explicit `:443` |
| NIP-98 request URLs | literal supported method/full-URL pairs frozen at Gate 0; full URL is the HTTPS origin plus the exact raw request target |
| DNS | private resolution only; no public A/AAAA |
| TLS | DNS-01; exact certificate/renewal path `GATE0` |
| Listener | selected secondary private address `GATE0`, assigned to the frozen OCI VNIC and host interface before bind; port 443; no public NAT/listener path |
| Tailnet transport | existing host advertises exact private `/32`; separate owner-device grant |
| Existing Serve | unchanged root on the existing node, including `ob1-mcp` |
| Authentication | NIP-42/NIP-98 plus closed-relay membership; no OvernightDesk `auth_request` |
| Repository source | `infra/buzz/` |
| Aegis root | `/opt/overnightdesk/buzz/` |
| Allowed data | synthetic pilot data only |
| Pilot roster | one client-held owner identity, then one new tool-free canary |

## Private ingress contract

The Buzz Nginx server block is selectable only on the dedicated private
listener. If Nginx is containerized, a dedicated internal port is mapped only
from the selected private host address. The public OCI `:443`, wildcard binds,
default servers, and IPv6 listeners must not select Buzz even with the known
public IP and forged SNI/Host.

The exact WebSocket relay URL is `wss://buzz.overnightdesk.com`. NIP-98 uses
the distinct HTTPS origin `https://buzz.overnightdesk.com`; each qualified
operation has a frozen literal method and full request URL containing its exact
raw path and raw query ordering/encoding. Placeholders are invalid after Gate
0, and neither external URL form includes an explicit default `:443` port.

Nginx preserves request method, raw path, raw query ordering/encoding, Host,
WebSocket upgrade headers, NIP-98 `Authorization`, and external HTTPS
semantics. It strips unrelated cookies and does not rewrite the URI.
Qualification completes signed NIP-42 challenge/auth/subscription and every
frozen NIP-98 HTTP operation; `101 Switching Protocols` alone is not
acceptance.

Address assignment, route advertisement/approval, and the source-device grant
are independent. After explicit approval, the selected address is assigned as
a secondary private IP to the frozen OCI VNIC and intended host interface;
the exact local address and bind must succeed before route advertisement. Only
that `/32` is added, only approved owner devices may reach its port 443, and
the pre-existing VNIC/interface addresses, route set, node identity, grants,
and Serve configuration must compare unchanged after rollback.

## Services, state, and networks

| Service | Persistent authority | Network membership |
| --- | --- | --- |
| Existing Nginx | existing config/cert custody; Buzz include disabled-first | `buzz-ingress`, `buzz-canary` only for Buzz |
| Relay | Git scratch is reproducible | `buzz-ingress`, `buzz-data` |
| PostgreSQL | authoritative events/membership/search/audit | `buzz-data` only |
| Redis | diagnostic/cache/pubsub | `buzz-data` only |
| MinIO | authoritative objects/media | `buzz-data` only |
| MinIO initializer | none; exits | `buzz-data` only |
| Canary | deduplication state only | `buzz-canary` only |

No service publishes an application, store, health, metrics, admin, or
management port publicly. Nginx cannot reach stores. The canary cannot reach
relay or stores directly and must use the canonical external WebSocket and
HTTPS URLs through Nginx.

All new images are exact ARM64 digests with current provenance, SBOM, scan,
non-root, hardening, startup, and limit evidence. The existing Nginx image is
not a new dependency, but its live digest, modules, config, and reload behavior
must be revalidated.

## Secrets and identity

- The owner's private key remains client-side and never enters Aegis, Phase,
  Compose, logs, backups, or evidence.
- Relay/store and later canary secrets use separate exact Phase paths selected
  at Gate 0, allowlisted ephemeral projection, no metadata leakage, and no
  Tailscale OAuth credential.
- Public keys and secret-reference metadata may be recorded; secret values,
  cookies, authorization headers, signed events, prompts, responses, and
  message bodies may not.
- The canary has one owner, one channel, no tools, one concurrent job, bounded
  output/time, deduplication, and tested revocation.

## Recovery contract

PostgreSQL and MinIO form one coherent encrypted backup set. Redis is
diagnostic and Git scratch is regenerated. `COMPLETE` is written only after
both authoritative artifacts and off-box transfer succeed. A disposable,
unrouted restore with logical assertions and measured RPO/RTO must pass before
owner admission.

There is no Buzz Tailscale node state to back up. VNIC/interface assignment and
listener/route/grant metadata is non-secret evidence and is recreated only
through the approved activation sequence.

## Gates

1. **Gate 0, read-only**: refresh upstream/images/client and Aegis/OCI/Nginx/
   Tailscale/DNS/cert/backup/capacity facts; select a safe private address;
   freeze exact VNIC/interface assignment and removal plus literal NIP-98
   method/full-URL pairs.
2. **Gate 1, local**: failing contracts first, then immutable Compose/Nginx,
   full signed protocol matrix, public denial, recovery, sentinel, and rollback.
3. **Gate 2, owner-approved production experiment**: no admitted user; assign
   the selected secondary private IP to the frozen VNIC/interface, prove local
   bind and public denial, add the exact `/32` and grant, enable the private
   listener, test, then fully roll back including address removal.
4. **Gate 3, owner-approved disabled install**: hardening, isolation, capacity,
   backup/restore, and rollback proof.
5. **Gate 4, owner-approved owner only**: admit owner and qualify collaboration
   plus network/identity denials.
6. **Gate 5, owner-approved canary**: create separate key/scope, qualify bounded
   behavior and revocation.
7. **Gate 6**: seven-day observation and one explicit continue/pause/rollback/
   new-scope decision.

Each gate records exact approval and source/image/config/baseline digests. A
failed or incomplete gate authorizes no next step.

## Activation

1. Install the stack and Buzz Nginx include disabled.
2. Render Compose and validate `nginx -t`.
3. Pass recovery, rollback, invariant, and safe-log prerequisites.
4. With explicit approval, assign the exact secondary private IP to the frozen
   OCI VNIC and intended host interface; prove the exact local address, bind,
   and absence of a public path.
5. Advertise/approve only the exact `/32` and apply only the exact owner-device
   grant.
6. Enable only the private include/listener and reload Nginx.
7. Run NIP-42 at the exact WebSocket relay URL, every frozen NIP-98 method/full-
   URL pair, and the full denied-source matrix.

## Listener-first rollback

1. Disable only the Buzz private include/listener.
2. Run `nginx -t` and reload—do not restart or rewrite unrelated config.
3. Prove Buzz unreachable from all positive and negative test locations.
4. With approval, withdraw only the exact grant and `/32`.
5. Confirm no listener or route uses the Buzz address; remove only its host-
   interface and OCI VNIC secondary-address assignments.
6. Stop canary and workload; preserve authoritative data and images.
7. Compare OCI VNIC and host-interface addresses, public Nginx vhosts/
   listeners, Tailscale node/routes/grants/Serve, services, backups, and health
   to the signed baseline.

Cleanup, secret deletion, volume deletion, and image pruning are outside
rollback and require separate destructive-action approval.
