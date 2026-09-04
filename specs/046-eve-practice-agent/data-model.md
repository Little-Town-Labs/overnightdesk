# Data Model: Eve Practice Agent

This feature introduces no business-domain entity, database table, migration, or durable production record.

## Configuration State

### Practice Model Mode

- **Values**: `chatgpt` (default) or `mock` (explicit offline verification only)
- **Source**: `EVE_PRACTICE_MODEL`
- **Validation**: unset resolves to `chatgpt`; any value other than `chatgpt` or `mock` fails before agent definition is completed
- **Security meaning**: `mock` makes no provider request; `chatgpt` delegates to Codex CLI authentication

### Dedicated Codex Home

- **Value**: an absolute filesystem path supplied as `EVE_PRACTICE_CODEX_HOME`
- **Required for**: login, authentication status, logout, and live development mode
- **Not required for**: type checking, unit tests, build discovery, or mock evals
- **Validation**: must be absolute, must resolve outside the application and repository trees, must not be a filesystem root, and must not overlap the inherited or normal Codex home; existing symlink ancestors are resolved before comparison
- **Custody**: created and managed by Codex CLI; never read, copied, parsed, or logged by the practice application

## Local Generated State

- eve may create `.eve/` and `.output/` under the experiment directory for local compilation, sessions, traces, and host output.
- npm creates `node_modules/` and may create coverage or log artifacts.
- All generated state is excluded from Git and is not a business source of truth.

## State Transitions

```text
unconfigured
  -> dedicated home selected
  -> Codex login pending
  -> authenticated
  -> live local session

authenticated
  -> token refresh (Codex-managed)
  -> reauthentication required
  -> authenticated

authenticated
  -> explicit logout
  -> dedicated home selected
```

Mock verification is a separate path and never enters an authentication state.
