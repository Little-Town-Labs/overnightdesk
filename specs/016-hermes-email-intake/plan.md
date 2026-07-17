# Implementation Plan: Routed Hermes Email Intake

**Branch**: `016-hermes-email-intake` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)

## Summary

Evolve the existing hardened Go email poller instead of adding another service
family. Each configured instance polls one AgentMail inbox, inserts extracted
email text into SecurityTeam's existing `content_staging` dirty table, and later
claims only approved `ingested_messages` joined to that exact inbox and Hermes
target. The worker submits cleaned content to the upstream authenticated Hermes
Runs API, follows the run to a terminal or approval-waiting state, and sends one
idempotent reply in the source AgentMail thread.

The same image and code run for Titus, Hermes Agent, and Hermes Mitchel. Runtime
configuration—not email content—binds each instance to one inbox, one agent, and
one exact sender allowlist. The existing direct OpenRouter and custom email
approval path are removed after the replacement path is qualified.

## Technical Context

**Language/Version**: Go 1.24; static `CGO_ENABLED=0` Linux binary

**Primary Dependencies**: Existing Go standard-library AgentMail HTTP client;
`github.com/jackc/pgx/v5` v5.7.6; upstream Hermes Agent 0.18 authenticated Runs
API; Phase CLI on the host

**Storage**: Existing PostgreSQL `content_staging` and `ingested_messages`
tables plus the existing per-instance atomic JSON recovery/health volume.
SecurityTeam preserves an instruction only when the producer assertion matches
one exact protected AgentMail route; all other external content keeps the
existing untrusted wrapper, redaction, and injection-approval behavior.

**Testing**: `go test ./...`, `go test -race ./...`, `go vet ./...`, contract
tests with local HTTP servers, store fakes, SQL contract qualification, shell
qualification, container smoke tests, and controlled production database canaries

**Target Platform**: Three hardened Docker instances on `aegis-prod`, managed by
one systemd template and attached only to `overnightdesk_overnightdesk`

**Project Type**: Existing single Go background-worker command, configured per
inbox/agent instance

**Performance Goals**: Bound each intake cycle to 20 messages; claim at most 10
clean rows per instance; reach Hermes within two five-minute SecurityTeam poll
intervals; external HTTP requests use bounded timeouts; database pool remains
small and bounded

**Constraints**: Dirty content never enters Hermes; no published ports;
read-only root filesystem; non-root UID; capabilities dropped; disabled by
default; no message body, sender, subject, token, or credential in logs; exact
route match; parameterized SQL; at-most-once reply reconciliation

**Scale/Scope**: Three low-volume AgentMail inboxes and three isolated Hermes
runtimes; no attachments in this release

## Constitution Check

- **Spec Kit lifecycle**: PASS. Specification, clarification, plan, contracts,
  tasks, analysis, TDD, and review are required before rollout.
- **Existing architecture**: PASS. The plan restores the already-defined
  SecurityTeam dirty-to-clean boundary rather than creating a competing path.
- **Hermes standard engine**: PASS. The Go worker is transport orchestration;
  NousResearch Hermes remains the only reasoning and tool engine.
- **Data boundary**: PASS. Raw email is stored in the existing SecurityTeam data
  plane, not the frontend application database, and is never passed to Hermes.
- **Secrets**: PASS. AgentMail, PostgreSQL, and Hermes credentials remain in
  Phase and are mounted as a root-materialized read-only runtime file.
- **Authorization**: PASS. Exact addresses and inbox/agent bindings are runtime
  invariants; email-controlled values cannot select an agent or grant approval.
- **Approval authority**: PASS. The worker observes approval-waiting runs but
  cannot approve them; Matrix or Telegram and Control Tower remain authoritative.
- **Test-first**: PASS. Every behavior task begins with a confirmed failing test
  and the final qualification requires race, vet, build, and integration checks.
- **Observability**: PASS. Structured metadata-only events, correlation hashes,
  stage outcomes, claim age, and health freshness answer production questions.
- **Complexity**: PASS. Existing transport/policy/worker boundaries are reused;
  database and Hermes contracts receive focused packages rather than branches
  scattered through the current worker.

## Project Structure

### Documentation

```text
specs/016-hermes-email-intake/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── database.md
│   ├── hermes-runs.md
│   └── runtime-config.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
tenants/hermes-titus/email-poller/
├── cmd/titus-email-poller/main.go
├── internal/
│   ├── config/
│   ├── policy/
│   ├── state/
│   ├── store/                 # PostgreSQL dirty/clean contract
│   ├── transport/
│   │   ├── agentmail.go
│   │   └── hermes.go          # upstream Runs API client
│   └── worker/
├── runtime/                   # instance-aware container and systemd template
├── scripts/                   # qualification and Aegis rollout
├── Dockerfile
├── go.mod
└── go.sum
```

**Structure Decision**: Keep the implementation at its current source location
for this change to avoid mixing a repo/source relocation with behavioral work.
Make the binary route-configured and shared across three runtime instances. A
later source move, if desired, is a separate refactor; runtime behavior and
contracts must not depend on the Titus directory name.

## Delivery Increments

1. **Dirty landing**: add the route-configured PostgreSQL producer while leaving
   Hermes consumption disabled; prove deduplication and no direct model call.
2. **Clean claiming**: atomically claim only approved clean rows for the exact
   configured inbox/agent and prove cross-route rows remain untouched.
3. **Hermes completion**: replace direct OpenRouter with the upstream Runs API,
   stable session keys, terminal polling, approval-wait handling, and one reply.
4. **Three-instance runtime**: install one image through a systemd template,
   enable API server access privately on each Hermes runtime, and canary Titus
   before activating Hermes Agent and Hermes Mitchel.
5. **Retirement and closeout**: remove obsolete direct-model/approval code,
   update standards and runbooks, pass the five-axis quality gate, and preserve
   rollback state.

## Rollout and Rollback

1. Create protected configuration for all three routes with intake disabled.
2. Enable authenticated Hermes API servers on the private Docker network and
   verify `/health` plus authenticated `/v1/capabilities`; publish no host port.
3. Deploy all three Go instances disabled and verify hardening, database
   connectivity, exact config validation, and zero provider mutations.
4. Enable dirty landing for Titus only; verify SecurityTeam moves a canary row
   into `ingested_messages` and no raw content reaches Hermes.
5. Enable Titus clean consumption and run a harmless Control Tower read from
   Gary, followed by Austin; verify one terminal threaded reply each.
6. Enable Hermes Agent for `netgleb@gmail.com`, then Hermes Mitchel for
   `mitchelcbrown88@gmail.com`, using the same image and isolation test. Keep
   existing Telegram and Matrix channels active.
7. Rollback by disabling affected instance configuration and stopping only its
   template unit. Preserve database rows and named volumes for reconciliation.

## Post-Design Constitution Check

All gates remain PASS. The only new dependency is the pure-Go PostgreSQL driver
required to use the existing table contract; v5.7.6 supports the repository's
Go version. No new public endpoint, schema migration, agent engine, or approval
system is introduced.
