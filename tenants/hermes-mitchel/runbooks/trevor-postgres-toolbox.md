# Trevor Postgres Toolbox

## Purpose

Use `psql` for read-only Trevor schema inspection and operator verification on
`aegis-prod` without installing Postgres client tools into the
`hermes-mitchel` tenant runtime.

The normal workflow should use Trevor MCP tools. Use this toolbox for preflight,
counts, migration verification, queue inspection, and incident diagnosis.

## Production Components

- `hermes-mitchel`: owns `/opt/data/.env`, including `TREVOR_DB_URL`.
- `tenet0-postgres`: hosts the `trevor` schema.
- `postgres:16-alpine`: approved one-shot client image when a separate `psql`
  process is more convenient than `docker exec tenet0-postgres`.

## Preflight

Run with `aegis-ssh`:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'hermes-mitchel|tenet0-postgres'
```

Confirm the tenant has the DB URL without printing it:

```bash
docker exec hermes-mitchel sh -lc 'test -f /opt/data/.env && grep -q "^TREVOR_DB_URL=" /opt/data/.env && echo "TREVOR_DB_URL=set"'
```

## Preferred Read-Only Checks

Use the Postgres server container's bundled client when the Trevor app role and
database name are enough:

```bash
docker exec tenet0-postgres psql -U trevor_app -d tenet0 \
  -c "select count(*) as prospects from trevor.prospects;"
```

Useful Trevor queue summary:

```bash
docker exec tenet0-postgres psql -U trevor_app -d tenet0 \
  -c "select status, count(*) from trevor.prospect_email_enrichment group by status order by status;"
```

## One-Shot Client

Use a disposable client when the query should use the exact tenant
`TREVOR_DB_URL`. This mounts the Hermes-Mitchel data volume read-only and does
not print the connection string:

```bash
docker run --rm \
  --network overnightdesk_overnightdesk \
  --volumes-from hermes-mitchel:ro \
  --entrypoint sh \
  postgres:16-alpine \
  -lc 'set -a; . /opt/data/.env; set +a; psql "$TREVOR_DB_URL" -v ON_ERROR_STOP=1 -c "select current_database(), current_user;"'
```

Run a bounded Trevor summary through the same pattern:

```bash
docker run --rm \
  --network overnightdesk_overnightdesk \
  --volumes-from hermes-mitchel:ro \
  --entrypoint sh \
  postgres:16-alpine \
  -lc 'set -a; . /opt/data/.env; set +a; psql "$TREVOR_DB_URL" -v ON_ERROR_STOP=1 -c "select (select count(*) from trevor.prospects) as prospects, (select count(*) from trevor.call_tasks) as call_tasks, (select count(*) from trevor.followup_drafts) as followup_drafts;"'
```

## Rules

- Do not install `psql` into `hermes-mitchel` for routine operator checks.
- Do not print `TREVOR_DB_URL`, passwords, auth headers, cookies, or API keys.
- Prefer purpose-built Trevor MCP tools for writes and repeated workflows.
- Keep SQL checks bounded. Avoid full prospect dumps in terminal logs.
- Use `-v ON_ERROR_STOP=1` for verification commands that should fail fast.
- Any write SQL must have an explicit operator reason and backup/rollback path.
