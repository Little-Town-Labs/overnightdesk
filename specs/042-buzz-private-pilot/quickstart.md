# Qualification Guide: Buzz Private Pilot

**Status**: Issue #249 reopened for planning on 2026-09-02. This guide is not
deployment authorization; every further external or production mutation
requires a separately recorded approval.

Use synthetic content and safe evidence only. Stop on ambiguity, failed gates,
or unexpected changes to existing Nginx, Tailscale, OCI, backup, or service
state.

## Gate 0 — Current facts, no mutation

1. Synchronize the reopened Issue body and Project item only if explicitly
   approved.
2. Refresh Buzz/client/source/image qualification and upstream issue status.
3. Read-only inventory Aegis addresses, interfaces, NAT/routes/security lists,
   Nginx listeners/modules/config, Docker networks, Tailscale node/routes/grants/
   Serve, DNS/cert renewal, backups, capacity, and service health.
4. Identify a candidate private listener address only if evidence proves it is
   unassigned, valid for the intended OCI VNIC/host interface, safely removable,
   and has no public path.
5. Freeze the exact VNIC/interface assignment and removal procedure, WebSocket
   relay URL, literal NIP-98 method/full-HTTPS-URL pairs, exact `/32`, source-
   device grant, digests, limits, recovery targets, approval owners, and
   rollback assertions.

**Pass**: current facts and reversible checks are documented; no state changed.

## Gate 1 — Local contracts

```bash
python3 -m unittest discover -s infra/buzz/tests -p 'test_*.py'
docker compose -f infra/buzz/compose.yml -f infra/buzz/compose.aegis.yml config
```

Prove immutable images, hardening, three-network membership, no public ports,
private-listener-only Nginx selection, no `auth_request`, distinct byte-exact
WebSocket/HTTPS URL preservation, full synthetic NIP-42/NIP-98 proxy behavior,
public/forged-SNI denial, coherent restore, safe logs, and listener-first
rollback ordering.

**Pass**: deterministic contracts pass without Aegis or production secrets.

## Gate 2 — Route coexistence experiment

**OWNER APPROVAL REQUIRED.** No owner or canary is admitted.

1. Capture signed pre-state for Nginx, routes, grants, Serve, services, and
   public/private reachability, including OCI VNIC and host-interface addresses.
2. Stage the disabled private listener and pass `nginx -t`.
3. Assign the selected secondary private IP to the frozen OCI VNIC and intended
   host interface; prove the exact local address/bind and public denial.
4. Advertise/approve only the assigned `/32`; apply only the owner-device grant.
5. Enable the listener, reload Nginx, run NIP-42 at the exact WebSocket relay
   URL, and run every frozen NIP-98 method/full-HTTPS-URL pair.
6. Disable the listener, validate/reload, prove Buzz unreachable, withdraw the
   grant and `/32`, remove only the Buzz host/VNIC address assignment, and prove
   the complete pre-state is restored.

**Pass**: the exact route works without modifying existing Serve or public
Nginx behavior, and the experiment fully rolls back.

## Gate 3 — Disabled install and recovery

**OWNER APPROVAL REQUIRED.** Install the stack disabled with no admitted user.
Verify digests, users, capabilities, mounts, writable paths, network membership,
limits, migrations, readiness, safe logs, capacity, and restart behavior.
Create the coherent encrypted PostgreSQL+MinIO set, verify off-box completion,
restore on an unrouted disposable network, and measure RPO/RTO.

## Gate 4 — Owner only

**OWNER APPROVAL REQUIRED.** Assign only the approved private address and
enable only its listener/route/grant, admit the client-held owner identity, and
test complete NIP-42 under the exact WebSocket URL and NIP-98 under every frozen
method/full-HTTPS-URL pair, collaboration, reconnect, restart persistence, edge
limits, resource use, and denials for public, unapproved-device, and unadmitted-
identity cases. Keep the canary disabled.

## Gate 5 — Canary

**OWNER APPROVAL REQUIRED.** Create a distinct canary key and scope. Confirm
one owner, one channel, no tools, canonical-Nginx-only networking, one
concurrent job, bounded output/time, deduplication, normal/adversarial cases,
restart, capacity, and queued/in-flight revocation.

## Gate 6 — Seven-day decision

Observe health, latency/error classes, route/grant/listener invariance, denials,
resource/disk growth, backups, restores, canary outcomes, and existing-service
health. Add no user, route, channel, agent, tool, or business data. Record one
decision: continue bounded, pause disabled, roll back, or propose a new scope.

## Listener-first rollback

1. Disable only the Buzz private include/listener.
2. Run `nginx -t` and reload Nginx.
3. Prove Buzz unreachable from approved and denied test classes.
4. With approval, withdraw only the Buzz grant and exact `/32`.
5. Confirm no listener or route uses the Buzz address and remove only its host-
   interface and OCI VNIC secondary-address assignments.
6. Stop canary and stack; preserve authoritative data and candidate images.
7. Verify existing OCI VNIC/host-interface addresses, Nginx vhosts, Serve root,
   advertised routes, services, backups, and health against the baseline.

Cleanup and data deletion are separate, destructive, approval-bound work.
