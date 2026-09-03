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
3. Admit only a provisional object-store candidate that passes the Gate 0
   requirements in `contracts/object-store.md`; do not waive missing operations
   or disable the Git probe.
4. Read-only inventory Aegis addresses, interfaces, NAT/routes/security lists,
   Nginx listeners/modules/config, Docker networks, Tailscale node/routes/policy/
   Serve, DNS/cert renewal, backups, capacity, and service health.
5. Identify a candidate private listener address only if evidence proves it is
   unassigned, valid for the intended OCI VNIC/host interface, safely removable,
   and has no public path.
6. Freeze the exact VNIC/interface assignment and removal procedure, WebSocket
   relay URL, literal NIP-98 method/full-HTTPS-URL pairs, exact `/32`, accepted
   tailnet-wide policy digest, both fixed Nginx bridge listener addresses,
   hardened systemd socket/proxy units, named Hermes broker routes and identities, limits,
   recovery targets, approval owners, and rollback assertions.

**Pass**: current facts and reversible checks are documented; no state changed.

## Gate 1 — Local contracts

```bash
python3 -m unittest discover -s infra/buzz/tests -p 'test_*.py'
docker compose -f infra/buzz/compose.yml -f infra/buzz/compose.aegis.yml config
```

Prove immutable images, the complete selected-object-store operation contract,
hardening, three-network membership, intake absence from the shared production
network, fixed-target Nginx Hermes egress, no new
Docker publication or Nginx recreation, hardened systemd raw-TCP forwarding,
dual-private-endpoint Nginx selection, no `auth_request`, distinct byte-exact
WebSocket/HTTPS URL preservation, full synthetic NIP-42/NIP-98 proxy behavior,
public/forged-SNI denial, separate owner/Walter/Titus/Mitchel identities,
owner-only automated triggers, coherent restore, safe logs, and socket-first
rollback ordering.

**Pass**: deterministic contracts pass without Aegis or production secrets.

## Gate 2 — Route coexistence experiment

**OWNER APPROVAL REQUIRED.** No owner or Hermes agent is admitted.

1. Capture signed pre-state for Nginx, routes, policy, Serve, services, and
   public/private reachability, including OCI VNIC and host-interface addresses.
2. Stage the disabled fixed-bridge Nginx listener and systemd socket/proxy
   units, then pass `nginx -t`.
3. Assign the selected secondary private IP to the frozen OCI VNIC and intended
   host interface; prove the exact local address/bind and public denial.
4. Advertise/approve only the assigned `/32`; leave tailnet policy unchanged.
5. Reload the fixed-bridge Nginx listener without recreating its container,
   start the private systemd socket, run NIP-42 at the exact WebSocket relay
   URL, and run every frozen NIP-98 method/full-HTTPS-URL pair.
6. Stop the systemd socket first, prove Buzz unreachable, remove the Nginx
   include with a validated reload, withdraw the `/32`, remove only the Buzz
   host/VNIC address assignment, and prove the complete pre-state is restored.

**Pass**: the exact route works without modifying existing Serve or public
Nginx behavior, and the experiment fully rolls back.

## Gate 3 — Disabled install and recovery

**OWNER APPROVAL REQUIRED.** Install the stack disabled with no admitted user.
Verify digests, users, capabilities, mounts, writable paths, network membership,
limits, migrations, readiness, safe logs, capacity, and restart behavior.
Create the coherent encrypted PostgreSQL+qualified-object-store set, verify
off-box completion, restore on an unrouted disposable network, repeat the
object-store/Buzz-path assertions, and measure RPO/RTO.

## Gate 4 — Owner only

**OWNER APPROVAL REQUIRED.** Assign only the approved private address and
enable only its listener/route, admit the client-held owner identity, and
test complete NIP-42 under the exact WebSocket URL and NIP-98 under every frozen
method/full-HTTPS-URL pair, collaboration, reconnect, restart persistence, edge
limits, resource use, and denials for public and unadmitted-identity cases.
Keep all Hermes intake workers disabled.

## Gate 5 — First Hermes canary

**OWNER APPROVAL REQUIRED.** Select one of Walter, Titus, or Mitchel/Trevor and
create its distinct read/write Buzz identity. Confirm one owner trigger, one
channel, exact signed-owner validation, exact Hermes Runs API routing,
unchanged tool/approval policy, canonical-Nginx Buzz networking, one concurrent
job, bounded output/time, deduplication, normal/adversarial cases, bot-trigger
denial, shared-network and unrelated-service denial, restart, capacity,
unsubmitted/future-work rejection, and late-result suppression. Do not claim
that revocation cancels an already-submitted Hermes run.

## Gate 6 — Remaining Hermes agents

**OWNER APPROVAL REQUIRED.** Admit the remaining two named agents one at a time
with separate keys and repeat the Gate 5 contract for each.

## Gate 7 — Seven-day decision

Observe health, latency/error classes, route/policy/listener invariance,
denials, resource/disk growth, backups, restores, per-agent outcomes, and
existing-service health. Add no user or agent beyond the approved four
identities, and no route, channel, tool, or business data. Record one decision:
continue bounded, pause disabled, roll back, or propose a new scope.

## Socket-first rollback

1. Stop only the Buzz private systemd socket proxy.
2. Prove Buzz unreachable from approved and denied test classes.
3. Remove only the Buzz private include/listener, run `nginx -t`, and reload
   Nginx without recreating its container.
4. With approval, withdraw only the exact Buzz `/32`.
5. Confirm no listener or route uses the Buzz address and remove only its host-
   interface and OCI VNIC secondary-address assignments.
6. Stop Hermes intake workers and stack; preserve authoritative data and
   candidate images.
7. Verify existing OCI VNIC/host-interface addresses, Nginx vhosts, Serve root,
   advertised routes, services, backups, and health against the baseline.

Cleanup and data deletion are separate, destructive, approval-bound work.
