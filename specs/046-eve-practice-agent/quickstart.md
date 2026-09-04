# Quickstart: Eve Practice Agent

The implementation target is `experiments/eve-practice-agent/`. It requires Node.js 24 or newer and a current Codex CLI.

## Install

```bash
cd experiments/eve-practice-agent
npm ci
```

## Choose an isolated credential directory

Set `EVE_PRACTICE_CODEX_HOME` to an absolute directory outside this repository. Do not point it at the default Codex home or any Titus/Walter credential directory.

```bash
install -d -m 700 /absolute/private/path/eve-practice-codex
export EVE_PRACTICE_CODEX_HOME=/absolute/private/path/eve-practice-codex
npm run auth:login
npm run auth:status
```

The login flow is owned by Codex CLI. The practice application neither reads nor copies its credentials.

## Run the local agent

```bash
npm run dev
```

Enter a harmless prompt in eve's terminal UI. No tools or business integrations are available. Stop with `Ctrl+C`.

## Run provider-free verification

```bash
npm run check
```

The check command explicitly selects the deterministic mock model and makes no model-provider request.

## Troubleshoot

- `Node.js 24 or newer is required`: switch the shell to Node.js 24 and rerun `npm ci`.
- `EVE_PRACTICE_CODEX_HOME` validation fails: export a dedicated absolute directory outside the repository and normal Codex home.
- `Dedicated Codex login is unavailable`: run `npm run auth:login`.
- `chatgpt-sub unavailable`: update Codex CLI, confirm `codex` is on `PATH`, and restart `npm run dev`.
- Model rejected: model availability follows the signed-in ChatGPT account; this scaffold intentionally uses eve's default subscription model.

## Remove local authentication

```bash
npm run auth:logout
```

This signs out only the dedicated practice Codex home. Generated `.eve/`, `.output/`, and `node_modules/` directories are local artifacts and remain outside version control.

## Verification Evidence

Recorded on 2026-09-04 in the isolated feature worktree:

- Node.js `v24.20.0` ran the package quality gate.
- `npm run check` passed TypeScript checking, 24 unit tests, Eve discovery, Eve build, and two deterministic evals with six passing gates.
- `eve info` reported zero diagnostics, tools, skills, subagents, and schedules.
- The deterministic smoke eval returned the exact mock response and asserted `usedNoTools()` plus `noFailedActions()`.
- The whitespace-only eval produced Eve/AI SDK's expected local invalid-prompt failure, left the turn waiting for corrected input, and asserted zero tool use. The selected model was local `mockModel()`; no provider credential was present or used.
- A missing `EVE_PRACTICE_CODEX_HOME` exited `1` before child-process startup and printed only the generic setup requirement. A fresh empty dedicated home also exited `1` before Eve startup with only the login instruction.
- `npm audit --audit-level=high` reported zero vulnerabilities. Node emitted an upstream `url.parse()` deprecation warning during npm execution; no audit advisory was associated with it.
- Secret-pattern scanning found no credential material. Source-surface scanning found no Aegis, Vercel, OpenRouter, Titus, Walter, database, or production integration; the only `deploy` occurrences are the denial instruction and rejected-command test.
- Ignore-rule checks confirmed that `.eve/`, `.output/`, `.codex/`, `.env`, and `node_modules/` content remains untracked.

The live ChatGPT subscription smoke is intentionally not automated and was not run during scaffold creation because it requires the operator's dedicated interactive login.
