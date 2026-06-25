# Quickstart: Follow-Up Sent Logging

## Local Validation

From the Trevor DB MCP package:

```bash
cd tenants/hermes-mitchel/mcp-servers/trevor-db
npm test
```

Expected result after implementation:

- Existing queue, brief, capture, follow-up, and digest tests still pass.
- New follow-up sent logging tests pass.
- Invalid sent confirmations create no interactions.

## Migration

Apply `tenet-0/db/migrations/052_trevor_followup_sent_logging.sql` before
starting the Feature 7 server build. The migration adds sent confirmation
metadata to `trevor.followup_drafts`:

- `sent_by`
- `sent_via`
- `audit_only_reason`
- `sent_interaction_id`

The migration is additive and idempotent; it does not rewrite existing drafts
or interactions.

## Manual Production Validation Shape

This feature should be deployed only after the standard quality gate and
read-only Aegis comparison pass.

Post-deploy validation should confirm:

1. `hermes-mitchel` is up.
2. `tenet0-postgres` is healthy.
3. Trevor DB MCP version includes the Feature 7 tools.
4. `list_follow_ups_awaiting_send` returns bounded approved-draft summaries
   without draft bodies.
5. `log_manual_follow_up_sent` can be exercised against a controlled test or
   known approved draft only with explicit operator approval.
6. Every response reports `outbound_sent=false`.
7. DB side effects are exactly the intended interaction row plus draft status
   transition for successful confirmation.

## Rollback

Rollback should restore the previous Trevor DB `dist` backup and restart only
`hermes-mitchel`. Manual sent interaction rows are historical records and
should not be deleted during runtime rollback without explicit owner approval.
