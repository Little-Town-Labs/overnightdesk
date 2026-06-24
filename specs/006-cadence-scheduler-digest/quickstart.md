# Quickstart: Cadence Scheduler and Digest

## Local Verification

From the Trevor DB MCP package:

```bash
cd tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db
npm test
```

Expected:

- Digest tests pass with existing queue, follow-up, capture, and brief tests.
- Default digest run reports `persisted_call_tasks=false`.
- Default digest run reports no outbound sends, no created interactions, and no created follow-up drafts.

## Manual Digest Smoke

1. Start from data that includes prospects and, optionally, draft follow-ups.
2. Call `generate_cadence_digest` with:

```json
{
  "sales_day": "2026-06-24",
  "limit": 10,
  "persist_call_tasks": false,
  "scheduled": false
}
```

3. Confirm the response includes:

- `call_queue`
- `review_needed`
- `stale_work`
- `follow_up_approvals`
- `counts`
- `warnings`
- `side_effects.outbound_sent=false`

4. Confirm no full prospect notes or full follow-up draft bodies appear.

## Scheduler Validation

Before enabling any schedule:

1. Run the digest manually in production.
2. Confirm output is useful and not noisy.
3. Confirm logs contain no secrets or unnecessary prospect detail.
4. Confirm DB side-effect counts are unchanged for the default run:
   - `trevor.interactions`
   - `trevor.followup_drafts`
   - `trevor.call_tasks`
5. Only then follow `tenet-0/tenant-workflows/hermes-mitchel/runbooks/cadence-scheduler.md`.

## Deployment Verification

After deploy to `aegis-prod/hermes-mitchel`:

1. Verify `trevor-db` version is bumped.
2. Verify `generate_cadence_digest` is present.
3. Verify `/opt/data/skills/cadence-digest/SKILL.md` is present.
4. Verify the scheduler runbook is present.
5. Run direct MCP startup check with production environment.
6. Verify scheduler is still disabled by default.
7. Verify DB side-effect counts remain unchanged for default digest smoke.
