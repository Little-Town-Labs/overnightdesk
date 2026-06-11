# WSL-Native OvernightDesk Suite Migration Plan

Last inspected: 2026-06-11

## Decision

Treat OvernightDesk as a multi-repo workspace migration, not a monorepo
conversion. Create a WSL-native workspace at:

```text
~/src/overnightdesk-suite/
```

Clone each repository as a sibling directory. Do not copy ignored local state
from `/mnt/f`, especially `.env`, `.vercel`, `.next`, `node_modules`, `.venv`,
`dist`, coverage files, build outputs, or tool auth folders.

## Current Inventory

| Repo | Source path | Branch | HEAD | Origin | State |
|---|---|---:|---|---|---|
| overnightdesk | `/mnt/f/overnightdesk` | `feat/ob1-mcp` | `1ada549a59fe8f4ec8bd10df25a0c3ff9d5654e7` | `https://github.com/Little-Town-Labs/overnightdesk.git` | untracked docs/context/spikes |
| overnightdesk-ops | `/mnt/f/overnightdesk/overnightdesk-ops` | `main` | `b8ceb27dedf5d71d8533f9dd79ec7ef2eb848daa` | `https://github.com/Little-Town-Labs/overnightdesk-ops.git` | source clean, ahead 1 |
| overnightdesk-platform-standard | `/mnt/f/overnightdesk/overnightdesk-platform-standard` | `main` | `c69302d4589fe7ecbb04c3c2eb97b2e4a36bbbb1` | `https://github.com/Little-Town-Labs/overnightdesk-platform-standard.git` | source clean, ahead 1 |
| overnightdesk-operations-audit | `/mnt/f/overnightdesk/overnightdesk-operations-audit` | `main` | `389caf8bafbe47754a087754371d07b79f00afd1` | `https://github.com/Little-Town-Labs/overnightdesk-operations-audit.git` | source clean, ahead 1 |
| overnightdesk-communicationmodule | `/mnt/f/overnightdesk-communicationmodule` | `main` | `3be4c7ab4466a7423cd9d80a6579cab40d64dc67` | `https://github.com/Little-Town-Labs/overnightdesk-communicationmodule.git` | clean |
| overnightdesk-engine | `/mnt/f/overnightdesk-engine` | `11-orchestrator-fr-instrumentation` | `1fe10fc68466fb20a60c6ae942abfd8aab3a8095` | `https://github.com/Little-Town-Labs/overnightdesk-engine` | source clean, generated binaries untracked |
| overnightdesk-flightrecorder | `/mnt/f/overnightdesk-flightrecorder` | `12-ops-integration` | `607677ba524533ad27d95a4b13baacb59e71df32` | `https://github.com/Little-Town-Labs/overnightdesk-flightrecorder.git` | clean |
| overnightdesk-job-observatory | `/mnt/f/overnightdesk-job-observatory` | `master` | `a60a736529096948467437cec636c1b540f89c30` | none configured | clean, local-only unless remote is added |
| overnightdesk-newsletter-curator | `/mnt/f/overnightdesk-newsletter-curator` | `master` | `016794bc1d518366ab24f49ec5a4039da83cce46` | `https://github.com/Little-Town-Labs/newsletter-curator.git` | clean |
| overnightdesk-SecurityCouncil | `/mnt/f/overnightdesk-SecurityCouncil` | `main` | `5284d94b4cc2fe7ddef6b163b062d545c566b0fd` | `https://github.com/Little-Town-Labs/overnightdesk-SecurityCouncil.git` | clean |
| overnightdesk-securityteam | `/mnt/f/overnightdesk-securityteam` | `main` | `dee7d8989df9ee79e3d73c8dbe700cd43335b855` | `https://github.com/Little-Town-Labs/overnightdesk-securityteam` | clean |

## Dirty Work Classification

| Repo | Change set | Recommended disposition |
|---|---|---|
| overnightdesk | untracked `docs/`, `overnightdesk-ops-context.md`, `tenet-0/spikes/` | Review as parent-context material. Commit only if still useful; otherwise archive outside Git or leave behind. |
| overnightdesk-ops | Grykk-47 research pipeline: `src/research/`, `docs/grykk-47-research.md`, `README.md`, `mongodb` dependency, research npm scripts, runtime OpenRouter env lookup | Committed as `b8ceb27`. Leave ignored `dist/` and `node_modules/` behind. |
| overnightdesk-platform-standard | `WHAT/secrets.yaml`, `WHAT/services.yaml`, new `WHAT/background-research-pipelines.yaml` | Committed as `c69302d`. No ignored state found. |
| overnightdesk-operations-audit | database-scope fixes and tests across audit engine plus `standards/network-requirements.yaml` | Committed as `389caf8`. Leave ignored `coverage.out` behind. |
| overnightdesk-engine | Hermes `/sessions` route in `internal/hermes/handlers.go`, source helper in `internal/hermes/sessions.go`, untracked built binaries | Source committed as `1fe10fc`. Do not commit or migrate `hermes-provisioner` or `hermes-provisioner-arm64`; rebuild them from source if needed. |

## Resolved Local Commits

| Repo | Commit | Validation |
|---|---|---|
| overnightdesk-ops | `b8ceb27` Add Grykk-47 research pipeline | `npm test -- src/research`; `npm run build` |
| overnightdesk-platform-standard | `c69302d` Document Grykk-47 research pipeline standard | `git diff --check`; YAML parse check for changed files |
| overnightdesk-operations-audit | `389caf8` Scope database audit to target database | `go test ./...` passed outside sandbox after sandbox blocked local `httptest` listeners |
| overnightdesk-engine | `1fe10fc` Add Hermes session listing support | `go test ./internal/hermes`; `go test ./...` passed outside sandbox after sandbox blocked local `httptest` listeners |

## Migration Phases

1. Freeze the `/mnt/f` workspaces.
   - Do not make new feature edits in `/mnt/f` while resolving dirty work.
   - Keep the old checkouts untouched until WSL-native clones are verified.

2. Resolve dirty work repo by repo.
   - `overnightdesk-ops`: run the relevant build/tests, then commit the Grykk-47 research pipeline.
   - `overnightdesk-platform-standard`: commit the matching standards update.
   - `overnightdesk-operations-audit`: run Go tests, then commit the audit database-scope changes.
   - `overnightdesk-engine`: decide whether to keep the sessions endpoint; commit source only or stash it. Remove or leave behind generated binaries.
   - `overnightdesk`: decide whether the parent docs/context/spikes belong in Git, an archive, or are left behind.

3. Fetch and verify remotes after each repo is clean.
   - Run `git fetch --prune origin` for repos with `origin`.
   - Confirm local branch relationship to the active upstream before cloning.
   - Add or document the missing remote for `overnightdesk-job-observatory`.

4. Create the WSL-native suite.
   - Create `~/src/overnightdesk-suite/`.
   - Clone from GitHub remotes when available.
   - For `overnightdesk-job-observatory`, either configure the real GitHub remote first or use a local `git clone --no-local` and document it as local-only.

5. Verify each clone.
   - `git remote -v` points to the intended remote.
   - `git status --short --branch` is clean.
   - `git rev-parse HEAD` matches the resolved source commit.
   - `git ls-files | wc -l` matches the source tracked-file count.
   - Project guidance files are present where expected.

6. Recreate dependencies in WSL-native storage.
   - Use lockfile-native installs such as `npm ci` or `pnpm install --frozen-lockfile`.
   - Recreate Python virtualenvs from project instructions.
   - Do not copy dependency folders or build outputs from `/mnt/f`.

7. Run light validation.
   - Use the cheapest meaningful repo-specific checks.
   - Record skipped checks and why.
   - Only after validation should new Codex sessions use `~/src/overnightdesk-suite/` as the active workspace.

## Migration Blockers

- Unclassified parent context/spike files in `/mnt/f/overnightdesk`.
- Missing `origin` remote for `overnightdesk-job-observatory`.
- Generated binaries in `overnightdesk-engine` that should not be copied into the new workspace.
- Local commits in `overnightdesk-ops`, `overnightdesk-platform-standard`,
  `overnightdesk-operations-audit`, and `overnightdesk-engine` need to be
  pushed or intentionally kept local before cloning from GitHub.
