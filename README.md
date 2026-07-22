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

## Current Agent Control-Surface Delivery

Production `main` at `1e44360` includes Feature 022's unified agent control
surfaces from PR 85. Overview, Settings, and selected-agent Admin Configuration
share one exact membership-filtered agent context and consistent Identity,
Runtime, capability, and configuration structure. Variable name/logo
presentation and the selected-agent Open Chat and Advanced Dashboard actions
remain on Overview; Open Chat is intentionally not a permanent primary-
navigation tab. Titus Open WebUI is the accepted reference canary, while Walter
has no Open WebUI deployment.

The legacy arbitrary credential-map endpoint is retired. Cataloged replacements
are write-only, role checked, metadata audited, and remain disabled for Titus
and Walter until the boundary-aware provisioner contract in
[`specs/022-agent-control-surfaces/contracts/managed-variable-replacement.md`](specs/022-agent-control-surfaces/contracts/managed-variable-replacement.md),
its isolated `overnightdesk-engine` implementation, and the separate typed
frontend adoption increment are qualified. Authenticated owner acceptance of
the deployed Overview, Settings, Admin, Open Chat, and Runtime consistency is
the final user-facing gate.
The [Spec Kit task list](specs/022-agent-control-surfaces/tasks.md) is the
current delivery source of truth.

## Runtime Model

Current agent runtimes use Hermes and are divided by use case and primary-memory
boundary. A runtime may expose more than one persona; a person may be authorized
to more than one runtime. Shared knowledge access does not merge runtime-local
history.

| Runtime | Use case | Default persona | Primary memory |
|---------|----------|-----------------|----------------|
| `hermes-walter` | OvernightDesk/Aegis platform operations | Walter | Existing platform runtime volume (`hermes-agent-data`) |
| `hermes-titus` | Timeless Tech Solutions operations and collaboration | Titus | Titus runtime memory |
| `hermes-mitchel` | Mitchel business workflows | Trevor | Mitchel/Trevor runtime memory and business records |
| `hermes-rex` | Gary's personal tooling, off Aegis | Rex | Separate personal runtime memory |

The retained `hermes-agent` name is a rollback identity during the Walter
migration. References to the upstream Hermes Agent product or image keep the
upstream `hermes-agent` name.

## Tenant Workflow Source

Tenant-specific Hermes workflow source lives under `tenants/<tenant-id>/`.
These directories are repo-controlled deploy sources for tenant-local MCP
servers, skills, schedules, and runbooks that are synced into tenant runtimes on
`aegis-prod`.

Walter's default persona source is `tenants/hermes-walter/`. Mitchel's tenant is
`tenants/hermes-mitchel/`. It contains Trevor's prospecting
MCP server, tenant skills, operator runbooks, and Trevor database migrations
under `tenants/hermes-mitchel/mcp-servers/trevor-db/ops/migrations/`.

## Project Structure

```text
overnightdesk/
├── src/                              Next.js app, API routes, lib, db schema
├── drizzle/                          Generated app database migrations
├── tenants/
│   ├── hermes-walter/                 Walter platform-operations persona source
│   ├── hermes-titus/                  Titus/TTS runtime source
│   └── hermes-mitchel/                Mitchel/Trevor tenant workflow source
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
