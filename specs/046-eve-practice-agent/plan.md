# Implementation Plan: Eve Practice Agent

**Branch**: `046-eve-practice-agent` | **Date**: 2026-09-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/046-eve-practice-agent/spec.md`

## Summary

Add one explicitly non-production eve application under `experiments/eve-practice-agent/`. Its normal model is eve's current `chatgpt()` adapter, which delegates subscription authentication to a dedicated Codex CLI home. A deterministic `mockModel()` mode drives offline evals through the same compiled agent surface. The application defines no tools, connections, channels, schedules, subagents, database, or deployment configuration.

## Technical Context

**Language/Version**: TypeScript 7.0.2 on Node.js 24+

**Primary Dependencies**: eve 0.51.1, AI SDK 7.0.82, Codex CLI 0.153.2 or newer compatible release

**Storage**: Framework-managed local development artifacts only; dedicated Codex credentials remain outside the repository; no application or business database

**Testing**: Vitest 4.1.10 unit tests, eve deterministic evals with `mockModel()`, TypeScript checking, `eve info`, and `eve build`

**Target Platform**: Local Linux development workstation with Node.js 24+ and Codex CLI on `PATH`

**Project Type**: Isolated local CLI agent experiment inside a brownfield monorepository

**Performance Goals**: First successful response within 15 minutes of starting setup, excluding login and package download; offline checks complete without provider requests

**Constraints**: No production deployment; no Vercel Gateway requirement; no model API key; no shared Titus/Walter Codex home; no tools or external business integrations; no secrets or local generated state committed; explicit mock mode for offline checks

**Scale/Scope**: One operator, one root agent, one local terminal session, one live subscription-backed model path, and one deterministic test path

## Constitution Check

*GATE: Pass before Phase 0 research and re-check after Phase 1 design.*

- **Business and use-case boundaries**: PASS. The experiment has its own directory and credential home and does not alter Titus, Walter, Mitchel/Trevor, or business records.
- **Least privilege**: PASS. No tools, connections, database, outbound channels, public ingress, production secrets, or deployment configuration are authored.
- **Agents assist; people decide**: PASS. The agent only returns text and has no action authority.
- **Named workloads over dynamic hosting**: PASS. This is explicitly local and is not registered or deployed as an Aegis workload.
- **Operate for the current business**: PASS. The bounded experiment answers the owner's current framework-learning question without adding production burden.
- **Operational truth**: PASS. The root README, feature artifacts, local README, and ADR record its experimental and non-production status.
- **Recoverability**: PASS. Removing the isolated directory reverses source changes; `codex logout` against the dedicated home removes its local authentication.
- **Workspace quality**: PASS. Existing authenticated workspace code and runtime bindings are untouched.
- **Technology exception**: PASS. eve is a TypeScript framework and requires Node.js 24; this upstream integration constraint justifies not using the constitution's default Go preference.

## Project Structure

### Documentation (this feature)

```text
specs/046-eve-practice-agent/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── local-cli.md
└── tasks.md
```

### Source Code (repository root)

```text
experiments/eve-practice-agent/
├── agent/
│   ├── agent.ts
│   ├── instructions.md
│   ├── lib/
│   │   └── model.ts
│   └── tools/                       Explicit Eve default-tool disable sentinels
├── evals/
│   ├── evals.config.ts
│   ├── empty-input.eval.ts
│   └── smoke.eval.ts
├── scripts/
│   ├── practice-command.mjs
│   ├── practice-command.test.ts
│   ├── verify-surface.mjs
│   └── verify-surface.test.ts
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json

docs/decisions/
└── 006-isolate-eve-practice-agent.md
```

**Structure Decision**: Use a top-level `experiments/` boundary rather than `tenants/` or `infra/` so the directory cannot be mistaken for a deployable named runtime. Keep the eve-authored `agent/` and `evals/` layouts intact, and put credential-home enforcement in a small allowlisted command wrapper.

## Post-design Constitution Check

PASS. Design artifacts retain the local-only, credential-isolated, text-only boundary. The only external call is the explicitly selected ChatGPT subscription model path. Mock-mode verification prevents routine tests from consuming subscription allowance, and no production activation task exists.
