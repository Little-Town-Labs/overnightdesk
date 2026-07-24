# Research: Hermes v0.19 Production Upgrade

## Decision 1: Accept v0.19.0 / v2026.7.20

**Decision**: Stage the official non-prerelease release
[`v2026.7.20`](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.7.20),
which reports Hermes Agent v0.19.0.

**Rationale**: It is the latest official release at intake time and includes
material latency, delivery-ledger, cron-audit, MCP, model, dashboard, and
security improvements relevant to all three runtimes.

**Alternatives considered**:

- Hold v0.18.0: rejected because no release-specific blocker has been found.
- Follow `latest` without a release identity: rejected because it can move
  during review or rollback.

## Decision 2: Pin the OCI index and verify ARM64

**Decision**: Use immutable OCI index digest
`sha256:c1731f7ffd49c37f2b4b6cd01873d4256ba6f06217dfca2cc41cede55815ea82`
and separately verify the Linux ARM64 child manifest
`sha256:4586e3f2375e42e70a13282a19dfe16d4145b22da92a3c46b7aa1643c74a0ec1`.

**Rationale**: Aegis is ARM64. The index is the portable immutable reference
for source and provisioning, while the child proves that the accepted release
actually contains the platform Aegis will run.

**Alternatives considered**:

- Pin only the child manifest: rejected for the shared future-tenant reference
  because it discards multi-architecture intent.
- Trust the tag after pull: rejected because tags are mutable.

## Decision 3: Preserve manual approvals explicitly

**Decision**: Set `approvals.mode: manual` and `approvals.cron_mode: deny`
explicitly for every tenant before v0.19 starts.

**Rationale**: v0.18's effective default is manual/deny. v0.19 keeps config
schema 33 but changes `DEFAULT_CONFIG.approvals.mode` to `smart`. Walter and
Mitchel already persist manual/deny; Titus currently inherits v0.18's default
because the keys are absent. Without an explicit Titus value, the image update
would silently allow an auxiliary LLM to approve flagged commands.

Titus's curated source also omitted the raw `_config_version`, so the live
dashboard reported config version `0` while the runtime merged v0.18's
schema-33 defaults. The v0.19 source pins `_config_version: 33` directly rather
than invoking a broad migration rewrite.

**Alternatives considered**:

- Accept smart approvals as part of the version update: rejected because it
  changes agent authority and was not requested.
- Depend on config migration: rejected because both releases use schema 33, so
  no migration records this behavior change.

## Decision 4: Retain the hardened launcher override

**Decision**: Continue using volume-provided `start-all.sh` under the existing
non-root, cap-drop, no-new-privileges, 2-GiB/1-CPU profile.

**Rationale**: v0.19 still ships s6 `/init` as its default entrypoint. The
existing production launcher starts both gateway and dashboard under the
qualified hardened profile. Changing supervision architecture during a version
upgrade would combine two independent risks.

**Alternatives considered**:

- Adopt upstream s6 immediately: rejected until separately qualified under the
  same hardening and tenant launcher contracts.
- Run only the gateway: rejected because the native dashboards are accepted
  production capabilities.

## Decision 5: Make the thin derived image repository-owned

**Decision**: Track the secret-free `infra/hermes-coder/Dockerfile` and build
instructions in the application repo, then copy that exact merged source to
Aegis for the production build.

**Rationale**: The current Dockerfile exists only on Aegis. Prior upgrades
proved that a derived tag can be rebuilt against an old base pin. Source
control makes the base digest and added packages reviewable and reproducible.

**Alternatives considered**:

- Continue editing the host-only Dockerfile: rejected because it is not a
  durable restart surface.
- Remove the derived image: rejected because Walter's approved Guardian profile
  still requires GitHub CLI; that retirement is out of scope.

## Decision 6: Stage all tenants, cut over least-complex first

**Decision**: Qualify copied volumes without production delivery, then cut over
Mitchel, Walter, and Titus sequentially.

**Rationale**: Mitchel is the narrowest runtime and provides the first live
canary. Walter has the broadest platform operations surface. Titus is
systemd-managed and has the most tenant-local integrations (Matrix, memory,
Control Tower, guarded email, native OIDC), so it runs after the common image
has two live qualifications.

**Alternatives considered**:

- Upgrade all three in parallel: rejected because it removes isolation and
  compounds rollback.
- Start with Walter: rejected because it is the platform-operations runtime.
- Start with Titus: rejected because it has the largest tenant-specific
  qualification surface.

## Threat Model

- **Trust boundaries**: GitHub release metadata, Docker registry manifests,
  derived-image build context, Phase-injected runtime secrets, copied tenant
  volumes, live named volumes, Nginx/OIDC edges, and model/MCP tool output.
- **Assets**: tenant credentials, primary memory, schedules, chat/email state,
  authorization policy, model/provider choices, and platform control access.
- **Primary abuse/failure cases**: tag substitution, wrong-architecture image,
  stale `FROM` digest, smart-approval authority expansion, staging channel
  competition, secret leakage through inspection/logging, config rewrite,
  volume deletion, cross-tenant restart, and false health from a gateway-only
  process.
- **Controls**: immutable digest and source commit, ARM64 manifest verification,
  explicit manual/deny policy, secret-free repository changes, mode-0600
  ephemeral snapshots, network-isolated/full-process staging, separate MCP
  reachability checks, sequential rollout, per-runtime rollback, protected
  route checks, scoped log review, and deployment ledger.
