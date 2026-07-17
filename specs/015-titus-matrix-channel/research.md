# Research: Titus Matrix Communication Channel

## Native Hermes Matrix Platform

**Decision**: Use Hermes's bundled Matrix platform adapter as Titus's primary
interactive channel.

**Rationale**: The official [Hermes Matrix guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/matrix)
states that Matrix events enter the full Hermes pipeline with tools, memory,
reasoning, sessions, progress, controls, reactions, approvals, media, and E2EE.
A read-only Aegis preflight on 2026-07-17 confirmed the live pinned image is
healthy and contains `matrix-platform` 1.0.0 and `mautrix` 0.21.0.

**Alternatives considered**: Extend the Go AgentMail poller to invoke Hermes;
build a separate Matrix bridge; activate Teams. The poller was intentionally
designed as tool-free, a separate bridge would duplicate native Hermes session
and approval behavior, and Teams still requires tenant application credentials
and public webhook ingress.

## ARM64 and E2EE Compatibility

**Decision**: Require E2EE and reuse the packages already present in the pinned
image.

**Rationale**: Live imports confirmed `mautrix.crypto.OlmMachine`,
`PgCryptoStore`, `asyncpg`, and `aiosqlite`; the host resolves `libolm.so.3`.
The official guide documents `required` mode as fail-closed and stores native
crypto state below the Hermes home directory. Titus maps that directory to the
existing durable `/opt/data` volume.

**Alternatives considered**: Optional E2EE; unencrypted room; install packages
at each container start. Optional mode can silently downgrade, an unencrypted
operations channel violates the trust posture, and runtime package installation
adds network and supply-chain failure paths already avoided by the current
image.

## Shared-Room and Direct-Message Authorization

**Decision**: Use the native adapter's exact user and room allowlists without a
derived image.

**Rationale**: Live source inspection found that the pinned adapter's
`_is_allowed_matrix_room_event` restricts shared-room events through
`MATRIX_ALLOWED_ROOMS` and exempts DMs only after the exact sender passes
`MATRIX_ALLOWED_USERS`. The accepted MVP authorizes one operator, one shared
room, and that same operator's isolated DM session. This keeps the upstream
image intact and avoids an upgrade-sensitive authorization fork.

**Alternatives considered**: Patch the adapter to deny operator DMs; rely only
on `MATRIX_ALLOWED_USERS`; create a separate proxy. A patch adds maintenance for
little additional risk reduction when the same exact operator is authorized;
a user allowlist alone would not restrict shared rooms; a proxy would become a
second crypto client.

## Secrets and Activation

**Decision**: Add a strict `/agents/hermes-titus/matrix` Phase record with
`MATRIX_ENABLED`, homeserver, bot user, operator user, room, access token, and
recovery key.

**Rationale**: This extends the existing root-owned Phase loader and read-only
runtime secret mount. An explicit enable switch permits disabled deployment,
credential validation, and rollback without source changes. Fixed policy values
are emitted by repository-controlled code so E2EE, approvals, mention behavior,
and admin-tool restrictions cannot drift through Phase edits.

**Alternatives considered**: Store values in `config.yaml`; run interactive
`hermes gateway setup`; pass secrets as Docker environment variables. Repository
configuration cannot contain credentials, interactive setup bypasses the
operator-owned deployment contract, and Docker environment values are exposed
through inspection.

## Session and Busy-Input Behavior

**Decision**: Use stable room scope, no synthetic auto-threading, isolated real
threads, and `display.busy_input_mode: queue`.

**Rationale**: The room represents one continuing operator relationship. Queue
mode prevents an ordinary follow-up from interrupting a running operation,
while Hermes's explicit steer and stop controls remain available. Real Matrix
threads provide deliberate context isolation when needed.

**Alternatives considered**: Default interrupt mode; synthetic thread per
message; one session per event. Interrupt mode can abandon work unexpectedly,
and per-message sessions lose the conversational continuity the channel is
being introduced to provide.

## Approvals and Matrix Tools

**Decision**: Enable reactions and requester-bound approvals while leaving room
creation, invitations, redaction, public-room, and cross-room tools disabled.

**Rationale**: Reaction approvals keep the existing human decision boundary in
the operator's only interactive surface. The official adapter defaults admin
tools off and can bind approval to the requesting sender; the plan pins those
values explicitly.

**Alternatives considered**: Treat the private room as blanket approval; allow
any room member to approve; enable Matrix administration. A trusted entry point
does not waive action-level approvals, and administrative messaging authority
is not required to operate Titus.

## Observability and Recovery

**Decision**: Base channel readiness on gateway liveness plus the Matrix
platform status, sync freshness, identity, encryption, and failure category.
Use structured metadata only.

**Rationale**: Container health today proves only the dashboard and memory
gateway. A live process can still have an invalid Matrix token, stale sync, or
failed crypto initialization. Operators need to answer: Is Matrix enabled? Is
the exact bot connected? Is E2EE ready? Is sync fresh? Why did the last channel
attempt fail? None requires message bodies or secrets.

**Alternatives considered**: Process-only health; log-based manual diagnosis;
full event payload logging. Process health misses channel failures, manual log
archaeology delayed the email incident diagnosis, and payload logs violate the
tenant data and secret boundaries.

## Email Coexistence

**Decision**: Leave the standalone Go email poller unchanged and document Matrix
as the primary interactive channel.

**Rationale**: Feature 014 deliberately guarantees that incoming email never
enters Hermes tools or memory. That property remains useful for asynchronous
acknowledgement and external-sender approval while Matrix supplies the missing
interactive agent path.

**Alternatives considered**: Retire email immediately; make email a failover
command channel. Immediate retirement removes a working asynchronous contact
path, while automatic failover would silently broaden the email threat model.
