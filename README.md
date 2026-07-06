# OvernightDesk

**Your business never sleeps.**

Customer-facing web platform for OvernightDesk: landing pages, auth, billing,
dashboard, provisioning callbacks, tenant workflow source, and operator-facing
admin surfaces.

## Architecture

OvernightDesk is a multi-repo platform deployed on aegis-prod:

| Repo | Language | Purpose | Status |
|------|----------|---------|--------|
| **overnightdesk** (this repo) | TypeScript/Next.js | Vercel frontend, auth, billing, dashboard, provisioning orchestration | Active |
| [overnightdesk-engine](../overnightdesk-engine) | Go | Platform orchestrator and Hermes provisioning support | Active control-plane code |
| [overnightdesk-securityteam](../overnightdesk-securityteam) | TypeScript/Fastify | Message traffic security, outbound guards, approval support | Active |
| [overnightdesk-SecurityCouncil](../overnightdesk-SecurityCouncil) | Go | Platform security scanning and review | Active |
| [overnightdesk-communicationmodule](../overnightdesk-communicationmodule) | Go | gRPC notification bus for Telegram and Discord dispatch | Active |

## Runtime Model

Current agent runtime is Hermes. The retired standalone tenant engine and
Tenet-0 source tree have been removed from this repo. Gary's active runtime is
`hermes-agent`; Mitchel's runtime is `hermes-mitchel`.

## Tenant Workflow Source

Tenant-specific Hermes workflow source lives under `tenants/<tenant-id>/`.
These directories are repo-controlled deploy sources for tenant-local MCP
servers, skills, schedules, and runbooks that are synced into tenant runtimes on
`aegis-prod`.

Mitchel's tenant is `tenants/hermes-mitchel/`. It contains Trevor's prospecting
MCP server, tenant skills, operator runbooks, and Trevor database migrations
under `tenants/hermes-mitchel/mcp-servers/trevor-db/ops/migrations/`.

## Project Structure

```text
overnightdesk/
├── src/                              Next.js app, API routes, lib, db schema
├── drizzle/                          Generated app database migrations
├── tenants/
│   └── hermes-mitchel/               Mitchel/Trevor tenant workflow source
├── vercel.json                       Cron jobs config
├── .specify/                         Spec-kit specifications and roadmap
└── .env.example                      Required env vars
```

## Commands

```bash
npm install
npm run dev
npm test
npm run build
```

## Environment Variables

See `.env.example` for the full list. Key groups:

- `DATABASE_URL`, `DATABASE_TEST_URL`
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- Stripe keys and price IDs
- `NEXT_PUBLIC_BILLING_ENABLED`, `ADMIN_EMAILS`, `INVITED_EMAILS`
- `RESEND_API_KEY`, `EMAIL_FROM`
- `PROVISIONER_URL`, `PROVISIONER_SECRET`
- `CRON_SECRET`, owner notification settings

## Notes

Some application database fields still contain legacy column names such as
`claude_auth_status` and `claude_calls`. Those names are compatibility fields in
the app schema and should only be renamed through a deliberate database
migration.
