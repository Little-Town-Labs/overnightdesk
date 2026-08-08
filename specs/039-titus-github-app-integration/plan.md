# Implementation Plan: Titus GitHub App Integration

**Branch**: `038-titus-github-integration` | **Date**: 2026-08-08 | **Spec**: [spec.md](spec.md)

## Summary

Project the owner-approved `/agents/github` Phase profile into Titus using the
existing host-to-container secret boundary. Keep non-secret App metadata in the
runtime environment, write the private key to a dedicated mode-0440 host file,
mount it read-only, validate the startup state, and add a read-only GitHub App
provider/installation coverage gate to the Titus verifier.

## Technical Context

**Language/Version**: POSIX shell, jq, Python 3.11+ in the Hermes image.

**Primary Dependencies**: Phase CLI, Docker, pinned Hermes native
`GitHubAuth`, urllib, existing Titus qualification harness.

**Storage**: Ephemeral host runtime files under `/run/hermes-titus`; no key in
the Titus data volume.

**Testing**: Bash syntax checks, focused pytest projection/contract tests,
existing Titus qualification checks, and read-only provider verification.

**Target Platform**: Aegis Linux host and the `hermes-titus` container.

**Project Type**: Brownfield production tenant runtime integration.

**Constraints**: Titus only; no Walter or Control Tower mutation; no secret
values in output; GitHub verification is read-only; deployment is separately
authorized.

## Constitution Check

- Business/use-case boundary: PASS — only `hermes-titus` consumes `/agents/github`.
- Least privilege: PASS — the key is a read-only mount and no PAT or Docker
  socket is introduced.
- Agents assist/accountable people decide: PASS — credentials do not alter
  Control Tower authority and GitHub mutation remains out of scope.
- Operational truth: PASS — verifier checks actual provider authentication and
  installation coverage.
- Recoverability: PASS — absent/invalid optional profiles disable GitHub only;
  the existing Titus service restart/rollback path remains authoritative.

## Architecture and Data Flow

1. Host loader exports `/agents/github` with the Phase CLI.
2. Loader validates the exact six-key shape and non-secret values.
3. Loader writes only the private key to `/run/hermes-titus/github-app-private-key`
   with root ownership and group-readable mode for UID/GID 10000.
4. Titus receives the metadata through the existing runtime env mount and the
   key through a second read-only mount.
5. Hermes `GitHubAuth` exchanges the key for a short-lived installation token.
6. `deploy-aegis.sh verify` reads installation repository metadata and checks
   the configured allowlist, without mutation.

## Source Structure

```text
tenants/hermes-titus/
├── runtime/load-phase-env.sh
├── runtime/start-with-secrets.sh
├── runtime/run-container.sh
├── scripts/deploy-aegis.sh
├── scripts/qualify.sh
├── tests/test_github_runtime_contract.py
├── mcp-servers/guarded-agentmail/tests/test_runtime_projection.py
└── runbooks/github-app-integration.md
```

## Verification Strategy

- Run the focused Titus projection and runtime contract tests.
- Run shell syntax and `git diff --check`.
- Run the existing tenant qualification where the repository's Python/MCP test
  dependencies are available.
- After an approved deployment, run `deploy-aegis.sh verify` and confirm only
  redacted provider/organization/count evidence is emitted.
