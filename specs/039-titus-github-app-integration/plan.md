# Implementation Plan: Titus GitHub App Integration

**Branch**: `038-titus-github-integration` | **Date**: 2026-08-08 | **Spec**: [spec.md](spec.md)

## Summary

Project the owner-approved primary `/agents/github` Phase profile into Titus
using the existing host-to-container secret boundary. Keep the optional
repository-manager profile entirely host-only: retain its metadata and private
key in root-only files, use a host-only read-only verifier for identity,
installation-token, and allowlist checks, and expose no manager credential or
metadata to the general agent container.

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
2. Loader validates the primary six-key profile and, when present, the exact
   six-key repository-manager profile.
3. Loader writes the primary key to its protected runtime file and retains the
   manager key plus metadata in root-only host files.
4. Titus receives only the primary metadata and key through the existing
   runtime env/key mounts; the manager profile remains host-only.
5. Hermes `GitHubAuth` exchanges the primary key for a short-lived installation token.
6. `deploy-aegis.sh verify` uses the primary native adapter and the host-only
   manager verifier to read installation repository metadata and check both
   configured allowlists, without mutation.

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
