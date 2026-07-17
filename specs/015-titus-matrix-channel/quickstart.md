# Quickstart: Titus Matrix Communication Channel

This is the implementation verification sequence. It intentionally contains no
credential values and no command that prints Matrix secrets.

## Preconditions

- Work from the `overnightdesk` repository on branch
  `015-titus-matrix-channel`.
- Confirm `@frozensolo:matrix.org` controls the private encrypted room
  `!LuLWlULPVgtogXtKbP:matrix.org`.
- Confirm `@hermes-titus:matrix.org` has joined that room.
- Store the access token and recovery key directly in Phase at
  `/agents/hermes-titus/matrix`; never paste them into chat or shell history.
- Create the Phase record with `MATRIX_ENABLED=false` for initial deployment.

## Local Qualification

```bash
tenants/hermes-titus/scripts/qualify.sh
```

Qualification validates the exact Phase contract and fixed security policy,
scans for secrets, validates shell syntax, and proves both stop paths preserve
their named volumes.

## Read-Only Production Preflight

Before any deployment, inspect the live service, image, volumes, platform
process, Matrix dependencies, current email poller, and Phase key names without
printing values. Record the current image ID and both volume identities for
rollback evidence.

Expected baseline:

- `hermes-titus.service` and `titus-email-poller.service` active;
- `hermes-titus` and `titus-email-poller` healthy;
- no published Titus ports;
- `hermes-titus-data` and `titus-email-poller-data` present;
- Matrix channel disabled before the first deployment.

## Disabled Deployment

Deploy the updated Titus source using the existing pinned ARM64 image and
restart only `hermes-titus.service` with `MATRIX_ENABLED=false`.

Verify:

- bundled Matrix plugin and E2EE dependencies remain available;
- container hardening and existing health checks remain unchanged;
- Matrix credentials are absent from Docker inspection;
- gateway reports Matrix disabled;
- email poller remains healthy and its state/volume are unchanged.

## Activation

Before enabling, use redacted diagnostics to verify the Phase key set, exact
configured IDs, bot membership, and room encryption. Change only
`MATRIX_ENABLED` to `true`, restart only Titus, and wait for connected/ready
Matrix platform status.

Do not log the Element bot session out after its token is stored; explicit
logout may revoke the token.

## Live Smoke Matrix

1. Record UTC timestamps, send a unique text instruction in the approved room,
   and verify visible activity begins within 10 seconds and one terminal
   response appears within 10 seconds of the agent run completing.
2. Send a harmless read-only Control Tower request and verify the tool result
   returns in the same room session.
3. Start bounded work, send a follow-up, and verify the follow-up queues.
4. Exercise explicit status, steer, and stop controls.
5. Request one guarded action and verify the requester-bound approve-once and
   deny paths with reactions.
6. Send duplicate/edit/notice test events where safe and verify zero duplicate
   turns.
7. From another Matrix account or test room, verify zero agent turns.
8. From the authorized user, send a DM to the bot and verify it uses a separate
   session; verify a DM from any other user creates zero agent turns.
9. Restart Titus and verify a new encrypted message works within two minutes,
   no old event runs, and conversation context remains available.

## Failure and Recovery Tests

Use reversible, redacted tests to prove invalid authentication, lost room
membership, stale sync, and unavailable encryption are visible and fail closed.
Restore the original value/state after each test and re-run the healthy smoke.
Never delete the live crypto store as a test.

## Rollback

Set `MATRIX_ENABLED=false`, restart only Titus, and verify Matrix is disabled.
Confirm both named volumes still exist and the email poller remains healthy.
Keep the bot account, access-token session, encrypted room, and crypto store
intact for remediation or reactivation.

## Closeout

- Update the Titus README and accept ADR-001.
- Update `overnightdesk-platform-standard` if live runtime facts changed.
- Refresh the platform-standard Aegis copy and restart `overnightdesk-ops` when
  required by that repository's runbook.
- Append a success or failure record to the suite `deploys.log`.
- Run the code-review-and-quality gate and capture final production evidence.

## 2026-07-17 Production Evidence

- Disabled deployment passed with both named volumes and the email poller
  preserved.
- A case-sensitive Phase-path mismatch was corrected from uppercase `MATRIX`
  to lowercase `matrix` without printing the stored secret values.
- Activation completed before `2026-07-17T15:02:56Z`.
- Redacted verification proved bot identity
  `@hermes-titus:matrix.org`, joined room
  `!LuLWlULPVgtogXtKbP:matrix.org`, `m.megolm.v1.aes-sha2` encryption,
  initialized crypto store, healthy Hermes, healthy memory, and healthy email
  poller.
- End-to-end operator message and tool-response smoke completed successfully.
- The Element-derived token reused device `KTLfTroLQg`; Hermes correctly
  replaced stale device keys and cross-signed its current identity, but Element
  retained the retired key and withheld each new Megolm session. Repeated
  `/discardsession` attempts produced new session IDs but did not resolve the
  same-device key collision. Recovery is a fresh API login with dedicated
  device `HERMESTITUS01`, a preserved backup of the collided crypto store, and
  one final `/discardsession` after restart.
- Password-authenticated API login minted dedicated device
  `HERMESTITUS01`; its token and device ID were verified in Phase and the
  temporary password was removed. The collided store is preserved at
  `/opt/data/platforms/matrix/store.pre-HERMESTITUS01-20260717-1`.
- A post-rotation operator message arrived at `2026-07-17T15:23:02Z`, entered
  Hermes with processing reactions, and received one encrypted terminal
  response at `2026-07-17T15:23:21Z`. The progress event was redacted after
  completion. No new decryption failure occurred.
- A retry after the protected helper deployment arrived at
  `2026-07-17T15:31:38Z`. Control Tower authenticated `hermes-titus` in
  `overnightdesk` at `15:31:47Z`; Titus delivered the encrypted terminal
  response at `15:31:58Z` and redacted the progress event at `15:32:03Z`.
- The source-owned `SOUL.md` identifies Titus without expanding authority. The
  fixed-purpose `/opt/data/bin/control-tower-session` helper works from a
  sanitized tool shell, keeps the bearer token out of argv/output, and validates
  the exact read-only session boundary.
- The Matrix communication MVP is ready. Queue/approval controls and reversible
  induced-failure drills remain the P2/P3 follow-up scope.
- The approved post-MVP model route is `x-ai/grok-4.3` with Hermes
  `agent.reasoning_effort: medium`; final production verification must prove
  both values after the controlled Titus restart.
- The gateway pins the Phase-backed route through `HERMES_INFERENCE_MODEL`,
  preventing mutable dashboard or restored-session selections from overriding
  the effective production model.
- Hermes delegation is routed to `x-ai/grok-build-0.1`. The requested
  `grok-imagine-image-quality` route is intentionally not assigned to vision:
  it produces images rather than image-analysis text and is absent from
  OpenRouter's current model catalog.
- Final combined verification passed the process-pinned main route, medium
  effort, delegation route, encrypted Matrix, Control Tower, 26-tool AgentMail
  MCP discovery, memory, container hardening, and the isolated email poller.
