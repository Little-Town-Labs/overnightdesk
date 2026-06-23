# Research: Trevor Prospecting Data Model

## Decision: Use existing Tenet-0 SQL migration runner

**Rationale**: The target database is `tenet0-postgres`, and this repo already has `tenet-0/db/migrate.sh apply-pending` plus ordered SQL migrations under `tenet-0/db/migrations`. Using that pattern keeps the work consistent with the database that owns the schema.

**Alternatives considered**:

- Drizzle migrations under `drizzle/`: rejected because those target the platform Neon database, not `tenet0-postgres`.
- Manual psql snippets only: rejected because the schema would remain unreproducible.
- New migration framework: rejected as unnecessary for one schema extension.

## Decision: Assert baseline tables before changing schema

**Rationale**: The live `trevor` schema already has `prospects`, `interactions`, and `memory`. This feature extends that baseline. If a target database lacks those tables, the migration should fail clearly instead of creating an incomplete business schema.

**Alternatives considered**:

- Create all baseline tables from scratch: rejected because the current live baseline was manually created and should first be captured separately if full bootstrap becomes necessary.
- Silently skip missing tables: rejected because it would produce false deployment success.

## Decision: Add task/draft lifecycle states as CHECK constraints

**Rationale**: Future workflows need to distinguish open work from completed, discarded, approved, and sent records. CHECK constraints provide enough structure without adding lookup tables before the workflow proves itself.

**Alternatives considered**:

- Free-text state fields: rejected because future queue and approval workflows need reliable filtering.
- Dedicated enum types: rejected because CHECK constraints are easier to change during early iteration.
- Lookup tables: deferred until lifecycle customization is needed.

## Decision: Keep follow-up drafts separate from interactions

**Rationale**: Interactions represent relationship history. Follow-up drafts are pending messages that may be approved, discarded, or manually sent. Keeping them separate preserves the human approval boundary.

**Alternatives considered**:

- Store drafts directly in `trevor.interactions`: rejected because drafts are not completed touchpoints.
- Store drafts only in Agiled notes: rejected because the assistant needs queryable approval state.

## Decision: Defer platform standard documentation update until deployment

**Rationale**: The platform standard should describe what is actually deployed. This feature can prepare the runbook and migration now, but the final standard update belongs with the production deployment record.

**Alternatives considered**:

- Update standard docs immediately: rejected because it could describe schema that is not yet live.
- Never update standard docs: rejected because the standard is the long-term source of truth after deployment.
