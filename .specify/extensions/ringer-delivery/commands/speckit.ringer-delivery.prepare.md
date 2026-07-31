---
description: "Classify analyzed work and prepare bounded Sol-Luna delivery"
---

# Prepare Sol-Luna Delivery

Prepare the active feature for proportional execution. This command is a Sol
lead responsibility and MUST NOT start workers or mutate production.

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
- Routine feature/system: Luna mutable implementation and Sol read-only quality gate.
- Sensitive/production: Luna read-only analysis only; Sol or the accountable human owns mutation.

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
`/home/frosted639/src/ringer-workflows/schemas/delivery-request.schema.json`.
Every task must include exact Spec Kit task IDs, requirements, disjoint owned
paths, non-goals, an argv verification list, and a mutable boolean.

Run:

```bash
python3 /home/frosted639/src/ringer-workflows/scripts/delivery_profile.py prepare \
  --request /tmp/ringer-delivery-request.json \
  --output /tmp/ringer-delivery/<project>-<feature> \
  --delivery-out <active-feature-directory>/delivery.md
```

Lint every generated manifest with the configured Ringer path and config, then
dry-run each manifest. Do not execute it yet.

## Completion Report

Report the classification, route, graph evidence, selected task IDs, generated
paths, lint/dry-run results, and any scope change that prevents safe delegation.
