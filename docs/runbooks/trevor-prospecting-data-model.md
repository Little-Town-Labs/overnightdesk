# Trevor Prospecting Data Model Runbook

This runbook prepares the Feature 1 deployment for Mitchel's prospecting system.
It extends the existing `trevor` schema in `tenet0-postgres`; it does not create
the baseline schema from scratch.

## Scope

Migration:

```text
tenet-0/db/migrations/051_trevor_prospecting.sql
```

Verification:

```text
specs/001-trevor-prospecting-data-model/contracts/schema-verification.sql
```

Target:

```text
aegis-prod / tenet0-postgres / database tenet0 / schema trevor
```

## Safety Rules

- Do not apply this migration to production without a fresh schema backup.
- Do not export prospect data into markdown, chat, or logs.
- Do not rotate or print `trevor_app` credentials as part of this deployment.
- Do not enable cron jobs or outbound follow-up sends as part of this schema
  deployment.
- Append a deployment record to
  `/home/frosted639/src/overnightdesk-suite/deploys.log` only when a production
  deployment is attempted.

## Preflight

From the repo root:

```bash
git status --short
git branch --show-current
sed -n '1,260p' tenet-0/db/migrations/051_trevor_prospecting.sql
```

On aegis-prod, verify the baseline exists:

```bash
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "docker exec tenet0-postgres psql -U tenet0_admin -d tenet0 -Atc \
  \"select table_name from information_schema.tables where table_schema='trevor' order by table_name;\""
```

Expected baseline tables before deployment:

```text
interactions
memory
prospects
```

Verify the migration metadata table. Production currently uses
`public.schema_migrations(filename, applied_at)`. Migration
`051_trevor_prospecting.sql` records to the existing migration ledger shape
instead of creating a new ledger schema.

```bash
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "docker exec tenet0-postgres psql -U tenet0_admin -d tenet0 -Atc \
  \"select column_name || ':' || data_type from information_schema.columns where table_schema='public' and table_name='schema_migrations' order by ordinal_position;\""
```

Expected current production result:

```text
filename:text
applied_at:timestamp with time zone
```

## Backup

Capture a schema-scoped backup before production deployment:

```bash
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "mkdir -p /opt/overnightdesk/backups/trevor && \
   docker exec tenet0-postgres pg_dump -U tenet0_admin -d tenet0 \
     --schema=trevor --format=custom \
     > /opt/overnightdesk/backups/trevor/trevor-schema-${STAMP}.dump && \
   ls -lh /opt/overnightdesk/backups/trevor/trevor-schema-${STAMP}.dump"
```

Record the backup path before continuing.

## Dry Run

Run migration discovery against a staging or copied database first. If a safe
non-production database is not available, do not invent one during the
production deployment window.

```bash
TENET0_ADMIN_URL='<staging-admin-url>' \
  tenet-0/db/migrate.sh apply-pending --only 051_trevor_prospecting.sql --dry-run
```

Expected:

```text
051_trevor_prospecting.sql
```

appears as pending when the migration has not been applied.

## Production Apply

Production apply should be run from aegis-prod or from a shell that can reach
the production Postgres container with the admin connection string.

If running through Docker on aegis-prod:

```bash
scp -i ~/.ssh/ssh-key-2026-03-15 \
  tenet-0/db/migrations/051_trevor_prospecting.sql \
  ubuntu@147.224.183.55:/tmp/051_trevor_prospecting.sql

ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "docker cp /tmp/051_trevor_prospecting.sql tenet0-postgres:/tmp/051_trevor_prospecting.sql && \
   docker exec tenet0-postgres psql -U tenet0_admin -d tenet0 \
     -v ON_ERROR_STOP=1 -f /tmp/051_trevor_prospecting.sql"
```

If running from a checked-out repo with `TENET0_ADMIN_URL`:

```bash
TENET0_ADMIN_URL='<admin-url>' \
  tenet-0/db/migrate.sh apply-pending --only 051_trevor_prospecting.sql
```

Do not run both paths. Use one deployment path and record which was used.

## Verification

Run the verification contract:

```bash
psql "$TENET0_ADMIN_URL" -v ON_ERROR_STOP=1 \
  -f specs/001-trevor-prospecting-data-model/contracts/schema-verification.sql
```

Or from aegis-prod with the copied verification SQL:

```bash
scp -i ~/.ssh/ssh-key-2026-03-15 \
  specs/001-trevor-prospecting-data-model/contracts/schema-verification.sql \
  ubuntu@147.224.183.55:/tmp/schema-verification.sql

ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 \
  "docker cp /tmp/schema-verification.sql tenet0-postgres:/tmp/schema-verification.sql && \
   docker exec tenet0-postgres psql -U tenet0_admin -d tenet0 \
     -v ON_ERROR_STOP=1 -f /tmp/schema-verification.sql"
```

Expected high-level results:

- `trevor.call_tasks` exists.
- `trevor.followup_drafts` exists.
- `trevor.prospects` contains cadence columns.
- `trevor_app` has SELECT, INSERT, UPDATE, DELETE on the five Trevor tables.
- `trevor_app` has sequence usage for the new ID sequences.
- Lookup indexes exist for next action, priority, task status/due date, and
  draft status.
- Update triggers exist on `call_tasks` and `followup_drafts`.

## Rollback / Recovery

Preferred rollback is restore from the pre-deployment backup if data integrity
is in doubt.

For an immediate structural rollback before the new tables are used, run a
reviewed rollback script that:

```sql
DROP TABLE IF EXISTS trevor.followup_drafts;
DROP TABLE IF EXISTS trevor.call_tasks;
ALTER TABLE trevor.prospects
  DROP COLUMN IF EXISTS lead_source,
  DROP COLUMN IF EXISTS preferred_channel,
  DROP COLUMN IF EXISTS do_not_contact,
  DROP COLUMN IF EXISTS do_not_contact_reason,
  DROP COLUMN IF EXISTS last_outcome,
  DROP COLUMN IF EXISTS next_action_type,
  DROP COLUMN IF EXISTS next_action_at,
  DROP COLUMN IF EXISTS priority;
DELETE FROM public.schema_migrations WHERE filename = '051_trevor_prospecting.sql';
```

Do not run this rollback if any call tasks, follow-up drafts, or prospect
cadence fields have already been used by live workflows unless the business
owner approves losing that data.

## Platform Standard Update

After production deployment is verified, update the owning standard repository:

```text
/home/frosted639/src/overnightdesk-suite/overnightdesk-platform-standard/WHAT/databases.yaml
```

Add the new `trevor` tables and prospect cadence fields under
`tenet0-postgres.schemas.trevor`, then commit that change in the
`overnightdesk-platform-standard` repo.

## Deployment Record

Append to:

```text
/home/frosted639/src/overnightdesk-suite/deploys.log
```

Format:

```text
ISO-8601 | overnightdesk | aegis-prod/tenet0-postgres/trevor | <git-sha> | success|failure | Feature 001 trevor prospecting data model; backup=<path>; notes=<summary>
```

If the source repo has uncommitted changes, append `+dirty` to the git SHA.
