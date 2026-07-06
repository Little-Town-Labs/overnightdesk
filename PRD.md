# OvernightDesk PRD

## Status

Current product direction: Hermes-based managed AI operations platform with
OpenRouter-backed model access, tenant-specific workflow source, billing,
operator tooling, and production auditability.

The former standalone tenant engine and Tenet-0 source tree are retired. This
repo no longer treats the old personal tenant runtime as an active product
surface.

## Goals

- Provide a customer-facing web platform for signup, billing, dashboard access,
  provisioning status, and account management.
- Support Hermes tenant runtimes, including `hermes-agent` and
  `hermes-mitchel`.
- Keep tenant workflow source under `tenants/<tenant-id>/` so operational
  skills, MCP servers, schedules, and runbooks are versioned.
- Keep production behavior auditable through `overnightdesk-platform-standard`
  and `overnightdesk-operations-audit`.
- Keep secrets in managed env/secret storage rather than repo files or memory
  docs.

## Active Runtime Model

- Runtime: Hermes.
- Provider access: OpenRouter or tenant-specific provider configuration.
- Long-term operational/project memory: OB1/open_brain where configured.
- Mitchel/Trevor data workflows: `tenants/hermes-mitchel/`.
- Platform control plane: `overnightdesk-platform-orchestrator`, built from
  the retained Go control-plane code in `overnightdesk-engine`.

## Current Repo Responsibilities

- Next.js app router frontend.
- Auth, billing, dashboard, admin views, and provisioning callbacks.
- App database schema and migrations.
- Tenant workflow source for Hermes tenants.
- Trevor MCP server source, tests, runbooks, and migrations for
  `hermes-mitchel`.

## Non-Goals

- Reintroducing the retired standalone tenant engine.
- Shipping customer workflows around legacy provider-specific terminal auth.
- Using retired personal-tenant source directories as active runtime code.
- Renaming compatibility database columns without a deliberate migration plan.

## Compatibility Notes

Some app schema fields still use legacy column names, including
`claude_auth_status` and `claude_calls`. These are database compatibility names,
not current product language. Rename them only through a planned migration that
updates schema, code, tests, and existing data together.

## Launch Checks

- App tests pass for touched frontend/API surfaces.
- Tenant workflow tests pass for touched tenant packages.
- Platform standard is updated for production-facing runtime changes.
- Production deploys are logged in
  `/home/frosted639/src/overnightdesk-suite/deploys.log`.
