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
