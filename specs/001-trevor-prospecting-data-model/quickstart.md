# Quickstart: Trevor Prospecting Data Model

This quickstart validates the repo-controlled schema artifacts for Feature 1.
It does not apply changes to production unless the operator explicitly runs the
production deployment commands from the runbook.

## 1. Review Artifacts

```bash
sed -n '1,240p' specs/001-trevor-prospecting-data-model/spec.md
sed -n '1,240p' specs/001-trevor-prospecting-data-model/plan.md
sed -n '1,260p' tenet-0/db/migrations/051_trevor_prospecting.sql
```

## 2. Dry-Run Migration Discovery

Use a non-production database URL with the existing Tenet-0/Trevor baseline:

```bash
TENET0_ADMIN_URL='<staging-admin-url>' \
  tenet-0/db/migrate.sh apply-pending --only 051_trevor_prospecting.sql --dry-run
```

Expected result:

- `051_trevor_prospecting` appears as pending when not yet applied.
- Already-applied environments report no pending migration.

Current session note: this dry run was not executed during artifact creation
because no safe non-production `TENET0_ADMIN_URL` was available. Do not use the
live production database as the first dry-run target.

## 3. Apply to Staging or Copied Database

```bash
TENET0_ADMIN_URL='<staging-admin-url>' \
  tenet-0/db/migrate.sh apply-pending --only 051_trevor_prospecting.sql
```

## 4. Verify Schema

```bash
psql "$TENET0_ADMIN_URL" -v ON_ERROR_STOP=1 \
  -f specs/001-trevor-prospecting-data-model/contracts/schema-verification.sql
```

Expected result:

- Verification queries return expected tables, columns, constraints, indexes,
  triggers, and grants.

## 5. Production Deployment

Production deployment requires the runbook:

```bash
sed -n '1,260p' docs/runbooks/trevor-prospecting-data-model.md
```

Do not apply to production until a backup path has been captured and a deploy
record plan is ready.
