---
name: speckit-ringer-delivery-prepare
description: Classify analyzed work and prepare bounded role-based delivery
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: ringer-delivery:commands/speckit.ringer-delivery.prepare.md
---

# Prepare Role-Based Delivery

Prepare the active feature for proportional execution. This command is an
accountable-lead responsibility and MUST NOT start workers or mutate
production. Apply the global policy's authoritative blocker taxonomy, finding
dispositions, scope decisions inside approved work, protected authorization
boundaries, and stable delivery roles.

## Preconditions

1. Read the repository `AGENTS.md`, constitution, active `spec.md`, `plan.md`,
   and `tasks.md`.
2. Confirm `analyze` is complete and select only dependency-ready task IDs.
3. Read `.specify/extensions/ringer-delivery/ringer-delivery-config.yml`.
4. Treat stricter project security, compliance, and production rules as
   authoritative.

## Classify

Choose exactly one value on each axis:

- Context: `greenfield` or `brownfield`
- Scale: `micro`, `feature`, or `system`
- Risk: `routine`, `sensitive`, or `production`

Apply these routes:

- Routine micro: lightweight lead execution; no generated worker manifest.
- Routine feature/system: accountable-lead execution with optional bounded
  implementation-worker mutation and a quality-reviewer read-only quality gate.
- Sensitive/production: accountable-lead mutation with optional
  routine-reviewer read-only analysis.

For brownfield feature/system work, use `codebase-memory-mcp` to confirm index
status, architecture, exact symbols and paths, and change impact. Verify graph
conclusions with targeted source reads. For greenfield work, record architecture
first and index only after meaningful source structure exists.

The generator is the fail-closed enforcement point: it rejects every brownfield
feature/system request unless graph status is `ready` and the evidence list is
non-empty. `codebase-memory-mcp` remains a conditional extension dependency so
greenfield and micro routes are not blocked when graph work is not required.

## Prepare

Create a scratch JSON request matching
`$HOME/.local/share/ringer-workflows/schemas/delivery-request.schema.json`.
Every task must include exact Spec Kit task IDs, requirements, disjoint owned
paths, non-goals, an argv verification list, and a mutable boolean. A mutable
task has exactly one canonical ID and a `gate_contract` repository-relative
path. The lead accepts the contract defined in
`$HOME/.local/share/ringer-workflows/schemas/task-gate-contract.md` before
preparing the package. Generation pins its hash; execution reruns the checks in
the actual task checkout before each worker starts.

Run:

```bash
python3 "$HOME/.local/share/ringer-workflows/scripts/delivery_profile.py" prepare \
  --request /tmp/ringer-delivery-request.json \
  --output /tmp/ringer-delivery/<project>-<feature> \
  --delivery-out <active-feature-directory>/delivery.md
```

Lint mutable manifests with generated `implementation.config.toml`, and
read-only manifests with the installed overlay config, then dry-run
the same manifest. Do not execute it yet:

```bash
RINGER_HOME="$HOME/.local/share/ringer/performance" \
python3 "$HOME/src/ringer/ringer.py" \
  --config "$HOME/.local/share/ringer-workflows/config/config.toml" \
  lint <generated-manifest>
RINGER_HOME="$HOME/.local/share/ringer/performance" \
python3 "$HOME/src/ringer/ringer.py" \
  --config "$HOME/.local/share/ringer-workflows/config/config.toml" \
  run <generated-manifest> --dry-run --no-dashboard
```

For the mutable manifest, substitute the generated `implementation.config.toml`
for the config path in both commands above.

Lint rejects engine names that are absent from the selected configuration.
The dry-run remains separate command, path, model, and effort readiness
evidence.

## Completion Report

Report the classification, route, graph evidence, selected task IDs, generated
paths, lint/dry-run results, and any scope change that prevents safe delegation.