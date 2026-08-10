# OvernightDesk PRD

## Status

Current product direction: an authenticated internal business workspace with
membership-scoped access to named Hermes runtimes, operator tooling, and
production auditability.

The web product is existing-account only. One owner actively uses sign-in,
password recovery, chat, dashboard, settings, and administration. Other
existing identities remain untouched, but there is no public registration,
email-verification journey, pricing, checkout, subscription authority,
customer setup wizard, customer callback, or self-service account deletion.

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
- Existing-account sign-in and password recovery with registration denied.
- App database schema and migrations.
- Tenant workflow source for Hermes tenants.
- Trevor MCP server source, tests, runbooks, and migrations for
  `hermes-mitchel`.

## Non-Goals

- Reintroducing the retired standalone tenant engine.
- Restoring acquisition, registration, pricing, checkout, Stripe,
  subscription-derived authorization, customer lifecycle controls, or
  self-service account deletion.
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

## Retirement State

Feature 040 removed the customer signup, Stripe/billing, subscription, wizard,
callback, customer instance-control, and self-service deletion source. Its
approved Neon zero-state cleanup removed only the empty subscription schema and
unused wizard column while preserving active identity, membership, and
instance records. The remaining T043-T045 production gates independently own
frontend release verification, deployment of the isolated managed-variable
service, and removal of obsolete provider/secret configuration. Until those
gates and the observation closeout pass, Feature 040 remains open.

## Compatibility Notes

Some app schema fields still use legacy column names, including
`claude_auth_status` and `claude_calls`. These are database compatibility names,
not current product language. Rename them only through a planned migration that
updates schema, code, tests, and existing data together.

## Launch Checks

- App tests pass for touched frontend/API surfaces.
- Tenant workflow tests pass for touched tenant packages.
- Platform standard is updated for production-facing runtime changes.
- Production actions are logged in the canonical Aegis ledger at
  `/opt/overnightdesk/deploys.log`.
