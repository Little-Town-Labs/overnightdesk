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

## T022 controlled activation — 2026-07-22T17:37:13Z to 18:07:35Z

- PR 92 was squash-merged at `3c36e75`. Vercel production deployment
  `dpl_3T1UxPdFcLkscNjiygrqv72M1QCs` reached Ready on all live aliases after
  the generic canonical Open WebUI authorization controls were installed as
  encrypted production values.
- Before any public exposure, the value-free production plan returned the
  exact ready contract. Walter use case 0 was created with one active owner
  membership, five resource bindings, one isolated secret boundary, and one
  disabled OIDC client; post-apply verification returned
  `verified/disabled`.
- The merged Walter candidate then passed private qualification with no
  published port or public route, a distinct retained volume and Phase
  boundary, an unprivileged read-only container, no direct secret or
  OpenRouter Docker environment, and a value-free OAuth log sentinel.
  Candidate-only restart persistence passed without restarting native
  `hermes-walter`.
- Only Walter's OIDC client was enabled next. The record set re-verified
  `enabled` with the same exact counts before TLS or Nginx changed.
- The HTTP challenge route passed Nginx syntax, Let's Encrypt issued the
  `walter-chat.overnightdesk.com` certificate through 2026-10-20, and the
  reviewed TLS route passed a second syntax check and reload. Anonymous Walter
  and Titus chat requests each returned HTTP 401 with valid TLS.
- Final health evidence: Walter and Titus Open WebUI were healthy; native
  Walter/Titus, Nginx, and Ops were running; all six containers reported
  restart count zero; both Ops health listeners returned HTTP 200; Walter's
  native dashboard returned HTTP 302 to platform sign-in and HTTP 200 at its
  unauthenticated status endpoint. Walter remained `openai-codex` with
  default `gpt-5.6-sol`.
- Rollback remains ordered and value-preserving: disable only Walter's OIDC
  client, remove the Walter route and stop its candidate, retain its volume
  and Phase records, and verify Titus plus native Walter health.

**Activation decision**: T022 passes. The Walter boundary is publicly active
but not yet accepted. T023-T026 remain required for controlled denial and
restoration, chat/history and session lifecycle, cross-surface health and
rollback readiness, and authenticated owner acceptance.

## T023 controlled membership denial and restoration — 2026-07-22T18:36:05Z to 18:42:56Z

- The owner first confirmed Walter loaded through SSO and that no Titus
  identity or conversation appeared. The same use-case-scoped owner
  membership row was then changed through bounded, audited non-member,
  suspended, and expired windows and restored immediately after each check.
- The membership-filtered parent workspace returned fail-closed HTTP 404 for
  all three denial states without rendering Walter or Titus chat content.
  The direct Walter chat boundary independently returned HTTP 401 during the
  repeated expired window, proving the edge as well as the parent workspace.
- Metadata-only audit review found one canonical `not_authorized` denial and
  one Walter edge `not_authorized` denial in each non-member and suspended
  window. The direct expired window recorded two canonical and two Walter edge
  denials from the page request, with zero Titus edge successes and zero
  forbidden email, raw-subject, user-ID, cookie, password, token, or secret
  detail keys across every bounded window.
- The owner confirmed restoration after every state and completed the final
  restored Walter load. Final database state is one active, use-case-scoped
  owner membership with no suspension, expiry, or revocation.
- Walter and Titus Open WebUI remained healthy; native Walter/Titus, Nginx,
  and Ops remained running; all protected containers retained restart count
  zero. Nginx syntax passed, Walter remained `openai-codex` with default
  `gpt-5.6-sol`, and Walter Open WebUI, native Walter, and Nginx produced zero
  bounded error signatures. Public checks returned HTTP 200 for the site and
  Walter native status and HTTP 401 for anonymous Walter and Titus chat.
- Owner feedback identified that the embedded Open WebUI region is too small.
  This remains a shared responsive composition issue for T026 acceptance, not
  a Walter-specific interface branch.

**T023 decision**: pass. Controlled membership denial/restoration and zero
cross-agent disclosure are accepted. T024-T026 remain open for chat/history
and session lifecycle, cross-surface/rollback verification, responsive owner
acceptance, and final production acceptance.

## T024 chat persistence and session lifecycle — 2026-07-22T18:46:20Z to 19:19:26Z

- The owner sent a live Walter message, received a complete response, and saw
  the conversation in the Open WebUI sidebar. The pre-restart database held
  one user, one active chat, one chat owner, zero orphaned chats, and passed
  SQLite integrity.
- Restarting only `open-webui-walter.service` recreated the Walter Open WebUI
  container on the same named volume. Native Walter, Titus Open WebUI, native
  Titus, and Nginx retained their exact start times. The same metadata counts
  and integrity result survived, and the owner reopened the prior sidebar
  conversation and received a second live response after restart.
- Explicit logout removed the active Better Auth authority and the retained
  Walter browser state failed closed. The stale Open WebUI client rendered a
  generic internal-error page, but sanitized Nginx evidence recorded HTTP 401
  for the page and protected assets, zero HTTP 500 responses, and
  `session_required` audit denials. Reauthentication restored the existing
  conversation.
- At the natural five-minute renewal threshold, the owner completed a live
  chat. The provider revoked the refresh token created at `18:53:13Z`, issued
  a replacement seven-day token at `19:04:02Z`, and issued an exact 900-second
  access token with `openid email profile offline_access`. The owner observed
  a slow response of roughly half a minute; current access logs do not record
  duration, but request sequencing showed completion without OAuth, refresh,
  application, Hermes, or Nginx errors and with low container utilization.
- The reauthentication path produced two Better Auth sessions 23 seconds
  apart. The controlled expiry targeted exactly that fresh pair and no older
  sessions. Walter returned HTTP 401 with `session_required`; both rows became
  inactive, one was removed automatically on access, and fresh login restored
  the retained chat.
- A cutoff after expiry isolated exactly one new active session. Guarded
  revocation deleted only that row and changed no older session. The stale
  Open WebUI client again rendered a generic internal-error page while Nginx
  recorded only HTTP 401 and zero HTTP 500 responses; audit evidence contained
  `session_required`, zero `authorization_unavailable`, and no forbidden
  identity or credential keys. Final reauthentication restored sidebar
  history and a live Walter response.
- Final metadata holds one Open WebUI user, three active chats owned by that
  user, zero orphaned chats, and integrity `ok`. Walter and Titus Open WebUI
  are healthy; native Walter/Titus, Nginx, and Ops are running; protected
  containers retain restart count zero; Walter remains `openai-codex` with
  default `gpt-5.6-sol`; and post-restart error signatures are zero.
- Two owner-visible issues remain for T026: the embedded chat region is too
  small even at maximum browser size, and stale Open WebUI state presents a
  misleading generic 500 page for some underlying HTTP 401 logout/revocation
  denials.

**T024 decision**: pass for chat, persistence, and security/session behavior.
The sizing and denial-rendering feedback remains an explicit owner-experience
gate rather than being treated as a failed authorization boundary. T025-T026
remain open for cross-surface/rollback verification, responsive correction,
and final owner acceptance.

## T025 cross-surface verification and correction — 2026-07-22T19:24:00Z to 20:07:43Z

- The owner confirmed Titus chat passed. Anonymous Walter and Titus chat
  remained fail closed with HTTP 401; Walter's public native-dashboard root
  redirected to platform authentication and its status endpoint returned HTTP
  200.
- Both isolated Open WebUI containers were healthy, native Walter and Titus
  were running, all four retained restart count zero, and both native
  dashboard status probes returned HTTP 200. Walter retained exactly one
  stored provider with `openai-codex` active and default `gpt-5.6-sol`.
- Walter's Advanced Dashboard action was initially absent. Read-only
  reconciliation found the native dashboard and OIDC client healthy but the
  owner's sole platform `instance` still had null canonical use-case/runtime
  foreign keys. The shared UI correctly failed closed instead of falling back
  by agent name or array position.
- A reusable canonical platform-instance plan/apply/verify contract was added
  with ten RED/GREEN cases covering exact selection, current owner authority,
  safe dashboard state, ambiguity, conflict, expiry, suspension, revocation,
  and idempotency. The write is one atomic compare-and-set and emits one
  metadata-only audit record; CLI output contains counts and state only.
- The production plan found exactly one eligible unlinked instance. Apply
  linked only its existing canonical use-case/runtime foreign keys and both
  immediate and separate verification returned one `verified_noop`. Public,
  runtime, provider, and restart evidence remained unchanged afterward.
- The shared desktop chat-size regression failed first on the collapsing
  `lg:min-h-0` override. GREEN gives every embedded agent chat at least 70% of
  desktop viewport height while preserving the existing mobile minimum. The
  complete Jest suite passed with 87 suites and 983 tests; TypeScript, the
  network-enabled production build, both deployment qualifiers, and all 24
  Chromium lifecycle/responsive tests passed. The dependency audit remains the
  inherited seven findings and this increment adds no package.

**T025 decision**: pass. Objective health, provider, linkage, isolation, and
rollback checks passed, and the owner confirmed Walter's newly available
Advanced Dashboard opened successfully after the canonical link. The larger
shared chat surface remains source-only until publication and owner acceptance
in T026.

## Corrective layout and persona source gate — 2026-07-22

- The shared workspace now gives embedded chat the near-viewport primary area
  and bounds identity, capability, and fallback context to a 17rem desktop
  rail. The mobile order remains selector, actions, chat, then context.
- Titus remains chat-only and shows Advanced Dashboard as not deployed with no
  action. Walter retains the exact linked native dashboard action. The same
  capability component renders both states without an identity branch.
- Active exact-runtime owners may attach or remove a PNG, JPEG, or WebP persona
  logo up to 256 KiB. Server validation checks structure, bounded dimensions,
  type, and digest; mutation responses and audit records contain no filename or
  image bytes. Other roles, suspended owners, and expired owners fail closed.
- Open WebUI keeps the existing provider-facing `hermes-agent` ID but receives
  one deployment-owned display override named Titus or Walter with the
  canonical persona logo. One shared idempotent SQLite reconciler preserves
  chats and unrelated records, grants public read only, removes wildcard
  write, and has a separate read-only verification mode. Arena is forced off
  with an empty model list for both deployments.
- The additive `0010` platform migration has a guarded, value-free
  `identity:persona-schema:plan/apply/verify` workflow. It rejects mixed schema
  state, destructive or unexpected SQL, and unconfirmed production writes;
  successful apply records one metadata-only platform audit event.
- Focused logo, route, directory, component, schema, seeder, and deployment
  qualifiers passed. The complete suite passed 91 suites with 1,026 tests;
  four database suites were safely skipped without a disposable test database.
  TypeScript, all 24 Chromium scenarios, the network-enabled production build,
  both Open WebUI deployment qualifiers, and `git diff --check` passed.
- The transitive `sharp` package is overridden from the vulnerable 0.34 line to
  0.35.3 and Node 20.9+ is explicit. `npm audit --audit-level=high` now passes;
  five moderate inherited findings remain (Better Auth has no available fix,
  while npm's esbuild remedy is a breaking Drizzle downgrade).

**Corrective source decision**: ready for review. Database migration, Vercel
publication, Aegis persona reconciliation, browser confirmation that Arena is
absent and Titus/Walter names/logos are present, and final layout acceptance
remain required before T026/T030/T031 close.

## Corrective read-only production preflight — 2026-07-22T23:22:43Z

- Titus and Walter Open WebUI systemd services are active and both containers
  are healthy. Anonymous public requests remain fail closed with HTTP 401.
- Both durable databases expose the exact pinned v0.10.2 `model`,
  `access_grant`, and `user` columns required by the reconciler. Neither
  database currently contains a custom model presentation or model grant, so
  the increment is an additive presentation write rather than a replacement.
- Each isolated upstream returned exactly one value-free model ID,
  `hermes-agent`, matching both reviewed persona data files. Each database has
  exactly one admin owner record available for the deployment-owned model row.
- No route, container, database, user, model, grant, secret, or runtime state
  changed during this preflight. No secret value was printed.

**Preflight decision**: the source contract matches live production. Publication
may proceed through review; migration and Aegis reconciliation remain separate
post-merge writes with rollback and authenticated owner acceptance gates.

## T040-T041 discovered Walter native-dashboard binding drift — 2026-07-24

- Final T026 owner acceptance stopped when Walter's Advanced Dashboard sent the
  already-authenticated owner back through platform sign-in repeatedly. Titus's
  native Advanced Dashboard continued to work, and Walter's name/logo and
  Arena suppression were visible.
- PR 128 forced the legacy tenant verifier to bypass Better Auth's cookie cache.
  The change remains valid session-revocation hardening, but the exact deployed
  owner retest still returned HTTP 401 at `/api/auth/verify-tenant`.
- Correlated value-free evidence proved the current platform session, active
  owner membership, Walter Chat/native use-case and runtime IDs, enabled native
  OIDC client, active hostname, running instance, and Walter Chat authorization
  all remained valid. Canonical native-dashboard audits recorded
  `not_authorized`.
- Exact binding inspection found the remaining fail-closed drift: Walter's
  `overnightdesk/platform_instance` binding remained `compatibility`, and the
  linked native `better-auth/oidc_client` binding was absent. Feature 024's
  stricter shared dashboard context correctly requires both bindings active.
- RED/GREEN coverage now promotes only an exact same-use-case/runtime
  `compatibility` dashboard binding to `active`; copied, duplicate, and
  `rollback` records remain blocked. The same shared reconciler serves Titus
  and Walter, while a Walter fixed-target OIDC command reuses the existing
  shared OIDC binding planner/state writer.
- Plan/apply/verify summaries contain counts and state only. Apply requires
  exact Walter confirmations, a bounded audit actor, and an explicit private
  runtime qualification sentinel. No runtime, membership, OIDC-client,
  Nginx, provider, model, chat, user, secret, or volume mutation has occurred
  during diagnosis or source implementation.

**T041 decision**: source repair is GREEN and remains undeployed. Review,
publication, exact two-binding reconciliation, and authenticated owner retest
remain T042-T043.

### T042 first quality-gate remediation

- The first Ringer Sol review correctly returned `REQUEST CHANGES` before
  publication. It found that the compatibility promotion was not compare-and-set,
  unexpected same-scope dashboard identifiers were filtered out before planning,
  Walter could accept Titus's confirmation literal, and the OIDC binding write
  committed separately from its audit.
- The shared platform-binding command now inspects both exact global identifiers
  and every required provider/kind record in the canonical runtime scope. Each
  promotion is constrained by exact ID, scope, provider, kind, value, and current
  `compatibility` state.
- Inserts, guarded promotions, and their metadata-only audit now execute in one
  PostgreSQL statement whose affected-row invariant aborts the entire statement
  on any stale or partial plan. Target-specific confirmation tests prove Walter
  rejects Titus's phrase and Titus rejects Walter's phrase.
- The shared OIDC store now exposes one audited reconciliation primitive. Its
  exact binding insert or compare-and-set update and audit record commit in one
  statement; concurrent exact writers converge without attributing their write
  to this operator.
- Behavioral coverage now includes OIDC insert, update, no-op, atomic audit
  failure, post-plan copied-scope drift, and concurrent convergence. The
  disposable-database integration contract covers unexpected same-scope
  inspection and a mixed insert/promotion rollback race without using production.

**Remediation decision**: the second independent Ringer Sol review returned
`APPROVE` with no critical or required findings. Focused coverage passed 34/34;
the complete suite passed 1,200 tests across 109 suites with 27 tests and four
disposable-only suites skipped; TypeScript, the production build, dependency
high-threshold audit, and diff checks passed. The final value-free production
plan remains exact: zero bindings to create and one Walter platform binding to
activate. Publication, exact deployed-revision verification, OIDC plan/apply
after the base binding is active, and authenticated owner acceptance remain
open under T042-T043.

## T042-T044 terminal production evidence — 2026-07-24

- PR 129 squash-merged at
  `99edf7d819f02f31feb021197cddf708584d0244` after the remediation review
  approved the guarded atomic reconciliations. Both Vercel checks passed and
  production deployment `dpl_6xhS41DjPcSxY8qiNrtDXuEUT5Kk` reached Ready on
  the live aliases with that exact Git SHA.
- Read-only production preflight passed for both native dashboards, both chat
  surfaces, Walter's unchanged `openai-codex`/`gpt-5.6-sol` provider path,
  Nginx, both Ops listeners, and every scoped container.
- The Walter platform-binding plan found exactly one same-scope
  `compatibility` record to promote and zero inserts. The atomic apply activated
  only that record; independent verification returned two exact active
  canonical bindings.
- The separately qualified Walter OIDC plan found exactly one absent
  runtime-scoped binding. Its audited atomic apply created only that record;
  independent verification returned one exact active runtime-scoped OIDC
  binding.
- All scoped containers retained their exact identities, start times, running
  or healthy states, and restart count zero. No service restart, model/provider,
  session, membership, OIDC-client, route, certificate, user, chat, volume, or
  unrelated state changed.
- The authenticated owner then confirmed Walter's Advanced Dashboard opens and
  works as expected instead of looping through platform sign-in. Together with
  the already-confirmed Walter name/logo and Arena absence, this completes
  T026 and T043.
- Platform-standard PR 44 merged at
  `38e48fbe59af900db62aed450ad22b154ad33f99`. The clean production-mounted
  checkout at `/home/ubuntu/overnightdesk-platform-standard` fast-forwarded to
  that exact revision and only `overnightdesk-ops` restarted. All 16 WHAT YAML
  files parsed; the complete mounted WHY/HOW/WHAT tree matched; both Ops
  listeners returned HTTP 200; relevant Ops errors were zero; and every scoped
  tenant/proxy container retained its identity and restart count zero.

**Closeout decision**: T026, T030, and T042-T044 are complete from exact
production, owner, review, standard, and ledger evidence. T031 remained open
until this 43/44 evidence state passed review, merged, reached Ready on Vercel,
and received terminal deployment verification.

## Terminal publication verification — 2026-07-24

- Platform-standard PR 45 merged at exact
  `90b46c171bc921eab27f3e782cf112915aad9603`. The actual production-mounted
  checkout at `/home/ubuntu/overnightdesk-platform-standard` fast-forwarded to
  that revision, all 16 WHAT YAML files parsed, the mounted WHY/HOW/WHAT tree
  matched at SHA-256
  `697c32446dc0e7b212a44b4ec42210fcf4a51f29cdb50f6d4b0e7fa50107a173`,
  both Ops listeners returned HTTP 200, relevant errors were zero, and all
  scoped tenant/proxy containers retained their identities and restart count
  zero.
- OvernightDesk PR 130 merged at exact
  `bf4bad186b9c05198ee54dff389b96ff1e4c91ed` after both Vercel checks passed.
  Production deployment `dpl_DTwEUDTfVaxaJWHWYZwXaSqFerR6` independently
  reported that exact Git SHA on `main` as Ready with all live aliases.
- Post-deployment verification returned HTTP 200 for the public application,
  HTTP 307 for the anonymous Dashboard entry, and HTTP 401 for anonymous Walter
  Chat, Titus Chat, and the Titus native dashboard. Live Nginx configuration
  confirmed that Walter's canonical dashboard does not use the guessed
  `walter-dashboard.overnightdesk.com` hostname, so that invalid probe was not
  treated as a production failure.
- Both container-internal Ops listeners returned HTTP 200, recent Ops and
  Nginx error signatures were zero, and Nginx, Hermes Walter, Hermes Titus, and
  both Open WebUI containers remained running with restart count zero. Titus and
  both Open WebUI containers remained healthy.
- The exact production result is recorded in
  `/home/frosted639/src/overnightdesk-suite/deploys.log`. No Aegis checkout,
  service, runtime, email, retry, provider, model, secret, route, authority,
  membership, certificate, database, DNS, volume, chat, memory, or user-data
  state changed during the application evidence publication.

**Terminal decision**: T031 is complete. Feature 023 is complete at 44/44.
Feature 026's Titus Nemotron experiment is parked; no production model change
was made.
