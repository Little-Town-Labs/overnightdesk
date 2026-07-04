# Quickstart: Prospect Deep Research

## Local validation

```bash
cd tenants/hermes-mitchel/mcp-servers/trevor-db
npm test
```

## First slice smoke

1. Apply migration `tenet-0/db/migrations/055_trevor_prospect_deep_research.sql` to a disposable or production-backed reviewed environment.
2. Run the Trevor MCP startup smoke:

```bash
cd /opt/data && set -a && . ./.env && set +a
cd /opt/data/mcp-servers/trevor-db
timeout 5s node dist/index.js
```

3. Store one public evidence row with `store_prospect_research_evidence`.
4. List it with `list_prospect_research_evidence`.
5. Verify `trevor.prospects.email` is unchanged.

## Weekly scheduler validation

The scheduler template is disabled by default:

```bash
node --test tests/prospect-research-scheduler.test.ts
```

Before installing the weekly jobs in production:

1. Confirm migration 055 is applied.
2. Confirm the deployed Trevor MCP server exposes the enrichment and deep
   research tools required by the scheduler template.
3. Copy `tenants/hermes-mitchel/scripts/prospect-weekly-central-gate.sh` to
   `/opt/data/scripts/prospect-weekly-central-gate.sh` and make it executable.
4. Use `tenants/hermes-mitchel/schedules/prospect-weekly-hermes-install-plan.json`
   as the disabled Hermes job source.
5. Verify the Central-time wake gate returns `wakeAgent=false` outside the
   target Saturday 23:00 America/Chicago window.
6. Run one on-demand missing-email enrichment smoke.
7. Run one on-demand deep research smoke that uses Hermes `delegate_task`
   subagents for source-finder, rdap-domain-verifier, and
   evidence-quality-reviewer roles, then stores evidence only from the parent
   job.
8. Get explicit operator approval to enable the weekly jobs.
9. Install both jobs with cron `0 4,5 * * 0` plus the Central-time wake gate.

## Production rollout notes

- Back up the Trevor schema before applying migration 055.
- Deploy MCP source and dist together.
- Restart only `hermes-mitchel`.
- Run MCP smoke and a 1-prospect no-email-write smoke.
- Do not enable weekly scheduler jobs until the scheduler validation checklist
  has passed and the operator has approved activation.
- Append `/home/frosted639/src/overnightdesk-suite/deploys.log`.
