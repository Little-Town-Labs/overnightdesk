# Quickstart: Walter Identity Migration

## Source gates

1. Confirm all owning repositories and worktrees are clean except reviewed
   Feature 019 changes.
2. Run the parent Hermes/intake shell qualification.
3. Run SecurityTeam route-policy tests.
4. Run engine OIDC tests, Ops tests/build, and audit tests.
5. Parse every platform-standard YAML file and run `git diff --check` in each
   repository.
6. Confirm source searches distinguish active runtime selectors from historical
   evidence and the upstream Hermes Agent product name.

## Security activation gate

Inventory found pre-existing credential material in runtime memory/backup
artifacts. Before production activation:

1. Obtain explicit owner approval for rotation and remediation scope.
2. Rotate affected live credentials at their owning systems.
3. Scrub or quarantine affected runtime artifacts without deleting unrelated
   memory or backup state.
4. Re-run filename/count-only scans that emit no values.
5. Confirm no active prompt, memory, cron, or backup artifact exposes the
   rotated values.

Do not place values or fragments in this file, Git, terminal output, or
`deploys.log`.

Current disposition: **owner approval recorded; remediation in progress**. The
live Communication Module database credential has been rotated across its
consumers, the obsolete tenant-0 database secret has been removed, and the
historical Hermes Agent artifact scan is clean after value-suppressed
redaction. A valid replacement OpenRouter key was already staged consistently
across the active Phase consumers and has now replaced the invalid legacy
copies in the Hermes Agent/Walter and Mitchel runtime stores. Their primary,
fallback, delegation, and currently configured compression routes use separate
Codex OAuth subscription state; Walter's on-demand Fusion reference route uses
the valid Phase-backed OpenRouter credential. Replacement and revocation of
the still-valid GitHub coder credential remains the final credential gate
before main runtime activation.

## Source qualification evidence — 2026-07-18

- Parent intake qualification: PASS (Go tests, race tests, vet, build, shell
  syntax, exact four-route fixtures, hardening assertions, and diff check).
- SecurityTeam: 35 files passed; 677 tests passed and 11 skipped; typecheck and
  build passed. Exact Walter and Agent rollback tuples passed; a Walter route
  targeting Agent remained wrapped/untrusted.
- Engine: `go test ./...` passed, including explicit Walter OIDC canary mapping
  and restart-restore behavior.
- Ops: 16 files and 128 tests passed; TypeScript build passed; cron JSON parsed.
- Operations audit: `go test ./...` passed with Walter default/upstream,
  collection, and exception changes.
- Platform standard: all 12 `WHAT/*.yaml` files parsed and `git diff --check`
  passed.
- No dependency versions changed. Existing lockfile audits reported known
  findings; dependency remediation is outside this identity-only change.
- Read-only Aegis preflight found Titus and Mitchel healthy and unchanged. No
  Phase or production selector was written during source preparation.

## Phase preparation

1. Use the installed `overnightdesk` service-account token.
2. Export the 14-key `agent` route payload to a restrictive temporary file
   without printing it.
3. Import it to `/agents/hermes-email-intake/walter` in the same app and
   Production environment.
4. Compare sorted key names, exact count, and protected full-value fingerprint.
5. Leave `/agents/hermes-email-intake/agent` unchanged for rollback.

Phase's official CLI documents path-specific export/import:
https://docs.phase.dev/cli/commands

## Activation evidence — 2026-07-18

- Owner approval for credential rotation and runtime-artifact remediation was
  recorded before the first credential write.
- Rotated the live Communication Module database role and updated the four
  Phase consumers plus the protected Ops environment. Communication Module and
  SecurityTeam are healthy, Ops is running, all protected fingerprints agree,
  and an authenticated query passed.
- Removed the obsolete tenant-0 database secret and its unused Walter runtime
  copy after confirming the retired database host no longer exists.
- Redacted 565 detected credential occurrences in 188 historical memory,
  session, backup, cron-output, and log artifacts. The bounded rescan found zero
  remaining matches; unrelated content, file ownership/modes, and JSON/JSONL
  validity were preserved.
- A valid OpenRouter inference key was already staged in `/ob1` and matched the
  active email-fetch, newsletter-curator, and SecurityTeam Phase consumers by
  protected fingerprint. The different legacy keys in the Hermes Agent and
  Mitchel runtime stores returned unauthorized. Both runtimes were stopped one
  at a time, updated from Phase across their `.env` and Hermes credential-pool
  copies, restarted, and verified with healthy intake services.
- The active Hermes Agent/Walter route uses Codex OAuth for `gpt-5.6-sol`, the
  Codex OAuth `gpt-5.5` fallback, and Codex OAuth `gpt-5.6-luna` delegation.
  Mitchel independently uses Codex OAuth for its primary, fallback, and
  delegation routes. Compression is enabled on both runtimes and the current
  active auxiliary compression route is Codex OAuth `gpt-5.4-mini`; Walter's
  optional Fusion preset uses `openrouter/fusion` as its reference model.
- GitHub personal access token replacement/revocation likewise requires the
  provider console. The still-valid Phase value matches the active GitHub CLI,
  Hermes credential-pool, and container-environment copies by protected
  fingerprint. No value or fragment was recorded in source or evidence.
- Prepared `/agents/hermes-email-intake/walter` with the same 14-key protected
  route contract as Agent, except for the explicit Walter route, target, base
  URL, and disabled polling state. The Agent source path remains unchanged.
- Deployed and verified SecurityTeam's dual Agent/Walter route policy. The
  initial deployment reused stale compiled output; an explicit source build
  corrected it while Agent remained active.
- Deployed Walter-capable intake and initialized its state with polling
  disabled. Agent remains healthy and polling; Walter is healthy but disabled,
  and the platform polling-exclusivity check passes.
- No `hermes-walter` main runtime container exists yet. Nginx, OIDC, and the
  active main runtime remain on `hermes-agent` until the credential gate is
  complete.

## Read-only production preflight

- `hermes-agent`, `hermes-mitchel`, and `hermes-titus` are healthy.
- `hermes-walter` does not yet exist.
- `hermes-agent` mounts only the expected `hermes-agent-data:/opt/data` state
  volume and remains on `overnightdesk_overnightdesk`.
- Public status, authenticated dashboard, WebSocket, and OpenAI-compatible API
  work before cutover.
- Agent/Titus/Mitchel intake services are healthy and Agent polling state is
  recorded by count/metadata only.
- Nginx, OIDC, Ops, audit, monitoring, and standards old selectors match the
  inventory.
- A tested rollback command set is staged before the first write.

## Cutover

1. Deploy dual-tuple SecurityTeam policy and verify it.
2. Deploy Walter-capable intake loaders with Walter polling disabled.
3. Stop and disable Agent intake; confirm no Agent intake container remains.
4. Copy its small stopped state into the new Walter intake volume and compare
   file names, sizes, and protected hashes without contents.
5. Rename the running platform container in place to `hermes-walter`; confirm
   the container ID, image, mount source, restart policy, security flags, and
   network remain unchanged.
6. Activate the repo-owned Walter `SOUL.md`.
7. Update and reload Nginx; verify the public endpoint and Docker DNS.
8. Update the provisioner OIDC canary container mapping and restart only the
   provisioner; verify one owner login/logout and session-cookie behavior.
9. Start Walter intake from the verified Phase path and copied state; observe a
   healthy cycle before leaving Agent disabled.
10. Verify Open Brain, Ops MCP, cron inventory, GitHub auth availability,
    internal API, monitoring, and recent error counts without emitting data.
11. Verify Titus and Mitchel remain unchanged and healthy.

## Rollback

Follow the reverse order in
`contracts/runtime-identity-contract.md`. Do not start Agent and Walter intake
simultaneously. Do not delete either intake state volume or either Phase path.
The platform runtime rollback is an in-place rename back to `hermes-agent`, so
the same named volume remains mounted throughout.

## Closeout

Update and merge each owning repository, sync the platform standard to Aegis,
restart `overnightdesk-ops` after its knowledge mount changes, run the full
operations audit, and append one value-suppressed production record to the
suite-root `deploys.log`. Cleanup of old names or artifacts requires a later,
explicitly approved retention review.
