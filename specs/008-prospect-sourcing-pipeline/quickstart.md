# Quickstart: Prospect Sourcing Pipeline

## Local Validation

From the Trevor DB MCP server:

```bash
cd tenet-0/tenant-workflows/hermes-mitchel/mcp-servers/trevor-db
npm test
npm run build
npm audit --json
```

From the repo root:

```bash
.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
git diff --check
```

## Scenario 1: Discover With BrowserAct, Enrich With CamoFox

1. Run BrowserAct Google Maps Scraper for a small area such as
   `Tysons Corner, Virginia`.
2. Filter independent stores from the BrowserAct result.
3. Use BrowserAct Contact Finder for promising records when useful.
4. Use CamoFox to inspect candidate websites where BrowserAct output is
   incomplete or needs verification.
5. Keep all credentials in runtime environment or memory, not source files.

Expected result:

- BrowserAct provides the first candidate list.
- CamoFox adds or verifies missing website/contact detail.
- Raw scraped pages are not stored as prospect notes.

## Scenario 2: Stage Sourced Candidates

1. Run the sourcing workflow for a small area such as `Tysons Corner, Virginia`.
2. Provide no more than 30 scraped businesses to `stage_prospect_candidates`.
3. Verify the response creates a sourcing run and staged candidates.
4. Verify no active prospects or call tasks are created yet.

Expected result:

- Candidates include source attribution.
- Chain stores and weak records are flagged or rejected.
- Full scraped pages and credentials are not logged.

## Scenario 3: Review Candidates

1. Call `review_prospect_candidates` with `limit=15`.
2. Confirm the list separates recommended, needs-review, duplicate, rejected,
   and approved candidates.
3. Confirm duplicate reasons are visible without dumping full prospect notes.

Expected result:

- Review output is bounded.
- Duplicates are not proposed as new prospects.
- Candidates without contact data are not marked call-ready.

## Scenario 4: Promote Approved Candidate

1. Select one recommended candidate.
2. Call `promote_prospect_candidate` with explicit `approved_by`.
3. Verify a Trevor prospect is created or reused.
4. Verify `lead_source` is non-empty.
5. Verify one open initial outreach call task is created when requested.

Expected result:

- Promotion is idempotent.
- No outbound message is sent.
- Duplicate promotions create no duplicate prospect or task.

## Production Read-Only Validation

Use `aegis-ssh` before implementation and deployment:

```bash
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'hermes-mitchel|camofox-browser|tenet0-postgres'"
```

Verify live assumptions:

- `camofox-browser` is running.
- `hermes-mitchel` has `TREVOR_DB_URL` in its config for the Trevor DB MCP.
- BrowserAct and CamoFox credentials are supplied from runtime env/config or
  memory for the scraping workflows, not repository files or MCP tool inputs.
- Existing Trevor row counts are recorded before any write smoke.
