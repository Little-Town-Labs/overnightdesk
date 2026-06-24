# Cadence Scheduler Runbook

## Owner

Owner: OvernightDesk operator for `hermes-mitchel`.

## Current Posture

Scheduling is disabled by default. Feature 6 deploys the on-demand digest tool
and this runbook first. Do not enable a weekday job until the validation steps
below pass in production.

## Validation

1. Confirm `hermes-mitchel` and `tenet0-postgres` are healthy.
2. Confirm `trevor-db` exposes `generate_cadence_digest`.
3. Run an on-demand digest with `persist_call_tasks=false` and
   `scheduled=false`.
4. Review the digest for noisy, unsafe, or misleading recommendations.
5. Confirm logs do not contain secrets, database URLs, full prospect notes, or
   full follow-up draft bodies.
6. Run side-effect checks.

## Side-effect checks

For a default validation run, these counts should not increase:

- `trevor.interactions`
- `trevor.followup_drafts`
- `trevor.call_tasks`

Call task count may increase only when `persist_call_tasks=true` is explicitly
used.

## Enable

After manual validation, add a weekday job for the tenant using the approved
Hermes scheduling mechanism. The intended schedule is weekday morning in the
America/Chicago sales day.

The scheduled invocation must set:

- `scheduled=true`
- `persist_call_tasks=false` unless the operator intentionally changes that
  after validation

## Disable

Remove or disable the tenant scheduler entry that invokes
`generate_cadence_digest`. Restart only the affected scheduler/runtime process
if required by the mechanism used.

## Rollback

1. Disable the scheduler entry.
2. Restart only the affected tenant runtime if needed.
3. Verify `generate_cadence_digest` can still run on demand or redeploy the
   previous `trevor-db` runtime if the digest code itself is faulty.
4. Do not delete Trevor tables or data.

## Log location

Use the active Hermes tenant logs for scheduler output and startup diagnostics.
The digest output must remain bounded and must not include secrets or full
private notes.
