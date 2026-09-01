# Qualification Guide: Buzz Private Pilot

**Status**: Historical only. The research initiative was closed without
deployment on 2026-09-01. Do not execute this guide unless the owner explicitly
reactivates and revalidates the initiative.

This is an execution map, not deployment authorization. Stop at every approval
gate. Use synthetic content only and record safe evidence IDs, never secrets or
message bodies.

## Gate 0 - Freeze Candidate

1. Confirm the primary Issue/Project only if GitHub lifecycle work was approved.
2. Resolve the relay, Tailscale ingress, and adapter source/image digests,
   ARM64 manifests, SBOM, provenance, CI result, known vulnerabilities, and
   previous-release handle.
3. Record the owner, `buzz.tail5c4f73.ts.net` hostname,
   `tag:buzz-private-pilot` policy, Serve-without-Funnel contract, Phase scopes,
   resource envelope, store inventory, authority matrix, and rollback owner.
4. Capture current Aegis service, resource, route, backup, and disk baseline.

**Pass**: Candidate and scope are immutable, baseline is current, and no
production change has occurred.

## Gate 1 - Local Qualification

```bash
python3 -m unittest discover -s infra/buzz/tests -p 'test_*.py'
docker compose -f infra/buzz/compose.yml -f infra/buzz/compose.aegis.yml config
infra/buzz/deploy-aegis.sh qualify-local
```

Prove closed membership defaults, no host ports, immutable images, hardening,
limits, private dependencies, shared ingress/relay network namespace,
loopback-only Serve target, Funnel absence, disabled optional surfaces, safe
secret projection, deterministic backup/restore commands, route-first rollback,
and tool-free canary configuration.

**Pass**: All contracts pass with synthetic local keys and data. No Aegis
mutation or production secret is used.

## Approval A - Install Disabled

The owner approves exact release, source paths, service names, volumes,
networks, Phase paths, limits, backup delta, rollback command, and operator.

```bash
infra/buzz/deploy-aegis.sh install-disabled
infra/buzz/deploy-aegis.sh verify-private
```

Verify:

- route absent and no host port;
- dedicated ingress has the exact device name/tag, non-root user, writable
  state/socket paths, userspace mode, and no Funnel/routes/SSH;
- expected user, digest, capabilities, security options, mounts, networks,
  writable paths, PIDs, CPU, and memory;
- relay and dependency readiness/migrations;
- no owner or canary membership;
- secret/configuration absence from container metadata and logs;
- baseline Aegis services remain healthy.

## Approval B - Backup and Isolated Restore

```bash
infra/buzz/deploy-aegis.sh backup
infra/buzz/deploy-aegis.sh restore-rehearsal
```

Seed synthetic memberships, channels, messages, one small object, and
repository-state marker. Confirm a coherent encrypted set, off-box completion,
isolated alternate names/network, logical assertions, measured recovery time,
and teardown that does not touch production state.

**Pass**: Current-release restore passes every assertion. Otherwise rollback or
leave disabled for human decision.

## Approval C - Owner Route and Admission

```bash
infra/buzz/deploy-aegis.sh enable-route
infra/buzz/deploy-aegis.sh qualify-owner
```

From the approved client, test connect, send, edit, delete, reaction, thread,
search, reconnect, restart persistence, edge limits, and small load. From a
separate unadmitted identity and unapproved network path, prove connect, read,
subscribe, and publish denial. Run the log sentinel and existing-service health
checks.

**Pass**: Owner actions succeed, denied actions all fail, content remains out of
telemetry, and capacity stays inside the envelope. Keep canary disabled.

## Approval D - Canary

```bash
infra/buzz/deploy-aegis.sh enable-canary
infra/buzz/deploy-aegis.sh qualify-canary
```

Verify distinct key and membership, one owner, one channel, no tools, one
concurrent prompt, output/timeout/deduplication bounds, 20 normal requests,
unapproved caller/channel silence, adversarial authority refusals, reconnect,
restart, resource limits, and revocation including queued work cancellation.

**Hard stop**: Any prohibited action, secret/content leakage, cross-channel
reply, unexpected tool, duplicate burst, scope escape, or existing-service
health impact.

## Seven-Day Observation

Daily safe evidence includes readiness/restarts, latency/errors, membership
denials, canary outcomes, capacity/disk growth, backup status, alerts/incidents,
and existing-service health. Do not add users, agents, tools, or business data.

At closeout choose:

- continue the bounded pilot;
- pause with route and canary disabled and state preserved;
- rollback; or
- propose exactly one separately scoped expansion.

## Route-First Rollback

```bash
infra/buzz/deploy-aegis.sh rollback
infra/buzz/deploy-aegis.sh status
```

Expected order: disable route, stop canary, stop Buzz, preserve volumes/images/
secrets, verify the existing host Serve configuration is unchanged, verify
existing Aegis services, retain evidence, and record the deployment ledger.
Cleanup is not part of rollback and needs later approval.
