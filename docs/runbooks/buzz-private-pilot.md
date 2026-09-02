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
| Canonical URL | `wss://buzz.overnightdesk.com` everywhere |
| DNS | private resolution only; no public A/AAAA |
| TLS | DNS-01; exact certificate/renewal path `GATE0` |
| Listener | selected private address `GATE0`, port 443; no public NAT/listener path |
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

Nginx preserves request method, path, query, Host, WebSocket upgrade headers,
NIP-98 `Authorization`, and external HTTPS semantics. It strips unrelated
cookies and does not rewrite the URI. Qualification completes signed NIP-42
challenge/auth/subscription and NIP-98 HTTP operations; `101 Switching
Protocols` alone is not acceptance.

Route advertisement/approval and the source-device grant are independent.
Only the selected `/32` is added, only approved owner devices may reach its
port 443, and the pre-existing route set, node identity, grants, and Serve
configuration must compare unchanged after rollback.

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
relay or stores directly and must use the canonical URL through Nginx.

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

There is no Buzz Tailscale node state to back up. Listener/route/grant metadata
is non-secret evidence and is recreated only through the approved activation
sequence.

## Gates

1. **Gate 0, read-only**: refresh upstream/images/client and Aegis/OCI/Nginx/
   Tailscale/DNS/cert/backup/capacity facts; select safe private address.
2. **Gate 1, local**: failing contracts first, then immutable Compose/Nginx,
   full signed protocol matrix, public denial, recovery, sentinel, and rollback.
3. **Gate 2, owner-approved production experiment**: no admitted user; add the
   exact `/32` and grant, enable private listener, test, then fully roll back.
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
4. With explicit approval, advertise/approve only the exact `/32` and apply
   only the exact owner-device grant.
5. Enable only the private include/listener and reload Nginx.
6. Run canonical signed positive tests and the full denied-source matrix.

## Route-first rollback

1. Disable only the Buzz private include/listener.
2. Run `nginx -t` and reload—do not restart or rewrite unrelated config.
3. Prove Buzz unreachable from all positive and negative test locations.
4. With approval, withdraw only the exact grant and `/32`.
5. Stop canary and workload; preserve authoritative data and images.
6. Compare public Nginx vhosts/listeners, Tailscale node/routes/grants/Serve,
   services, backups, and health to the signed baseline.

Cleanup, secret deletion, volume deletion, and image pruning are outside
rollback and require separate destructive-action approval.
