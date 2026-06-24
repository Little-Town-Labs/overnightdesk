# Research: Pre-Call Brief

## Decision 1: Extend `trevor-db`

**Decision**: Implement the brief as another purpose-built MCP tool in the existing repo-controlled `trevor-db` package.

**Rationale**: The brief reads the same Trevor schema and task records as the daily call queue. Reusing the package keeps deployment, dependency, and validation shape consistent.

**Alternatives considered**:

- New MCP server: rejected because it would duplicate database wiring and deployment steps.
- Prompt-only skill: rejected because prospect lookup, DNC warnings, and ambiguity handling need deterministic data access.

## Decision 2: Read-Only First Slice

**Decision**: The pre-call brief reads prospects, call tasks, and recent interactions only.

**Rationale**: Post-call writes, Agiled note creation, and follow-up drafts are owned by later roadmap features. Keeping this slice read-only protects production while still creating immediate call value.

**Alternatives considered**:

- Create interaction when a brief is viewed: rejected because viewing a brief is not a completed touch.
- Draft follow-up fallback as a stored record: rejected because Feature 5 owns draft storage and approval.

## Decision 3: Honest Agiled Boundary

**Decision**: Include Agiled link presence and missing-context warnings, but do not require live Agiled reads in the first deployable brief.

**Rationale**: Agiled context can be incomplete or unavailable. The brief must not invent CRM facts or fail when the Postgres data is sufficient for a call.

**Alternatives considered**:

- Require Agiled lookups for every brief: rejected as brittle for missing links.
- Ignore Agiled fields entirely: rejected because missing CRM context needs to be visible to Mitchel.

## Decision 4: Bounded Query Ambiguity

**Decision**: Query text returns either one selected brief or a bounded disambiguation list.

**Rationale**: Prospect names and companies may collide. Silent selection would create a real sales risk.

**Alternatives considered**:

- Always pick the first match: rejected because it can brief the wrong buyer.
- Require prospect IDs only: rejected because Mitchel needs natural lookup during calls.
