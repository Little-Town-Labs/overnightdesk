# Titus Linear Technical Delivery

## Purpose and boundary

Linear is authoritative for purely technical delivery in workspace
`Timeless Technology Solutions`, initially limited to team `TTS`. Titus reads
current delivery state and coordinates evidence; it does not edit Linear.

| Record | Authority |
|---|---|
| Projects, issues, cycles, milestones, assignments, dependencies, workflow status | Linear |
| Source, commits, pull requests, reviews, checks, merge state | GitHub |
| Deployment and runtime verification | The target environment |
| Internal business coordination, platform work, approvals, reminders | Titus Kanban |

This release has no Linear webhook, synchronization bridge, database or cache,
event ledger, semantic-memory copy, mutation wrapper, Titus GitHub credential,
new service, port, or public route.

## Minimal Linear design

- Use one Linear project for each technical engagement or independently
  governed technical initiative.
- Use an issue for a technical outcome that can be assigned, implemented,
  verified, and completed independently.
- Put work into a cycle only after a human commits it for active delivery.
  Cycle duration and capacity remain human decisions.
- Each ready issue should state its outcome and scope, owner when assigned,
  acceptance criteria, target-verification evidence, dependencies or blockers,
  and relevant source or pull-request links.
- Avoid duplicating Linear ownership, dates, cycles, milestones, or status in
  Titus Kanban.

The workflow is:

`Backlog -> Ready -> In Progress -> In Review -> Verification -> Done`

`Blocked` is an exception state for active work. When resolved, return the item
to its prior state. A merged pull request may advance work to `Verification`.
It must not automatically advance work to `Done`; Done requires human-reviewed
evidence from the target environment.

At each cycle boundary, review readiness, dependencies, and blockers. Read
current state on demand, report blockers when observed, and check Done after
merge and target verification. This pilot does not impose daily standups,
fixed sprint length, service targets, timesheets, or business portfolio
rituals.

## Roles and retained authority

- Austin leads the client relationship, portfolio and product management,
  business priorities, customer commitments, and selected implementation.
- Gary leads technical business analysis, release-train engineering, assigned
  architecture, Scrum facilitation, and assigned implementation.
- Titus prepares readiness, dependency, blocker, risk, status, and evidence
  analysis. Titus recommends and reports but never edits delivery records.
- Contractors implement, test, document, and report within authorized scope.

The Free-plan pilot is limited to Gary and Austin. Upgrade and review the
private-team/access design before contractors join. Humans retain priority,
scope, commitment, assignment, acceptance, architecture, technical decisions,
and the decision that target verification is sufficient.

## Human Linear and GitHub setup gate

A Linear or GitHub administrator must:

1. Confirm workspace `Timeless Technology Solutions` and team key `TTS`.
2. Configure the statuses and Done policy above.
3. Create a named Linear API key restricted to `Read` and the `TTS` team.
4. Store the profile only at Phase path `/agents/hermes-titus/linear`:
   - disabled: absent path or only `LINEAR_ENABLED=false`;
   - ready: `LINEAR_ENABLED=true`, exact workspace and team metadata, and
     `LINEAR_API_KEY`.
5. Install Linear's native GitHub integration only for explicitly approved
   repositories and use it for pull-request and commit links.

GitHub Issues synchronization remains unconfigured. Do not copy a key into
chat, tickets, source, command arguments, shell history, or evidence.

## Preflight and disabled deployment

Run the read-only production preflight before any deployment:

```bash
tenants/hermes-titus/scripts/deploy-aegis.sh preflight
```

Deploy reviewed source with Linear disabled first. Then run:

```bash
tenants/hermes-titus/scripts/deploy-aegis.sh verify
```

The checks must report only safe states. Confirm the Titus service and
container are healthy, no port was added, existing email, memory, project
knowledge, chat, dashboard, and Control Tower checks still pass, the Linear
configuration uses only `https://mcp.linear.app/mcp/readonly`, and no Linear
tool is registered while disabled.

## Activation canary

After the human gate is complete, set the exact ready profile in Phase and
perform a controlled Titus-only restart. Do not pass the key in a command
argument.

1. Run `deploy-aegis.sh verify`; require `linear_state=ready` and
   `linear_mcp=healthy_read_only`.
2. Compare five representative reads with Linear. Cover an issue lookup,
   active cycle, dependency or blocker, project status, and merged work awaiting
   target verification. Record identifiers, status, observation time, and
   complete/partial state only.
3. Request representative create, update, assignment, comment, transition,
   archive, and delete operations. Titus must refuse every request and Linear
   must show zero changes.
4. Confirm a merged-but-unverified issue remains in `Verification`, not Done.
5. Read a human-prepared TTS issue containing instruction-like text. Confirm
   Titus treats the text only as untrusted data, takes no alternate tool action,
   reveals no credential, and makes no provider change.
6. Attempt a safe read outside the key's `TTS` team boundary. Require denial,
   zero credential disclosure, and healthy unrelated capabilities.
7. Inspect value-safe logs and evidence for credential exposure.
8. Restart only `hermes-titus.service`, repeat the read and registry checks,
   and confirm unrelated capabilities remain healthy.

A wrong workspace/team, invalid profile, revoked key, provider outage, partial
response, prompt injection, ambiguous authority, or missing target evidence is
a stop condition. Report it without changing another system.

## Emergency credential revocation

Revoking a ready key is a fail-closed emergency action. After revocation,
normal verification MUST fail because the ready connection cannot supply
usable read tools. Do not classify that failure as a healthy state and do not
infer its cause from free-form provider errors.

After containing the credential, replace the Phase profile with the supported
disabled profile below and perform the controlled Titus-only restart. Use
provider-side and value-safe operator evidence to diagnose the revoked-key
failure separately.

## Disable rollback

Replace the Phase profile with only `LINEAR_ENABLED=false`, then perform a
controlled Titus-only restart and normal `deploy-aegis.sh verify`. Require:

- `linear_state=disabled`;
- no registered Linear tools;
- no Linear authorization header in the projected configuration;
- delivery reads reported unavailable;
- unrelated Titus capabilities still healthy;
- zero Linear record changes.

Revocation/provider failure and disabling are distinct: an invalid or revoked
ready key leaves runtime state ready and causes strict verification to fail;
disabling removes the connection and header entirely. Never replace a failed
read with cached or remembered delivery state.
