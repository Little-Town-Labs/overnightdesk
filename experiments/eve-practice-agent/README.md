# Eve Practice Agent

This is a local-only learning scaffold for the [Eve agent framework](https://github.com/vercel/eve). It is not an OvernightDesk runtime, is not deployed to Aegis or Vercel, and has no access to Titus, Walter, business data, messaging, or production services.

The live configuration uses Eve's [`chatgpt()` subscription adapter](https://github.com/vercel/eve/blob/main/docs/reference/typescript-api.md#chatgpt-subscription-model). It asks the locally installed Codex CLI for ChatGPT authentication, so it does not require Vercel AI Gateway or an OpenAI API key. Eve currently blocks deploying this model configuration because local ChatGPT credentials are not uploaded to deployments.

## Safety boundary

- Every Eve built-in tool is explicitly disabled, including shell, files, web access, questions, task controls, and self-delegation.
- There are no connections, authored channels, schedules, skills, subagents, sandboxes, or databases.
- Live commands require a dedicated `CODEX_HOME`, supplied through `EVE_PRACTICE_CODEX_HOME`, at an absolute path outside this repository.
- `npm run dev` silently checks that dedicated home's Codex login before starting Eve and prints only a setup instruction when it is unavailable.
- The wrapper never reads credential files and does not print credential or environment values.
- The deterministic mode uses Eve's `mockModel()` and makes no provider request.

Eve enables several [built-in tools](https://github.com/vercel/eve/blob/main/docs/concepts/built-in-tools.md) by default. The files under `agent/tools/` are intentional disable sentinels and must not be removed casually.

## Prerequisites

- Node.js 24 or newer
- npm
- A current `codex` CLI on `PATH` for a live run
- Legitimate access to a Codex-capable ChatGPT subscription

The dependency lockfile pins Eve 0.51.1 and AI SDK 7.0.82. This child package is isolated because the root OvernightDesk app has a different Node.js and AI SDK compatibility range.

## Install

From the repository root:

```bash
cd experiments/eve-practice-agent
node --version
npm ci
```

## Create a dedicated login

Choose and create a private directory outside the repository. Do not use the default Codex home or a named runtime's credentials.

```bash
install -d -m 700 /absolute/private/path/eve-practice-codex
export EVE_PRACTICE_CODEX_HOME=/absolute/private/path/eve-practice-codex
npm run auth:login
npm run auth:status
```

The wrapper passes that directory to Codex as `CODEX_HOME`. Authentication, storage, and refresh remain Codex CLI responsibilities; see OpenAI's [authentication](https://learn.chatgpt.com/docs/auth) and [app-server](https://learn.chatgpt.com/docs/app-server) documentation.

## Run a live practice session

```bash
npm run dev
```

Enter a harmless non-empty prompt in Eve's terminal UI. Stop with `Ctrl+C`. Prompts and responses can remain in Eve-managed local development state, so do not use customer data or secrets.

## Run provider-free checks

```bash
npm run check
```

This selects `EVE_PRACTICE_MODEL=mock` only inside the relevant scripts, then runs type checking, unit tests, Eve discovery, a production build, and deterministic evals. A successful `info:mock` run reports zero tools, skills, subagents, and schedules.

Individual commands are also available:

```bash
npm run typecheck
npm test
npm run info:mock
npm run build:mock
npm run eval:mock
```

## Troubleshooting

- **Node version error**: switch the shell to Node.js 24 or newer, reinstall with `npm ci`, and retry.
- **Credential-home error**: create and export an absolute `EVE_PRACTICE_CODEX_HOME` path outside the repository.
- **Dedicated Codex login unavailable**: run `npm run auth:login`, then `npm run auth:status`.
- **`chatgpt-sub unavailable`**: update Codex CLI, confirm `codex` is on `PATH`, and restart the command.
- **Provider or subscription rejection**: correct the account or model availability issue and retry; the agent does not fall back to an API key, Gateway, OpenRouter, Titus, or Walter.
- **Whitespace-only eval logs an invalid-prompt error**: this is expected. The eval verifies that local AI SDK validation parks the turn without a provider request or tool call.

## Sign out

With the same dedicated environment variable still set:

```bash
npm run auth:logout
```

This signs out only the dedicated practice Codex home. The generated `.eve/`, `.output/`, and `node_modules/` directories are ignored local artifacts.
