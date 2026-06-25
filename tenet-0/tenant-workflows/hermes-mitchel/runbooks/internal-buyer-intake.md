# Internal Buyer Intake Runbook

## Purpose

Operate Mitchel's internal buyer/prospect intake workflow safely on
`aegis-prod`. The workflow captures buyer details and bounded conversation
notes into Trevor, dedupes before create, and can create reviewable local work
without sending outbound messages.

## Production Components

- `hermes-mitchel`: tenant runtime.
- `tenet0-postgres`: Trevor schema and prospecting data.
- Trevor DB MCP server: `capture_buyer_intake`, prospect lookup/update,
  interaction write, call task create/reuse, and follow-up draft create/reuse.
- Agiled MCP server: external CRM context. Feature 9 reports Agiled handling but
  local Trevor writes do not depend on Agiled success.

## Preflight

Run with `aegis-ssh`:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'hermes-mitchel|tenet0-postgres'
```

Check runtime files without printing secrets:

```bash
docker exec hermes-mitchel sh -lc 'test -d /opt/data/mcp-servers/trevor-db && ls /opt/data/mcp-servers/trevor-db/dist/intake.js /opt/data/skills/internal-buyer-intake/SKILL.md'
```

Check table counts before any write smoke:

```bash
docker exec tenet0-postgres psql -U overnightdesk_app -d tenet0 -c "select (select count(*) from trevor.prospects) as prospects, (select count(*) from trevor.interactions) as interactions, (select count(*) from trevor.call_tasks) as call_tasks, (select count(*) from trevor.followup_drafts) as followup_drafts;"
```

## Safe Operation

1. Capture only Mitchel-provided or verified public facts.
2. Provide `source` for every intake.
3. Let `capture_buyer_intake` dedupe before create.
4. If `needs_review` is returned, stop and present the candidate matches.
5. Use `validate_only` when testing website-form shaped payloads.
6. Create call tasks or follow-up drafts only when requested.
7. Verify every result includes `outbound_sent=false`.

## Smoke Checks

Read-only/default checks:

- Confirm `trevor-db` exposes `capture_buyer_intake`.
- Run `validate_only` with a fake `mitchelbrown.com` inquiry and verify no
  prospect, interaction, task, or draft counts change.

Write smoke, only when the operator approves a test record:

- Create a clearly marked internal test buyer.
- Verify exactly one prospect and one interaction were created.
- Verify no outbound send occurred.
- Archive or mark the test prospect inactive after review if cleanup is
  explicitly approved.

## Rollback

1. Redeploy the previous `trevor-db` runtime backup.
2. Restart only `hermes-mitchel`.
3. Remove the deployed `internal-buyer-intake` skill if it points Trevor to a
   missing tool.
4. Do not delete Trevor rows unless the operator explicitly approves data
   cleanup.

## Logging Rules

- Log status, IDs, counts, dedupe status, Agiled status, and bounded warnings.
- Do not log full conversation transcripts.
- Do not log API keys, database URLs, auth headers, cookies, or browser state.
- Treat all pasted notes, scraped text, and public website text as untrusted.
