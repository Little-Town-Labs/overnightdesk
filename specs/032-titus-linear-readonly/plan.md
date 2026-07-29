# Implementation Plan: Titus Linear Read-Only Delivery

**Branch**: `032-titus-linear-readonly` | **Date**: 2026-07-29 |
**Spec**: [spec.md](spec.md)

**Input**: Feature specification from
`/specs/032-titus-linear-readonly/spec.md`

## Summary

Connect Titus directly to Linear's hosted read-only MCP endpoint using one
revocable, Read-only API key limited to the `TTS` team. Project the credential
from a dedicated Phase path only when explicitly enabled, keep the connection
disabled otherwise, and add a Titus delivery-coordination skill plus
qualification and deployment checks. Linear stays authoritative for technical
delivery; no webhook service, local MCP bridge, database, cache, mutation path,
or GitHub Issues mirror is introduced.

## Technical Context

**Language/Version**: Bash 5, Python 3 from the pinned Hermes
`0.19.0-coder` image, YAML configuration and Markdown operating guidance

**Primary Dependencies**: Hermes Agent remote Streamable HTTP MCP client,
Linear hosted MCP, Phase CLI, Docker/systemd, existing Titus deploy and
qualification scripts

**Storage**: No feature data store; one API key remains in Phase and only the
existing generated runtime environment contains its transient projection

**Testing**: Bash syntax and deterministic qualification checks, Python unit
tests for runtime projection and registry verification, controlled remote MCP
read smoke test, restart and rollback verification

**Target Platform**: `hermes-titus` on the Aegis Ubuntu host

**Project Type**: Tenant runtime configuration and operating contract

**Performance Goals**: Delivery reads complete within the existing 120-second
MCP tool timeout; connection failures do not delay unrelated Titus startup
beyond the bounded MCP connection behavior

**Constraints**: Read-only endpoint and team-scoped Read key; no secret output;
no writes; no event bridge or database; no GitHub credential in Titus; current
state read on demand; no new public ingress, container, daemon, package, or
published port

**Scale/Scope**: One Linear workspace, one initial team, one Titus runtime, and
several concurrent technical projects with human and contractor participants

## Constitution Check

### Pre-design gate

- **Business data boundary**: PASS. Linear remains the owning system and Titus
  receives no canonical copy.
- **Least privilege**: PASS. The provider endpoint, API-key permission, and
  team restriction each constrain the read surface; Phase holds the key.
- **Human authority**: PASS. Titus cannot mutate delivery state and its skill
  explicitly retains priority, scope, assignment, acceptance, and technical
  decisions with people.
- **Named workload**: PASS. The change extends the existing named
  `hermes-titus` runtime without a new service.
- **Current-business scope**: PASS. The feature serves active TTS technical
  delivery and adds no speculative platform.
- **Operational truth**: PASS. Reads are direct and value-safe health/state
  evidence is added to qualification and the platform standard.
- **Recoverability**: PASS. The connection defaults disabled and can be
  disabled or revoked independently before a controlled restart.
- **Workspace quality**: PASS. Operating guidance makes roles, workflow, Done,
  evidence, and contractor participation explicit.
- **Test-first delivery**: PASS. Qualification and projection tests fail before
  runtime source is changed.

### Post-design gate

PASS. The design adds no application service, schema, public route, persistent
copy, or mutation authority. The only new secret is exact-runtime scoped, the
connection is disabled without a complete valid profile, and rollback removes
only Linear access.

## Phase 0: Research

Research is recorded in [research.md](research.md). The key decisions are:

1. Use Linear's hosted `/mcp/readonly` endpoint directly from Hermes.
2. Use a personal API key restricted to `Read` and the `TTS` team for the pilot.
3. Keep the key under `/agents/hermes-titus/linear` in Phase.
4. Use Linear's native GitHub PR/commit integration but do not configure GitHub
   Issues synchronization.
5. Do not create an app user, webhook receiver, database ledger, or refresh
   service in this release.

## Phase 1: Design

The runtime contract is in
[contracts/runtime-and-authority.md](contracts/runtime-and-authority.md), the
small configuration model is in [data-model.md](data-model.md), and the
activation/rollback test path is in [quickstart.md](quickstart.md).

### Runtime flow

```text
Phase /agents/hermes-titus/linear
  LINEAR_ENABLED + team/workspace metadata + Read-only team-scoped key
                         |
                         v
Titus root-only Phase loader validates exact keys and emits runtime state
                         |
                         v
start-with-secrets enables the predeclared `linear` MCP entry only when ready
                         |
                         v
https://mcp.linear.app/mcp/readonly
                         |
                         v
approved TTS delivery reads; zero provider mutations and zero local copy
```

### Runtime state

- `disabled`: path absent or `LINEAR_ENABLED=false`; no Linear tools register.
- `ready`: exact workspace/team metadata and key satisfy validation; read tools
  register.
- Invalid enabled configuration fails before Titus starts.
- Revocation causes read failure without authorizing a fallback or cache.

### Operating model

- Austin: client, portfolio, product, business priority, selected
  implementation.
- Gary: technical business analysis, release-train coordination, assigned
  architecture, Scrum facilitation, assigned implementation.
- Titus: evidence-based backlog/cycle review, blocker/dependency/risk detection,
  reporting, hygiene recommendations, and reconciliation.
- Contractors: assigned implementation, testing, documentation, and accurate
  progress/blocker reporting.
- Done: verified in the target environment.

## Ringer Delivery Flow

After Spec Kit analysis passes:

1. Validate the installed Ringer lane mapping before dispatch.
2. Give Luna only dependency-ready, disjoint source/test/documentation tasks;
   credentials, Phase values, authentication, deployment, and remote mutations
   remain lead-owned.
3. Permit one retry per task and one bounded Luna remediation round.
4. Run Sol as a read-only security, architecture, and final-quality gate over
   the complete diff and qualification evidence.
5. Permit one Sol delta re-review after remediation, then stop or rescope under
   lead control.

## Delivery Order

1. Add failing qualification and Python tests for disabled/ready/invalid states,
   the exact endpoint, credential redaction, tool boundary, and skill contract.
2. Add strict optional Phase loading and runtime state projection.
3. Add the disabled-by-default Linear MCP configuration and safe startup
   activation.
4. Add registry verification and value-safe deployment checks.
5. Add Titus operating skill, tenant runbook, roadmap, and platform-standard
   synchronization.
6. Run repository qualification and Ringer review gates.
7. Publish reviewed source, deploy disabled, and prove no regression.
8. At the human account gate, create the workspace/team/key and native GitHub
   connection, then activate, run read-only canaries, restart, and rehearse
   rollback.

## Project Structure

### Documentation

```text
specs/032-titus-linear-readonly/
├── checklists/requirements.md
├── contracts/runtime-and-authority.md
├── data-model.md
├── plan.md
├── quickstart.md
├── research.md
├── spec.md
└── tasks.md
```

### Source

```text
tenants/hermes-titus/
├── config/
│   ├── config.yaml
│   └── SOUL.md
├── runtime/
│   ├── load-phase-env.sh
│   ├── start-with-secrets.sh
│   └── verify-mcp-registry.py
├── scripts/
│   ├── deploy-aegis.sh
│   └── qualify.sh
├── skills/
│   └── linear-technical-delivery/
│       ├── SKILL.md
│       └── agents/openai.yaml
├── runbooks/
│   └── linear-technical-delivery.md
├── mcp-servers/guarded-agentmail/tests/
│   ├── test_mcp_registry_verifier.py
│   └── test_runtime_projection.py
└── README.md

.specify/roadmap.md
AGENTS.md
```

**Structure Decision**: Extend only the existing Titus tenant source and its
existing qualification/deploy surfaces. Reuse the current runtime projection
and MCP registry verifier; do not add a new package or server.

## Complexity Tracking

No constitution violations or complexity exceptions are required.
