# Five-Axis Quality Review: Routed Hermes Email Intake

**Date**: 2026-07-17

**Gate**: Approved for controlled production canary. No Critical or Required
findings remain open.

## Context and tests-first review

The change replaces the direct OpenRouter acknowledgement path with the existing
dirty-to-clean SecurityTeam boundary and authenticated Hermes Runs API. Tests
cover exact routing, sender spoofing, automated mail, dirty deduplication,
clean-only submission, backlog pagination, malformed provider responses,
the live `started` submission state, approval waiting, restart reconciliation,
and disabled operation.

Verification:

- Go unit and race tests, vet, static build, shell/runtime qualification,
  credential scan, file-size check, and `git diff --check`: pass.
- SecurityTeam strict typecheck and build: pass.
- SecurityTeam: 674 tests pass; 11 pre-existing database integration tests are
  skipped without `TEST_DATABASE_URL` and are covered by the controlled
  production database canary before activation.
- Titus tenant runtime qualification: pass.
- `npm audit --omit=dev`: zero critical, five high, and two moderate advisories
  in the pre-existing Fastify/mail parsing dependency tree. This change adds no
  Node dependency and does not expand public ingress; remediation is kept out
  of the least-change email route slice and must be handled as dependency
  maintenance rather than an automatic audit fix.

## Required findings resolved

1. **Correctness - backlog starvation**: the first implementation inspected
   only the newest page, so already-checkpointed mail could permanently hide an
   older new message. Resolution: bounded pagination scans up to 100 pages while
   accepting at most the configured 20 new candidates per cycle; a regression
   test proves page-two work is landed.
2. **Correctness - completion recovery**: a reply followed by a lost database
   completion acknowledgement could leave recovery state stuck. Resolution:
   exact-route `done` acknowledgement is idempotent and reply retries reuse the
   same AgentMail idempotency key; a restart test covers the failure.
3. **Deployment safety - overlapping Titus consumers**: rollout could start the
   replacement while the direct-model poller remained active. Resolution: the
   rollout initializes disabled instances, stops the legacy unit immediately
   before the Titus canary, and restores it if Titus activation fails.
4. **Authorization - initially unknown Mitchel sender**: rollout could have
   enabled Mitchel without an exact sender. Resolution: the operator supplied
   `mitchelcbrown88@gmail.com`; Hermes Agent was corrected to
   `netgleb@gmail.com`; all three exact allowlists are provisioned from Phase,
   and enabled unconfigured routes fail closed.
5. **Boundary validation**: UTF-8 text could be split at byte boundaries,
   malformed run/reply identities were accepted, and the clean claim did not
   assert every provenance field. Resolution: Unicode-safe bounds, strict
   Hermes run IDs, non-empty AgentMail reply IDs, and exact staging source,
   provider, message identity, clean-content, sender, inbox, route, and target
   predicates were added with regression tests.
6. **Correctness - live Hermes submission state**: the first production smoke
   received Hermes' HTTP 202 response with `status: started`, but the client
   accepted only later lifecycle states and marked the clean row failed even
   though Hermes completed normally. Resolution: a tests-first regression now
   accepts `started` only for submission, continues to reject terminal submit
   responses, and the deployed patch reconciled the harmless smoke row once.

## Five axes

- **Correctness**: The data path matches the specification. Dirty landing,
  SecurityTeam-only cleaning, exact-route claiming, full Hermes execution, and
  terminal reply reconciliation are independently tested. Error paths fail
  closed and retain metadata-only recovery evidence.
- **Readability and simplicity**: One route-configured Go binary replaces the
  old direct-model and custom email-approval branches. SecurityTeam's special
  route rule is isolated in `agentmail-route-policy.ts`, not scattered through
  the generic pipeline.
- **Architecture**: The implementation reuses the established PostgreSQL
  boundary, existing staging poller, standard Hermes agent, and existing
  Matrix/Telegram approvals. The only new dependency is the pinned pgx version
  already used by another Go consumer in this suite.
- **Security**: SQL is parameterized; route values come from strict protected
  configuration; dirty content never reaches Hermes; secret redaction and
  injection detection remain active; no email action can approve a run; runtime
  files are mounted read-only and containers publish no port.
- **Performance**: Mailbox scans, body size, clean claims, HTTP responses,
  timeouts, process resources, and the database pool are bounded. Candidate
  detail fetches and Hermes submissions are limited to 20 and 10 per cycle,
  respectively; clean claims use `SKIP LOCKED`.

## Activation condition

All three sender assignments are now known. Activation remains contingent on
verifying the exact values in protected Phase configuration during preflight.

Production verification completed with all three strict Phase routes active,
authenticated Hermes capabilities ready, the least-privilege database role
confirmed, SecurityTeam healthy, and the legacy Titus poller inactive. A fresh
allowed-sender Titus email then completed dirty landing, SecurityTeam
auto-approval, Hermes execution, one threaded reply, and durable `done` status.
