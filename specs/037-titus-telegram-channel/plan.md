# Implementation Plan: Titus Telegram DM Channel

**Branch**: `037-titus-telegram-channel` | **Date**: 2026-08-08 | **Spec**:
[spec.md](spec.md)

## Summary

Add Telegram as a second native Hermes interaction surface for Titus, scoped to
Gary's private direct messages. The bot token and exactly one numeric user ID
remain in the existing Phase profile at `/agents/hermes-titus/telegram`.
Source-controlled runtime code validates and projects that profile only when it
is complete, configures the pinned Hermes Telegram plugin for outbound polling,
and explicitly rejects group-scope senders. Matrix, Teams, AgentMail, meeting
processing, memory, and approval behavior remain unchanged.

## Classification

- **Context**: Brownfield tenant integration
- **Scale**: Feature
- **Risk**: Production-sensitive external integration
- **Delivery**: Sol owns integration, production mutation, and final quality
  gate; any delegated work is read-only unless separately authorized.

## Technical Context

**Language/Version**: Existing POSIX shell runtime loader and Python contract
tests; YAML Hermes configuration; pinned `overnightdesk/hermes-agent:0.19.1-coder`
image.

**Primary Dependencies**: Existing Phase CLI projection, native Hermes Telegram
plugin, `python-telegram-bot` bundled in the Titus image, existing Titus systemd
service and named volume.

**Storage**: No new database, queue, volume, or durable Telegram message store.
Hermes keeps its existing session and memory state on `hermes-titus-data`.

**Ingress**: Outbound Telegram polling only. No webhook URL, public port, Nginx
route, or new service.

**Policy**: Exactly one `TELEGRAM_ALLOWED_USERS` numeric ID, no wildcard, no
group sender allowlist, no group chat allowlist, no channel posts, and
`TELEGRAM_ALLOW_ALL_USERS=false`.

**Testing**: Shell syntax, static configuration/secret-redaction tests, mocked
Phase projections, pinned-plugin presence checks, safe routing fixtures, and a
controlled Gary-only canary with redacted service evidence.

## Constitution Check

- **Business data and use-case boundaries**: PASS. Telegram enters the existing
  Titus runtime and does not merge with Matrix, Teams, meetings, or AgentMail.
- **Least privilege**: PASS. One exact user, private DMs only, Phase-backed
  token, no wildcard, no group authority, and no public ingress.
- **Agents assist; people decide**: PASS. Existing Titus approval mode and tool
  policy remain authoritative.
- **Named workloads**: PASS. The change extends `hermes-titus`; it adds no
  bridge service or dynamic runtime.
- **Operational truth**: PASS. The Phase contract, tests, runbook, health
  evidence, and deployment record describe the channel state.
- **Recoverability**: PASS. Telegram is disabled-first and reversible by
  removing readiness or setting the activation switch off while preserving the
  Titus volume.
- **Workspace quality**: PASS. Unknown users and every non-private chat type
  fail closed before Titus processing.

## Architecture

The integration uses the native Telegram plugin already present in the pinned
image. The repository owns the boundary around it:

1. `runtime/load-phase-env.sh` fetches `/agents/hermes-titus/telegram`, rejects
   unknown keys and invalid values, validates one numeric Gary ID and token
   shape, and emits only redacted readiness metadata plus the required runtime
   values when ready.
2. `runtime/start-with-secrets.sh` enables the native Telegram platform only
   for the ready state, pins private-DM-only adapter settings, and leaves
   Matrix/Teams configuration untouched.
3. `config/config.yaml` registers the native Telegram platform and explicitly
   sets a non-empty `allow_from` for Gary plus an empty `group_allow_from` so
   group senders cannot inherit the global DM allowlist.
4. `tests/` proves the Phase contract and static security boundary without
   storing or printing real values.
5. The runbook and quickstart define disabled-first deployment, canary, health,
   and rollback evidence.

## Project Structure

```text
tenants/hermes-titus/
├── config/config.yaml                         # native Telegram policy
├── runtime/load-phase-env.sh                  # strict Phase projection
├── runtime/start-with-secrets.sh              # readiness-gated enablement
├── tests/test_telegram_runtime_contract.py   # config/projection/security tests
├── tests/fixtures/telegram_channel.py        # redacted safe fixtures
├── README.md                                  # runtime boundary and Phase path
└── runbooks/telegram-dm-channel.md           # activation/rollback evidence

specs/037-titus-telegram-channel/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/telegram-runtime.md
```

## Implementation Phases

### Phase 0 - Research and contract

Confirm the pinned image has the native Telegram plugin, verify its sender-scope
precedence from installed source, and define the exact Phase/runtime contract.

### Phase 1 - Failing tests and runtime boundary

Add tests for strict keys, one-user numeric allowlist, token redaction,
disabled/invalid readiness, group rejection, no webhook/public ingress, and
unchanged sibling channels. Then extend the loader and startup configuration.

### Phase 2 - Documentation and qualification

Document the channel, add safe evidence commands, run local checks, and verify
the live Phase profile only through redacted metadata.

### Phase 3 - Controlled activation

Deploy source with Telegram disabled or not-ready first, restart only Titus,
verify the native plugin and existing surfaces, activate the existing Phase
profile, and run one Gary private-DM canary. Stop and roll back on any policy,
health, or leakage failure.

## Rollout and Rollback

1. Validate source and run all local contract tests.
2. Keep Telegram disabled or not-ready and restart only `hermes-titus.service`.
3. Confirm no public port, webhook, token in Docker inspection, or group policy.
4. Confirm the Phase profile has exactly the two expected keys without printing
   values.
5. Enable the native platform through the runtime readiness path and send one
   harmless Gary DM.
6. Verify one response, healthy Matrix/AgentMail/memory surfaces, and no
   protected-content leakage.
7. Roll back by disabling Telegram readiness and restarting only Titus; retain
   `hermes-titus-data` and all other channel state.

## Complexity Tracking

No constitution violations or complexity exceptions. The implementation does
not add a custom bridge because the pinned native adapter already provides the
required Telegram transport and Hermes pipeline.
