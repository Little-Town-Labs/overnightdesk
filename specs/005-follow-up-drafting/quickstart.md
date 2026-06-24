# Quickstart: Follow-Up Drafting

## Local Validation

From the Trevor DB MCP server directory:

```bash
cd tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db
npm test
```

Expected result:

- Follow-up tests pass for email, Telegram, SMS-copy, LinkedIn, Instagram, duplicate active draft reuse, DNC warnings, approval/discard state, and snake_case MCP output.
- Existing queue, brief, and capture tests continue to pass.

## Manual Smoke Scenarios

### Scenario 1: Draft Email From Captured Interaction

1. Seed a prospect and phone interaction.
2. Call `generate_follow_up_draft` with `interaction_id` and `channel=email`.
3. Verify:
   - `status=drafted`
   - `draft_status=draft`
   - `subject` and `body` are present
   - `outbound_sent=false`

### Scenario 2: Reuse Existing Draft

1. Generate a draft for the same interaction/channel twice.
2. Verify the second response returns the existing draft instead of creating a duplicate.

### Scenario 3: Copy-Ready Channels

1. Generate Telegram, SMS, LinkedIn, and Instagram drafts.
2. Verify each has body text, no required subject, and no send metadata.

### Scenario 4: Approval State

1. Mark a draft approved with `approved_by`.
2. Verify status is `approved` and `outbound_sent=false`.
3. Mark another draft discarded and verify it cannot be approved afterward.

## Aegis Deployment Validation

After merge and explicit production approval:

1. Build locally with `npm test`.
2. Back up current `/opt/data/mcp-servers/trevor-db`.
3. Sync built `dist` and `follow-up-drafting` skill to `hermes-mitchel`.
4. Restart only `hermes-mitchel`.
5. Verify:
   - `trevor-db` version is bumped.
   - `generate_daily_call_queue`, `generate_pre_call_brief`, `capture_post_call`, and follow-up tools are present.
   - MCP entrypoint connects to `tenet0-postgres`.
   - A no-send smoke confirms `outbound_sent=false`.
6. Append result to `/home/frosted639/src/overnightdesk-suite/deploys.log`.
