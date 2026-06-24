# Quickstart: Daily Call Queue

## Local Artifact Review

From the repo root:

```bash
git status --short --branch
sed -n '1,220p' specs/002-daily-call-queue/spec.md
sed -n '1,260p' specs/002-daily-call-queue/plan.md
sed -n '1,260p' specs/002-daily-call-queue/data-model.md
sed -n '1,260p' specs/002-daily-call-queue/contracts/mcp-tools.yaml
```

Expected:

- Active branch is `002-daily-call-queue`.
- `.specify/feature.json` points at `specs/002-daily-call-queue`.
- No `NEEDS CLARIFICATION` markers remain.

## Implementation Validation Targets

Before production sync, tests should prove:

```text
do-not-contact prospects are never returned as callable recommendations
repeat generation reuses existing open call tasks for the same sales day
missing phone/preferred channel creates review_needed output instead of call_ready output
ranking is stable across repeated runs against unchanged data
task status updates do not create interactions or send outreach
```

## Production Read-Only Preflight

Use `aegis-ssh` for live checks. Do not print `.env`, credentials, full notes, or generated queue bodies.

```bash
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "docker exec tenet0-postgres psql -U tenet0_admin -d tenet0 -Atc \
  \"select count(*) from trevor.prospects;
    select count(*) from trevor.call_tasks;
    select count(*) from trevor.prospects where do_not_contact = true;\""
```

Expected current baseline after Feature 1:

```text
43
0
<suppressed prospect count may vary>
```

Verify live tenant files exist:

```bash
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "docker exec hermes-mitchel sh -lc \
  'test -f /opt/data/mcp-servers/trevor-db/dist/index.js &&
   test -d /opt/data/skills &&
   echo tenant-layout-ok'"
```

## Deployment Shape

Implementation should:

1. Build/test repo-controlled tenant workflow source.
2. Sync only the built Trevor MCP server and daily-call-queue skill to `hermes-mitchel:/opt/data`.
3. Restart or reload only the affected tenant process if required by Hermes MCP discovery.
4. Run the queue tool with a safe validation limit.
5. Verify:
   - no do-not-contact prospect appears in callable recommendations,
   - open `trevor.call_tasks` rows match returned task IDs,
   - re-running does not create duplicates,
   - no follow-up drafts or interactions are created by queue generation.

## Honest Missing-Context Validation

When reviewing a generated queue, confirm:

- Missing Agiled links appear as missing context, not invented CRM facts.
- Missing inventory context produces the warning that ranking used Trevor
  cadence data only.
- Prospects without phone numbers appear under `review_needed`, not
  `recommendations`.
- Do-not-contact prospects are counted only as suppressed and are not named in
  the call-ready list.

## Production Deployment Record

If production files are changed or a tenant process is restarted, append a record to:

```text
/home/frosted639/src/overnightdesk-suite/deploys.log
```

Format:

```text
ISO-8601 | overnightdesk | aegis-prod/hermes-mitchel/trevor-db | <git-sha> | success|failure | Feature 002 daily call queue; notes=<summary>
```

Use `<git-sha>+dirty` when deploying from uncommitted source.
