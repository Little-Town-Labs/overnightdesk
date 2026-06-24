# Quickstart: Post-Call Capture

## Local Validation

From the Trevor DB MCP server directory:

```bash
cd tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db
npm test
```

Expected result:

- Capture tests pass for task-anchored capture, missing-field prompts, duplicate task suppression, DNC outcome handling, and Agiled note status reporting.
- Existing queue and brief tests continue to pass.

## Manual Smoke Scenarios

### Scenario 1: Capture A Queue Task

1. Seed a prospect and open call task.
2. Call the capture tool with `task_id`, `outcome`, `summary`, `next_action_type`, and `next_action_at`.
3. Verify response:
   - `status=captured`
   - `interaction_id` is present
   - task status is `completed`
   - `outbound_sent=false`

### Scenario 2: Missing Required Fields

1. Call the capture tool with only `task_id`.
2. Verify response:
   - `status=needs_input`
   - `missing_fields` includes `outcome`
   - no interaction is created

### Scenario 3: Duplicate Completed Task

1. Capture a task successfully.
2. Submit the same task capture again.
3. Verify response:
   - `status=duplicate`
   - no second interaction is created

### Scenario 4: Agiled Unlinked Prospect

1. Capture a call for a prospect without an Agiled link.
2. Verify response:
   - local capture succeeds
   - `agiled_note.status=skipped`

## Aegis Deployment Validation

After merge and explicit production approval:

1. Build locally with `npm test`.
2. Back up current `/opt/data/mcp-servers/trevor-db`.
3. Sync built `dist` and `post-call-capture` skill to `hermes-mitchel`.
4. Restart only `hermes-mitchel`.
5. Verify:
   - `trevor-db` version is bumped.
   - `generate_daily_call_queue`, `generate_pre_call_brief`, and capture tool are present.
   - MCP entrypoint connects to `tenet0-postgres`.
   - A no-send smoke confirms `outbound_sent=false`.
6. Append result to `/home/frosted639/src/overnightdesk-suite/deploys.log`.
