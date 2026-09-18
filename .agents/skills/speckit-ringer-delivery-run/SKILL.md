---
name: speckit-ringer-delivery-run
description: Execute a prepared bounded role-based delivery and quality flow
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: ringer-delivery:commands/speckit.ringer-delivery.run.md
---

# Run Role-Based Delivery

Execute only a package already prepared by
`speckit.ringer-delivery.prepare`. The accountable lead remains responsible for
integration, canonical tasks, and the merge decision. Apply the global policy's
authoritative blocker taxonomy, finding dispositions, scope decisions inside
approved work, protected authorization boundaries, and stable delivery roles.

## Preconditions

1. Read the generated `delivery-package.json`, normalized request, durable
   `delivery.md`, and every manifest. For a `lightweight` route, continue
   directly to **Execute the Route**; steps 2–3 apply only to delegation routes.
2. Read the accepted task contract described in
   `$HOME/.local/share/ringer-workflows/schemas/task-gate-contract.md`. Each
   implementation launch must pass its pinned contract; file ownership stays disjoint.
3. Re-run Ringer lint and dry-run. Stop if the repository, spec, task state,
   risk, or owned surface has changed.

```bash
python3 "$HOME/src/ringer/ringer.py" \
  --config "$HOME/.local/share/ringer-workflows/config/config.toml" \
  lint <generated-manifest>
python3 "$HOME/src/ringer/ringer.py" \
  --config "$HOME/.local/share/ringer-workflows/config/config.toml" \
  run <generated-manifest> --dry-run --no-dashboard
```

For a mutable manifest, use the generated `implementation.config.toml` for
all three commands (lint, dry-run, run). The installed role config shown above
is for read-only manifests and deliberately cannot resolve the gated engine.

## Execute the Route

- `lightweight`: do not invoke Ringer; the lead implements and verifies the
  micro change under the repository’s ordinary lightweight process. This route
  has no canonical task package and does not use `task_gate.py`; retain its
  scope, authorization, and repository-appropriate verification checks.
- `mutable-delegation`: run the implementation-worker manifest. Read every worker
  summary and bundle, integrate only reviewed changes, and rerun project checks.
- `readonly-delegation`: run only the routine-reviewer read-only manifest.
  Sensitive or production mutation remains with the accountable lead, who
  launches every implementation task through the same `task_gate.py run` CLI.

Run manifests with the configured Ringer checkout and a stable identity. Never
substitute fallback or widen worker access without editing, linting, and
dry-running a newly reviewed manifest.

```bash
python3 "$HOME/src/ringer/ringer.py" \
  --config "$HOME/.local/share/ringer-workflows/config/config.toml" \
  run <generated-manifest> --identity <repo-or-job-name>
```

For lead-only implementation, launch the task command through the gate:

```bash
python3 "$HOME/.local/share/ringer-workflows/scripts/task_gate.py" run \
  --contract <accepted-contract> --sha256 <reviewed-contract-hash> \
  --task <canonical-task-id> --repo <task-checkout> -- <implementation-command> <args>
```

The gate checks accepted prerequisites, the available verification environment,
and fresh assertion RED before the command starts. Do not use a prior `check`
result as permission for an ungated edit. Unsupported runners fail closed;
nonbehavioral tasks require a reviewed reason in the pinned contract. Never
install dependencies to turn an environment failure into a pass. Automatic
mutable retry is disabled; prepare a new reviewed dispatch for remediation.

## Quality Gate

After lead integration and successful project checks, run the generated
quality-reviewer quality-gate manifest read-only. Each finding must have a
severity and exactly one disposition. Only a `fix-before-merge` disposition
supported by the authoritative blocker taxonomy may start one
implementation-worker remediation. Run one quality-reviewer delta review
limited to those blockers and regressions. If blockers remain, stop and return a
defer, split, or re-scope decision to the lead.

The lead marks canonical Spec Kit tasks complete only after executable checks
and quality-reviewer approval. Workers never commit, push, edit `.git`, or
update task state.

## Completion Report

Report worker results, integrated files, project checks, quality-reviewer
verdict, task IDs marked by the lead, follow-up findings, and the next
dependency-ready wave.

When invoked from an implementation workflow, this command is terminal for
that invocation. Report success, failure, blocked, or human-decision outcomes
and return control to the accountable lead. Do not resume the caller’s ordinary
task outline or start another wave; prepare and accept the next wave separately.