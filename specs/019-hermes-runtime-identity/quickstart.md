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

Current disposition: **credential gate satisfied**. The
live Communication Module database credential has been rotated across its
consumers, the obsolete tenant-0 database secret has been removed, and the
historical Hermes Agent artifact scan is clean after value-suppressed
redaction. A valid replacement OpenRouter key was already staged consistently
across the active Phase consumers and has now replaced the invalid legacy
copies in the Hermes Agent/Walter and Mitchel runtime stores. Their primary,
fallback, delegation, and currently configured compression routes use separate
Codex OAuth subscription state; Walter's on-demand Fusion reference route uses
the valid Phase-backed OpenRouter credential. The GitHub coder credential was
replaced from Phase across the container environment, both GitHub CLI entries,
and all three Copilot credential-pool entries. The prior fine-grained PAT now
returns unauthorized while the replacement authenticates successfully.

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
- Replaced the GitHub coder credential with the staged Phase value. The active
  container environment, both GitHub CLI entries, and all three Copilot
  credential-pool entries match by protected fingerprint. GitHub user, all
  nine selected repositories, issues, pull requests, and Actions reads pass.
  The prior fine-grained PAT was revoked in the provider console and now
  returns unauthorized. No value or fragment was recorded in source or
  evidence.
- Prepared `/agents/hermes-email-intake/walter` with the same 14-key protected
  route contract as Agent, except for the explicit Walter route, target, base
  URL, and disabled polling state. The Agent source path remains unchanged.
- Deployed and verified SecurityTeam's dual Agent/Walter route policy. The
  initial deployment reused stale compiled output; an explicit source build
  corrected it while Agent remained active.
- Deployed Walter-capable intake and initialized its state with polling
  disabled. Agent remains healthy and polling; Walter is healthy but disabled,
  and the platform polling-exclusivity check passes.
- Stopped and disabled Agent intake after setting its Phase polling selector to
  false. Copied the two stopped state files into the preserved Walter intake
  volume and verified exact names, sizes, ownership, modes, and protected
  hashes before activation.
- Renamed the active platform runtime in place to `hermes-walter`, activated
  the repo-owned Walter persona, changed and reloaded Nginx, and preserved the
  exact container ID, image, `hermes-agent-data` mount, network, restart policy,
  and hardening contract. Docker DNS and public status recovered successfully.
- Changed only the provisioner canary container mapping to `hermes-walter`,
  retained a protected rollback copy, and restarted only
  `hermes-provisioner`. OIDC discovery remains healthy and unauthenticated
  dashboard access still fails closed. The final owner login/logout browser
  check remains open.
- Activated Walter intake from the copied state. Walter polling is true and
  healthy; Agent polling is false and its service and state volume are
  disabled/preserved. Titus and Mitchel remain healthy.
- Verified Open Brain, Ops, SecurityTeam, Communication Module, Nginx,
  GitHub operations, OIDC discovery, public status, active cron inventory,
  recent critical-error counts, Titus, and Mitchel without outputting protected
  content.

## Rollback rehearsal — 2026-07-18

- Set Walter polling false and stopped Walter intake before the rehearsal;
  Agent intake remained stopped, so neither platform route processed mail.
- Renamed the same runtime back to `hermes-agent`, restored the Agent persona
  and Nginx route, changed the provisioner mapping back to Agent, and confirmed
  the public status endpoint recovered with the same container ID and named
  volume.
- The first immediate status assertion ran before the restarted dashboard was
  ready and stopped the rehearsal in the verified Agent rollback state. No
  data, volume, credential, or intake selector was lost.
- Reactivated Walter with the guarded recovery wait, restored the provisioner
  mapping, and confirmed public status in 15 seconds. Re-enabled only Walter
  intake and verified Walter/Titus/Mitchel healthy with Agent inactive.
- Rollback and reactivation preserved both intake state volumes, both Phase
  paths, the stopped pre-credential-rotation container, the original persona,
  and the original Nginx configuration for the observation window.

## Standards, Ops, and audit closeout — 2026-07-18

- Merged and synced the live Walter platform contract at standard commit
  `843d4b4`. The active service, nested intake, volume/bind, Phase-path,
  network-selector, OIDC canary, and rollback-artifact records now match the
  verified runtime. The compatibility-named `hermes-agent-data` volume and
  Agent intake path/state remain preserved.
- Merged audit commit `ea4c8f8`, repaired only the protected audit database and
  Walter API selectors from their approved sources, and retained the previous
  environment and image tags. Audit run 190 resolved all three prior drift
  findings with zero findings, engine errors, or agent errors.
- Deployed merged Ops commit `d42aa84` from a staging tree that preserved the
  existing Aegis hotfixes. Local qualification passed 16 test files/128 tests
  and the TypeScript build. Both deployed Ops health endpoints passed.
- Atomically synced the eight Ops-owned Walter profile, skill, script, and
  repo-watcher attribution files to `hermes-agent-data`, updated only the
  Librarian cron wording while preserving volatile state, and verified exact
  source-to-volume hashes. Rollback copies are retained under the protected
  Aegis backup directory.
- Verified the template intake units for Walter, Titus, and Mitchel active,
  Agent inactive, the Walter runtime and public status healthy, and weekly
  operations audit run 191 with zero findings, zero engine errors, and zero
  agent errors.
- All code, security, operational, standards, and audit review findings are
  closed. The only remaining acceptance evidence is the owner-authenticated
  dashboard login and Hermes session-cookie logout check; T032, T033, and the
  final merged-main cleanup T042 intentionally remain open until that check.

## Owner-browser incident and repair — 2026-07-19

- The first owner browser attempt reached Aegis but Nginx returned 403 before
  Walter. Status-only comparison proved Vercel returned the expected 401 when
  contacted with TLS SNI, while Walter's static `proxy_pass` omitted SNI and
  received 403. Walter remained healthy throughout.
- Added a failing source-contract test, then changed only Walter's
  `/auth-verify` upstream to the working resolver, canonical Host, and TLS SNI
  pattern already used by Mitchel. The focused Nginx/auth/OIDC suites pass 17
  tests, and the dependency audit reports no high or critical findings.
- Deployed the source file with an exact rollback copy, validated the complete
  Nginx configuration, and reloaded Nginx without restarting Walter. Anonymous
  access now fails safely with a 302 sign-in redirect instead of 403; public
  status remains 200.
- A metadata-only control-plane check also found the Aegis instance row still
  stored `container_id=hermes-agent`. A guarded one-row update changed only
  that selector to `hermes-walter`; tenant, owner, OIDC linkage, and lifecycle
  state were unchanged. The deployed provisioner binary still lacks the
  already-merged `/sessions` route and returns 404 for both old and new
  container IDs. That affects dashboard-page session preloading, not the native
  dashboard launch or owner authorization, and requires a separate provisioner
  deployment decision.
- The repeated owner login/logout browser check remains pending.

## Follow-up: stable numeric tenant IDs

Numeric tenant IDs are intentionally a separate architecture feature rather
than an extension of this rename. That feature should define one stable
tenant/use-case identifier independently from runtime identity, persona, and
human authorization; map all infrastructure selectors to the stable tenant;
and support multiple personas on one runtime and shared-memory boundary. A
candidate namespace is
`tenants/{tenant_id}/agents/{agent_id}/personas/{persona_id}`, but actual IDs,
compatibility aliases, and migration sequencing require their own spec and
must not be inferred from persona names. Rex remains a separate runtime because
it has a separate personal memory and trust boundary.

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
