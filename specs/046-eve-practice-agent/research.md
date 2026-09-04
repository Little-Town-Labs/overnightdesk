# Research: Eve Practice Agent

## Decision 1: Use eve 0.51.1 with its stable `chatgpt()` helper

**Decision**: Pin `eve` to 0.51.1 and configure the root agent with `chatgpt()` from `eve/models/openai`.

**Rationale**: The current published source identifies eve 0.51.1 and requires Node.js 24 or newer. The current TypeScript API documents `chatgpt()` as the subscription-backed helper, with `experimental_chatgpt()` retained only as a deprecated alias. Using the current public helper avoids starting new work on a deprecated name.

**Alternatives considered**:

- `experimental_chatgpt()`: rejected because it is now a deprecated alias.
- A string model identifier: rejected because it routes through Vercel AI Gateway and would not exercise the Codex subscription path.
- `@ai-sdk/openai` with an API key: rejected because API-key usage is billed separately and does not test the requested subscription path.

**Sources**:

- https://raw.githubusercontent.com/vercel/eve/main/packages/eve/package.json
- https://raw.githubusercontent.com/vercel/eve/main/docs/reference/typescript-api.md

## Decision 2: Delegate authentication to Codex CLI in a dedicated home

**Decision**: Require `EVE_PRACTICE_CODEX_HOME` to name an absolute directory outside the repository. The local command wrapper passes that path to Codex as `CODEX_HOME` for login, status, logout, and eve development runs.

**Rationale**: eve documents that `chatgpt()` asks `codex app-server` for a usable token and that Codex, not eve, owns token refresh and persistence. OpenAI documents ChatGPT sign-in as the subscription path, `codex login` as the local browser flow, and local credential caching in the Codex home or credential store. A separate home prevents accidental reuse of Walter, Titus, or the operator's normal Codex configuration.

**Alternatives considered**:

- Reuse the default Codex home: rejected because it does not establish an independent practice identity/configuration boundary.
- Copy `auth.json`: rejected because credential material must not be copied through the repository or scripts.
- Store a token in `.env`: rejected because refreshable ChatGPT credentials are managed by Codex and must not be treated as an application secret string.

**Sources**:

- https://raw.githubusercontent.com/vercel/eve/main/docs/reference/typescript-api.md
- https://learn.chatgpt.com/docs/auth
- https://learn.chatgpt.com/docs/app-server
- https://github.com/openai/codex/blob/main/codex-rs/config/src/types.rs

## Decision 3: Keep all routine verification provider-free

**Decision**: Select `mockModel()` only when `EVE_PRACTICE_MODEL=mock`, and run an eve eval that verifies a successful reply and zero tool use. Unit tests cover command allowlisting and credential-home validation.

**Rationale**: eve's official eval guidance recommends `mockModel()` for deterministic runtime coverage without contacting a provider. The eval still drives eve's real HTTP/session surface, proving that the authored agent compiles, boots, receives a request, and replies. The live `chatgpt()` path remains an explicit manual smoke test.

**Alternatives considered**:

- Run every test against the subscription: rejected because it consumes allowance and makes checks depend on account and network state.
- Test only TypeScript types: rejected because types do not prove eve discovery, boot, or request handling.
- Add a second fixture application: rejected because an explicit model-mode branch in this single isolated app is smaller and follows eve's own deterministic fixture pattern.

**Sources**:

- https://github.com/vercel/eve/blob/main/docs/evals/overview.mdx
- https://github.com/vercel/eve/blob/main/docs/evals/assertions.mdx
- https://github.com/vercel/eve/blob/main/docs/evals/cases.mdx

## Decision 4: Define no capabilities beyond text conversation

**Decision**: Author the root config and instructions, and add a `disableTool()` sentinel for every Eve default tool. Do not create any connection, channel, schedule, sandbox, skill, subagent, or executable tool.

**Rationale**: Eve supplies shell, file, web, task, question, and self-delegation capabilities by default. Its official built-in-tool contract requires same-named `agent/tools/*.ts` files exporting `disableTool()` to remove those capabilities. Explicit disable sentinels are therefore the durable least-privilege boundary; prompt wording alone is not. `eve info` reports an empty tool list, and the deterministic eval additionally asserts `usedNoTools()`.

**Alternatives considered**:

- Add a harmless demonstration tool: rejected because tool learning is not required for the first experiment and would weaken the no-action acceptance boundary.
- Add a web UI: rejected because the terminal UI is enough to validate the framework and keeps auth/local-state handling simpler.

**Sources**:

- https://github.com/vercel/eve/blob/main/docs/reference/project-layout.md
- https://github.com/vercel/eve/blob/main/docs/reference/typescript-api.md
- https://github.com/vercel/eve/blob/main/docs/concepts/built-in-tools.md

## Decision 5: Keep the experiment outside active runtime directories

**Decision**: Place the app at `experiments/eve-practice-agent/` and record the decision in ADR 006.

**Rationale**: `tenants/` contains deploy source for named Hermes runtimes and `infra/` contains active operational source. A distinct experiment boundary makes the non-production status obvious and prevents the practice agent from inheriting a named runtime's deployment or data semantics.

**Alternatives considered**:

- `tenants/eve-practice-agent`: rejected because this is not a tenant or production runtime.
- `infra/eve-practice-agent`: rejected because the experiment is not approved infrastructure.
- Root application integration: rejected because the Next.js app runs on Node.js 20.9+ and AI SDK 6, while current eve requires Node.js 24+ and AI SDK 7.

**Sources**:

- `README.md`
- `.specify/memory/constitution.md`
- `package.json`
