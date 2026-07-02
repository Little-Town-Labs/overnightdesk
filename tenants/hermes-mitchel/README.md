# Hermes Mitchel Tenant Workflow

This directory contains the repo-controlled workflow source for Mitchel's
`hermes-mitchel` tenant on `aegis-prod`.

`hermes-mitchel` is the tenant runtime. Trevor is the assistant persona and
uses the `trevor-db` MCP server plus tenant skills in this directory to support
Mitchel's prospecting workflow.

## Layout

```text
tenants/hermes-mitchel/
├── mcp-servers/
│   └── trevor-db/        # TypeScript MCP tools for Trevor Postgres workflows
├── runbooks/             # Tenant-specific operator procedures
└── skills/               # Tenant-local skills synced into /opt/data/skills
```

## Runbooks

- `runbooks/trevor-postgres-toolbox.md`: read-only `psql` checks for Trevor
  using `tenet0-postgres` or a disposable `postgres:16-alpine` client. Do not
  install `psql` into the `hermes-mitchel` runtime for routine inspection.
- `runbooks/prospect-spreadsheet-import.md`: operator flow for loading
  Mitchel-provided prospect spreadsheets into Trevor and seeding missing-email
  enrichment.

## Boundaries

- Tenant workflow code lives here, not under `tenet-0/`.
- Tenet-0 database migrations remain under `tenet-0/db/migrations/` because
  the live Trevor schema is hosted by `tenet0-postgres`.
- The public platform UI remains under `src/app/`.
- Production deploys sync built tenant artifacts into the `hermes-mitchel`
  `/opt/data` runtime and restart only that tenant unless a runbook says
  otherwise.

## Safety

Mitchel prospecting workflows are human-in-the-loop. Trevor can rank prospects,
prepare briefs, capture call outcomes, draft follow-up text, and log manual
send confirmations. It must not autonomously send outbound communication.
