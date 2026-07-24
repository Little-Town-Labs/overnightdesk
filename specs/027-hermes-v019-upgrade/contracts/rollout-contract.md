# Hermes v0.19 Rollout Contract

## Release identity

- Official tag: `v2026.7.20`
- Runtime version: `0.19.0`
- OCI index:
  `nousresearch/hermes-agent@sha256:c1731f7ffd49c37f2b4b6cd01873d4256ba6f06217dfca2cc41cede55815ea82`
- Linux ARM64 manifest:
  `sha256:4586e3f2375e42e70a13282a19dfe16d4145b22da92a3c46b7aa1643c74a0ec1`
- Derived tag: `overnightdesk/hermes-agent:0.19.0-coder`

## Authority invariant

Every candidate must resolve:

```yaml
approvals:
  mode: manual
  cron_mode: deny
```

No candidate may inherit v0.19's `smart` default. Model/provider, tool grants,
OIDC clients, memberships, and message-send policy are unchanged.

## Runtime order

1. Stage copied Walter, Titus, and Mitchel state with production delivery
   disabled.
2. Upgrade and qualify `hermes-mitchel`.
3. Upgrade and qualify `hermes-walter`.
4. Synchronize the exact merged Titus source, restart only
   `hermes-titus.service`, and run the complete Titus qualification suite.
5. Refresh the provisioner only after all three existing runtimes qualify.

Each step is a stop gate. No later step begins after an unresolved failure.

## Required runtime evidence

For each runtime:

- image and immutable base identity
- `hermes --version`
- config version and effective approval policy
- gateway running and fresh cron heartbeat
- dashboard internal status and authentication-required state
- expected auth provider and zero published host ports
- cron list/status
- MCP registry and required tenant tools
- current provider/model tuple without credential output
- named volume identity and integrity checks appropriate to the tenant
- recent bounded error signatures
- rollback handle presence

## Preservation evidence

- Record scoped container IDs, start times, health, and restart counts before
  every cutover.
- Only the target runtime may change identity during its cutover.
- Named volumes, routes, certificates, memberships, OIDC clients, model
  policy, schedules, email state, and unrelated services must remain.
- No production test email, outreach, CRM write, or channel message is part of
  this contract.

## Rollback

- Walter and Mitchel retain their stopped v0.18.0 containers plus the local
  v0.18.0 image.
- Titus retains the v0.18.0 image, installed source/launcher backup, config
  backup, and `hermes-titus-data`.
- Roll back only the affected runtime.
- Never delete or replace a named volume.
- Requalify version, gateway, dashboard, auth, cron, provider/model, and tenant
  tools after rollback.

## Publication

The application and standard PRs must merge before their exact source is
synchronized to Aegis. Every production mutation or failed attempt is appended
to `/home/frosted639/src/overnightdesk-suite/deploys.log`.
