## Required Context

Before substantial work, read these files:

- `README.md`
- `.specify/memory/constitution.md`
- `docs/agent-skill-strategy.md`
- The active feature under `.specify/feature.json`, if present

## Workflow

Use Spec Kit as the lifecycle backbone:

1. `speckit-specify` for new product or feature requirements.
2. `speckit-clarify` when scope, security, data boundaries, integrations, or
   user workflows are ambiguous.
3. `speckit-plan` before implementation.
4. `speckit-tasks` before coding.
5. `speckit-analyze` before implementation when artifacts may conflict.
6. `speckit-implement` for task execution.

The supporting skills from `addyosmani/agent-skills` are available under
`.agents/skills/`. Use them as quality gates for the relevant Spec Kit phase,
not as a replacement for Spec Kit artifacts.

## Skill Routing

- Use `security-and-hardening` for customer data, tenant data, prospect data,
  payments, secrets, external integrations, database grants, or agent actions.
- Use `api-and-interface-design` for MCP tools, database functions, public
  APIs, webhooks, tenant boundaries, and Hermes/OpenAI-compatible interfaces.
- Use `observability-and-instrumentation` for workflows operators must trust in
  production, including cron jobs, digest jobs, migrations, and deployment
  runbooks.
- Use `documentation-and-adrs` for schema, integration, agent authority,
  approval, hosting, or architecture decisions.
- Use `frontend-ui-engineering` for user-facing web surfaces, including the
  deferred `mitchelbrown.com` landing page.
- Use `planning-and-task-breakdown` and `incremental-implementation` to keep
  work in vertical, independently verifiable slices.
- Use `test-driven-development` when behavior, data rules, or integrations are
  being implemented or changed.
- Use `code-review-and-quality` before considering a feature ready.

## Implementation Bias

- Prefer durable database constraints, grants, migrations, verification
  queries, and runbooks over prompt-only enforcement.
- Keep tenant-specific Hermes workflow source under `tenants/<tenant-id>/`.
  `tenants/hermes-mitchel/` owns Mitchel/Trevor MCP servers, skills, and
  tenant runbooks.
- Keep Tenet-0 infrastructure under `tenet-0/`. Tenet-0 database migrations may
  still define tenant schemas such as `trevor` when the live data is hosted by
  `tenet0-postgres`.
- Keep tenant business data in its owning system: Postgres and Agiled for
  Mitchel prospecting, not markdown exports or hidden agent memory.
- High-impact agent actions affecting outreach, prospects, payments, secrets,
  deployment, or production state require explicit human approval.
- Keep docs, specs, plans, and tasks synchronized with implementation changes.

## Adaptive Delivery

- Classify work by greenfield/brownfield context, micro/feature/system scale,
  and routine/sensitive/production risk. Keep routine micro-fixes and small
  configuration corrections lightweight; use Spec Kit for substantial work.
- Sol owns planning, architecture, orchestration, integration, auth/identity,
  business-action, sensitive or production mutation, and the final quality
  gate. Luna is the default lane for bounded routine implementation, tests,
  docs, diagnostics, reading, and review.
- Production, Aegis, identity, secrets, payments, outreach, customer/prospect
  data, agent authority, runtime lifecycle, and deployment work permits
  read-only Ringer analysis only.
- Brownfield feature/system planning uses the canonical codebase graph and
  targeted source verification. Do not treat transient worktree indexes as the
  canonical repository.
- After `analyze`, use the installed `ringer-delivery` extension. Workers receive
  dependency-ready task IDs, disjoint owned paths, non-goals, and executable
  checks; they never commit, push, edit `.git`, widen scope, or update canonical
  task status.
- Allow at most one Luna remediation and one Sol delta review.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/038-hermes-local-update-pipeline/plan.md`
<!-- SPECKIT END -->
