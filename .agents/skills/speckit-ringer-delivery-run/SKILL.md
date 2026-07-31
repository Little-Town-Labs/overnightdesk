---
name: speckit-ringer-delivery-run
description: Execute a prepared bounded Luna delivery and Sol quality flow
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: github-spec-kit
  source: ringer-delivery:commands/speckit.ringer-delivery.run.md
---

# Run Sol-Luna Delivery

Execute only a package already prepared by
`speckit.ringer-delivery.prepare`. The accountable Sol lead remains responsible
for integration, canonical tasks, and the merge decision.

## Preconditions

1. Read the generated `delivery-package.json`, normalized request, durable
   `delivery.md`, and every manifest.
2. Reconfirm the selected task IDs are still dependency-ready and file
   ownership is disjoint.
3. Re-run Ringer lint and dry-run. Stop if the repository, spec, task state,
   risk, or owned surface has changed.

## Execute the Route

- `lightweight`: do not invoke Ringer; the lead implements and verifies the
  micro change directly.
- `mutable-delegation`: run the Luna implementation manifest. Read every worker
  summary and bundle, integrate only reviewed changes, and rerun project checks.
- `readonly-delegation`: run only the Luna read-only manifest. Sensitive or
  production mutation remains with Sol or the accountable human lead.

Run manifests with the configured Ringer checkout and a stable identity. Never
substitute fallback or widen worker access without editing, linting, and
dry-running a newly reviewed manifest.

## Quality Gate

After lead integration and successful project checks, run the generated Sol
quality-gate manifest read-only. Only Critical and Required findings may start
one Luna remediation. Run one Sol delta review limited to those blockers and
regressions. If blockers remain, stop and return a defer, split, or re-scope
decision to the lead.

The lead marks canonical Spec Kit tasks complete only after executable checks
and Sol approval. Workers never commit, push, edit `.git`, or update task state.

## Completion Report

Report worker results, integrated files, project checks, Sol verdict, task IDs
marked by the lead, follow-up findings, and the next dependency-ready wave.