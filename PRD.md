# OvernightDesk PRD

## Status

Current product direction: an authenticated internal business workspace with
membership-scoped access to named Hermes runtimes, operator tooling, and
production auditability.

The former standalone tenant engine and Tenet-0 source tree are retired. This
repo no longer treats the old personal tenant runtime as an active product
surface.

## Goals

- Provide Gary, Austin, and explicitly approved collaborators with separate
  authenticated identities and exact workspace memberships.
- Support the named `hermes-walter`, `hermes-titus`, and `hermes-mitchel`
  business runtimes without a general-purpose hosting control plane.
- Keep tenant workflow source under `tenants/<tenant-id>/` so operational
  skills, MCP servers, schedules, and runbooks are versioned.
- Keep production behavior auditable through `overnightdesk-platform-standard`
  and `overnightdesk-operations-audit`.
- Keep secrets in managed env/secret storage rather than repo files or memory
  docs.
- Prefer Go for new first-party services, agents, operational daemons, CLIs,
  and infrastructure automation when practical. Keep browser UI and small
  changes in established non-Go services in their existing stack unless a
  deliberate migration is approved.

## Active Runtime Model

- Runtime: Hermes.
- Provider access: OpenRouter or tenant-specific provider configuration.
- Long-term operational/project memory: OB1/open_brain where configured.
- Mitchel/Trevor data workflows: `tenants/hermes-mitchel/`.
- Production lifecycle: reviewed, human-approved deployment procedures for
  each named runtime. The former platform orchestrator and Docker socket proxy
  are retired.

## Current Repo Responsibilities

- Next.js app router frontend.
- Auth, workspace membership, dashboard, and admin views.
- App database schema and migrations.
- Tenant workflow source for Hermes tenants.
- Trevor MCP server source, tests, runbooks, and migrations for
  `hermes-mitchel`.

## Non-Goals

- Reintroducing the retired standalone tenant engine.
- External customer signup, billing-triggered hosting, or self-service runtime
  provisioning on Aegis.
- Customer workload or customer data hosting on `aegis-prod` without a
  separately documented owner-approved exception. Customer planes normally use
  engagement-specific infrastructure such as Azure, Vultr, or another approved
  provider.
- Shared user credentials for Gary and Austin's Titus access.
- Shipping customer workflows around legacy provider-specific terminal auth.
- Using retired personal-tenant source directories as active runtime code.
- Renaming compatibility database columns without a deliberate migration plan.
- Deleting legacy billing/provisioning source without a separate migration and
  compatibility review.

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
