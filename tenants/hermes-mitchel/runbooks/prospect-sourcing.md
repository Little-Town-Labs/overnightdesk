# Prospect Sourcing Runbook

## Purpose

Operate Mitchel's prospect sourcing workflow safely on `aegis-prod`. The goal
is to find qualified independent jewelry-store or diamond-buyer prospects,
stage them for review, and promote only approved candidates into Trevor's
prospecting cadence.

## Production Components

- `hermes-mitchel`: tenant runtime.
- `camofox-browser`: internal stealth browser service.
- `tenet0-postgres`: Trevor schema and candidate/prospect data.
- Trevor DB MCP server: candidate staging, review, promotion, and call queue.
- BrowserAct: first-pass bulk discovery and template contact source when
  configured by runtime secret.

## Preflight

Run with `aegis-ssh`:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'hermes-mitchel|camofox-browser|tenet0-postgres'
```

Check environment names without printing secret values:

```bash
docker exec hermes-mitchel sh -lc 'for f in /opt/data/.env /opt/data/config.yaml; do test -f "$f" && grep -E "CAMOFOX|BROWSERACT|TREVOR_DB" "$f" | sed -E "s/=.*$/=set/; s/: .*$/: set/"; done'
```

Trevor DB MCP requires `TREVOR_DB_URL`. BrowserAct and CamoFox are scraping
workflow credentials; do not pass their values into the staging tools or print
them during preflight.

## Safe Operation

1. Bound the sourcing run by area, keyword, and result count.
2. Use BrowserAct first for bulk discovery and template contact finding.
3. Use CamoFox after BrowserAct to enrich or verify candidate websites and
   contact details.
4. Stage candidates first.
5. Review candidates with Mitchel.
6. Promote only explicitly approved candidates.
7. Verify promoted prospects include `lead_source`.
8. Verify no outbound messages were sent.

## Rollback

If a run stages bad candidates:

1. Mark candidates `rejected` with a reason.
2. Do not delete records unless the operator explicitly confirms cleanup.
3. If a candidate was promoted incorrectly, mark the prospect inactive or
   archived and close related open call tasks.

## Logging Rules

- Log counts, status, source, and bounded warnings.
- Do not log full scraped pages.
- Do not log API keys, database URLs, auth headers, cookies, or browser state.
