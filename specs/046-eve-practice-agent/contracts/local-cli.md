# Local CLI Contract: Eve Practice Agent

## Scope

This contract covers only commands run from `experiments/eve-practice-agent/`. It defines no public HTTP API, remote channel, or production service.

## Environment

| Variable | Accepted values | Default | Purpose |
| --- | --- | --- | --- |
| `EVE_PRACTICE_CODEX_HOME` | Dedicated absolute path outside the repository and normal Codex home | None | Selects the independent Codex credential/configuration boundary for live commands |
| `EVE_PRACTICE_MODEL` | `chatgpt`, `mock` | `chatgpt` | Selects live subscription use or deterministic offline verification |

Unknown model modes and unsafe credential-home paths fail before child-process execution.

## Commands

| Command | External model request | Contract |
| --- | --- | --- |
| `npm run auth:login` | No | Run Codex's managed ChatGPT login inside the dedicated home |
| `npm run auth:status` | No | Report Codex authentication status without printing credential values |
| `npm run auth:logout` | No | Remove Codex authentication from only the dedicated home |
| `npm run dev` | Yes, after a prompt | Verify the dedicated login, then start eve's local terminal UI using `chatgpt()` and the dedicated home |
| `npm test` | No | Run command-boundary unit tests |
| `npm run eval:mock` | No | Boot the real eve app with `mockModel()` and prove one reply with zero tool calls |
| `npm run check` | No | Run type checking, unit tests, eve discovery/build, and the deterministic eval suite |

## Exit and Error Semantics

- Successful commands return exit code `0`.
- Missing or invalid `EVE_PRACTICE_CODEX_HOME` returns a non-zero exit before Codex or eve starts.
- Missing authentication in an otherwise valid dedicated home returns a non-zero exit with a generic login instruction before eve starts.
- Unknown command names return a non-zero exit and list only supported command names.
- Child-process failures preserve the child's non-zero exit code but do not add environment values or credential contents to output.
- `Ctrl+C` is forwarded to the child process and ends the local session without starting another request.

## Capability Boundary

The compiled agent exposes zero active tools, connections, authored channels, schedules, skills, sandboxes, or subagents. Eve's default tools are explicitly disabled. Model output is terminal text only.
