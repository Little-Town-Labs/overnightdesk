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

## Production rollout notes

- Back up the Trevor schema before applying migration 055.
- Deploy MCP source and dist together.
- Restart only `hermes-mitchel`.
- Run MCP smoke and a 1-prospect no-email-write smoke.
- Append `/home/frosted639/src/overnightdesk-suite/deploys.log`.
