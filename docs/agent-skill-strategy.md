# Agent Skill Strategy

OvernightDesk uses Spec Kit as the governing workflow for substantial product,
platform, tenant, and deployment work. The project-local `speckit-*` skills
remain the lifecycle backbone for specification, planning, tasks, analysis, and
implementation.

The additional skills from `addyosmani/agent-skills` are installed under
`.agents/skills/` as supporting quality gates. Use them to strengthen a Spec Kit
phase, not to bypass the constitution, PRD, spec, plan, task list, deployment
runbook, or production approval path.

Source reviewed: <https://github.com/addyosmani/agent-skills>

## Spec Kit Mapping

| Spec Kit phase | Supporting skills |
| --- | --- |
| Specify / PRD | `idea-refine`, `source-driven-development` |
| Clarify | `idea-refine`, `security-and-hardening`, `api-and-interface-design` |
| Plan | `planning-and-task-breakdown`, `api-and-interface-design`, `documentation-and-adrs` |
| Tasks | `planning-and-task-breakdown`, `test-driven-development`, `incremental-implementation` |
| Implement | `incremental-implementation`, `test-driven-development`, `debugging-and-error-recovery` |
| Analyze / Review | `code-review-and-quality`, `security-and-hardening`, `observability-and-instrumentation` |
| Ship readiness | `observability-and-instrumentation`, `documentation-and-adrs`, `security-and-hardening` |
| Frontend / landing pages | `frontend-ui-engineering`, `source-driven-development`, `code-review-and-quality` |

## Installed Supporting Skills

- `api-and-interface-design`
- `code-review-and-quality`
- `debugging-and-error-recovery`
- `documentation-and-adrs`
- `frontend-ui-engineering`
- `idea-refine`
- `incremental-implementation`
- `observability-and-instrumentation`
- `planning-and-task-breakdown`
- `security-and-hardening`
- `source-driven-development`
- `test-driven-development`

## Operating Rules

- Use `speckit-specify`, `speckit-clarify`, `speckit-plan`,
  `speckit-tasks`, `speckit-analyze`, and `speckit-implement` as the
  lifecycle backbone for substantial work.
- Apply `security-and-hardening` whenever a feature touches customer data,
  tenant data, prospect data, payments, secrets, external integrations,
  database grants, or agent actions.
- Apply `api-and-interface-design` for MCP tools, database functions,
  public APIs, webhooks, tenant boundaries, and Hermes/OpenAI-compatible
  interfaces.
- Apply `observability-and-instrumentation` whenever a workflow must be trusted
  in production, including cron jobs, prospecting digests, ingestion,
  follow-up queues, deployment scripts, and rollback paths.
- Apply `documentation-and-adrs` for durable decisions such as schema shape,
  integration boundaries, agent authority, approval paths, hosting choices, and
  production runbooks.
- Apply `frontend-ui-engineering` before building user-facing web surfaces,
  including the deferred `mitchelbrown.com` landing page.
- Apply `test-driven-development` and `incremental-implementation` to keep work
  in independently verifiable slices.
- Apply `code-review-and-quality` before considering any feature ready to
  commit, merge, deploy, or hand off.

## Mitchel Prospecting Guidance

For `hermes-mitchel` and Trevor prospecting work:

- Treat Postgres and Agiled as the durable sources of business truth; agent
  memory and prompts are not canonical sales records.
- Any workflow that can affect prospects, outreach, approvals, or CRM state
  should use `security-and-hardening`, `api-and-interface-design`, and
  `observability-and-instrumentation` as quality gates.
- Follow-up messages stay draft-first unless a spec explicitly adds approval,
  audit, opt-out, and send verification.
- The `mitchelbrown.com` site is later acquisition work; when it starts, use
  `frontend-ui-engineering` and keep lead intake tied back to Agiled and
  `trevor.prospects`.
