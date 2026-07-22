# Quickstart: Composable Agent Workspace

## Local contract and component slice

1. Install locked dependencies with `npm ci`.
2. Run the pure contract and rendered workspace tests:

   ```bash
   npm test -- --runInBand \
     src/lib/__tests__/agent-workspace.test.ts \
     'src/app/(protected)/dashboard/chat/__tests__/agent-workspace.test.tsx'
   ```

3. Run the selected-agent and capability regression suites:

   ```bash
   npm test -- --runInBand \
     src/lib/__tests__/selected-agent-context.test.ts \
     src/lib/__tests__/agent-capabilities.test.ts \
     'src/app/(protected)/dashboard/__tests__/agent-overview.test.tsx'
   ```

4. Start the existing fixture server and run the focused Chromium workspace
   checks after updating the fixture:

   ```bash
   npm run test:open-webui-browser
   ```

5. Verify the production build with the repository's documented unreachable
   build-only database URL if a live database is unavailable.

## Independent acceptance fixtures

- Titus: chat available, dashboard unavailable/not deployed.
- Walter current: dashboard available, chat not deployed.
- Future Walter: both available.
- One-agent member: selector and markup expose only the assigned agent.
- Invalid explicit agent: fail closed/not found with no capability URL.
- Directory or linkage failure: explicit unavailable state and no iframe/link.
- Desktop/mobile: native dashboard link opens independently and chat remains.
- Keyboard: selector, link, back action, and iframe title are reachable and
  descriptive.

## Walter production qualification

Do not begin from this quickstart alone. Execute the tasks and the reviewed
`contracts/walter-open-webui-qualification.md` sequence through the repository
deployment scripts. Start with an Aegis read-only preflight, install disabled,
prove private health and rollback, then request owner browser evidence for each
membership and OAuth/session lifecycle transition. Append each production
mutation and result to `/home/frosted639/src/overnightdesk-suite/deploys.log`.

## Prototype verification — 2026-07-22

- Pure composition, selected-page resolution, rendered workspace, legacy chat,
  capability, and Overview focused suites: 5 suites, 38 tests passed.
- Chromium release fixture: 24 tests passed in 6.3 seconds.
- Chromium coverage includes both, chat-only, dashboard-only, neither,
  one-agent, invalid/unavailable, safe external launch, 320/768/1024/1440px,
  keyboard focus, dashboard open/close/reopen with retained chat, platform
  logout, assignment rollback, session expiry, revocation, and restoration.
- Desktop 1440x900 and mobile 320x720 full-page screenshots were captured and
  visually reviewed. Both preserve the selector, identity, capability order,
  independent dashboard action, chat frame, fallback, and zero horizontal
  overflow. Screenshots are transient test evidence and are not committed.

## Prototype release gates — 2026-07-22

- Complete Jest suite: 83 suites passed and 3 skipped; 961 tests passed and 26
  skipped (987 total).
- TypeScript: `npx tsc --noEmit` passed.
- Production build: Next.js 15.5.18 compiled successfully with the documented
  unreachable build-only database URL. The sandbox run could not reach its
  external build dependency; the identical build passed with network access.
- Diff and value checks: `git diff --check` passed; no secret value, agent-name
  policy branch, array-position fallback, unsafe external launch, or arbitrary
  host was found in the production slice.
- Dependency audit: `npm audit --audit-level=high` reports 7 inherited issues
  (5 moderate, 2 high). The high findings are in Next.js's transitive `sharp`
  dependency; the proposed automated remediation is a breaking Next.js
  downgrade. The feature adds no dependency, and no forced audit rewrite was
  applied. The production-only audit reports 3 inherited issues (1 moderate,
  2 high).

## Cross-artifact analysis and review — 2026-07-22

- Specification, plan, research, data model, contracts, quickstart, and tasks
  are present and internally consistent. All 16 functional requirements and 8
  success criteria map to implementation or Walter qualification tasks; no
  critical/high inconsistency or unresolved clarification remains.
- FR-001 through FR-011 are represented in the frontend contract, page,
  rendered states, and local browser lifecycle evidence. FR-012 through FR-016
  remain explicitly gated by T017-T026 and do not receive deployment credit
  from the prototype.
- Five-axis review passed for correctness, readability, architecture, security,
  and performance. The page performs directory and instance reads in parallel,
  adds no client bundle or browser data fetch, resolves exact runtime linkage,
  fails closed on contradictory data, and exposes only validated HTTPS
  OvernightDesk dashboard targets.
- The previous `OpenWebuiWorkspace` component remains as a tested rollback seam
  but is no longer selected by the production page. Its removal is optional
  cleanup and is not required for Walter qualification.

## Walter read-only production preflight — 2026-07-22T15:59:46Z

No production state was changed and no secret value was read into evidence.

- Walter's native `hermes-walter` container is running on the expected internal
  network with a durable volume and `unless-stopped` restart policy. It remains
  a legacy standalone Docker runtime rather than a systemd-managed unit; the
  Walter Open WebUI slice must not rewrite or restart it.
- The authenticated Walter dashboard boundary is healthy: the public root
  redirects to platform sign-in and its unauthenticated status endpoint returns
  HTTP 200. Nginx configuration syntax is valid and routes the dashboard and
  OpenAI-compatible API to Walter's distinct internal ports.
- Walter's effective primary provider is `openai-codex`; the live credential
  registry contains only `openai-codex`. OpenRouter appears only in the named
  mixture-of-agents fusion reference path. This is the before-state that T020,
  T025, and rollback must preserve.
- Titus remains healthy and isolated: its Open WebUI container is healthy,
  read-only, unprivileged, connected only through the internal network, backed
  by its own durable volume and runtime secret mount, and returns HTTP 401 when
  requested without platform authorization.
- Walter Open WebUI is absent as expected. There is no Walter container,
  volume, Linux service user/group, systemd unit, install/runtime directory,
  Nginx route, or responding `walter-chat.overnightdesk.com` endpoint. Titus is
  the only installed Open WebUI route.
- Phase retains two app-boundary service accounts with distinct mode-0400 token
  files. Titus uses the `timeless-tech-solutions` boundary and its Open WebUI
  path exposes exactly the expected two key names. Walter must use the separate
  `overnightdesk` boundary; the proposed Walter Open WebUI path currently
  exports an empty key set and therefore is not deployment-ready.
- Current production source contains the Titus Open WebUI client/authorization
  contract only. A Walter Open WebUI client, callback, canonical assignment,
  and runtime binding must be created and verified as disabled artifacts in
  T018-T020. The Aegis-only preflight did not query the platform database, so
  exact zero/one record counts remain an explicit value-free qualification
  assertion rather than an assumption.

**Preflight decision**: proceed to RED deployment-contract tests and a disabled
Walter implementation. Do not activate a public route or canonical assignment;
the empty Walter Phase path, missing OIDC contract, and absent isolated runtime
resources are expected prerequisites, not production faults.

## Walter disabled qualification and rollback — 2026-07-22T16:24:47Z

- RED: the Walter deployment contract failed first on the absent
  `infra/open-webui/walter/load-phase-env.sh` boundary. GREEN: the completed
  Walter contract and the existing Titus contract both pass.
- Created exactly two Walter Open WebUI secrets at the previously empty
  `overnightdesk/production/agents/open-webui/hermes-walter` path. The existing
  Walter internal API bearer moved directly from its runtime file to Phase over
  stdin, and a new Walter-only session secret existed only in remote shell
  memory. Key names, types, and minimum lengths were verified without values.
- Installed a Walter-only Linux account, systemd unit, runtime directory,
  pinned Open WebUI container, and durable named volume. The candidate had no
  published port and no Nginx route; `walter-chat.overnightdesk.com` remained
  unresolved/unreachable.
- Private health passed. The container was unprivileged and read-only with all
  capabilities dropped, `no-new-privileges`, the exact internal network, exact
  Walter volume, read-only runtime secret mount, and no secret or OpenRouter
  value in Docker environment metadata.
- The private OpenAI-compatible model probe passed using the internal bearer.
  Walter remained `openai-codex` with default `gpt-5.6-sol`; its stored provider
  set remained exactly `openai-codex`. No native Walter restart occurred.
- A value-free OAuth callback sentinel was absent from candidate logs. A
  volume marker survived a candidate-only systemd restart and was then removed;
  the exact volume and private health remained intact.
- Rollback disabled and stopped only the Walter Open WebUI candidate, retained
  its volume and Phase records, kept the native Walter container running, kept
  its Codex provider/model exact, and left the public route absent. Post-checks:
  Walter dashboard status HTTP 200, unauthenticated Titus chat HTTP 401, Titus
  Open WebUI healthy, and Walter chat endpoint unreachable as expected.

**Disabled qualification decision**: T020-T021 pass. Final production state is
the prior Walter dashboard-only state with a recoverable stopped candidate and
retained isolated volume. Public activation and platform OIDC/resource changes
remain unauthorized until the separate T022 increment is reviewed.

## T022 controlled-activation preflight and source gate — 2026-07-22T17:12:05Z

- A new dedicated worktree and branch were created from published `main` at
  `6c59d9c`; no production state was changed by workspace setup.
- Live Aegis preflight reconfirmed the Walter candidate service is disabled,
  its container is absent, its dedicated volume is retained, the Walter native
  runtime is running, and Walter remains `openai-codex` with default
  `gpt-5.6-sol`. Titus Open WebUI remains healthy.
- DNS now resolves `walter-chat.overnightdesk.com` to Aegis. This supersedes
  the earlier unresolved observation. TLS is intentionally not ready yet: the
  default certificate does not contain the Walter hostname, no Walter Nginx
  route is installed, and the public endpoint remains unavailable.
- The value-free production database plan returned `ready`: exactly five
  Walter resource bindings, one Walter secret boundary, and one disabled OIDC
  client remain to be created. The accepted Titus provisioning contract still
  verifies enabled with five bindings, one boundary, one client, and one active
  unexpired owner after the shared refactor.
- RED coverage failed first on the absent shared registry, authorization,
  provisioning modules, and absent route activation behavior. GREEN now uses
  one typed deployment registry and one canonical authorization/provisioning
  path for both Titus and Walter; presentation code has no agent-name policy.
- Source gates pass: 86 Jest suites with 971 tests, TypeScript, the production
  Next.js build, Titus and Walter deployment qualifiers, and `git diff --check`.
  The sandbox-only Google Fonts failure recurred; the identical build passed
  with network access. The dependency audit remains the inherited 7 total/3
  production findings recorded by the prototype and this increment adds none.

**Activation decision**: source is ready for review and publication. T022 is
not complete until the application increment is deployed, the Walter records
are applied disabled then enabled, the candidate is started, Walter TLS/Nginx
is activated, unauthenticated access fails closed, and rollback readiness is
reverified in that order.
