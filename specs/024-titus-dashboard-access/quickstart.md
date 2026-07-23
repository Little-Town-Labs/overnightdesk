# Quickstart: Titus Advanced Dashboard Access

This runbook is intentionally pre-activation. Do not enable production routing
until every preceding gate passes and the owner authorizes the controlled
production increment.

## 1. Local contract gate

```bash
npm test -- --runInBand
npm run build
git diff --check
```

Confirm that the new RED tests were observed failing before implementation and
that the final run covers exact-host authorization, canonical membership
lifecycle, legacy compatibility, reconciliation idempotency, Nginx/runtime
contracts, and all four selected-agent surfaces.

### Foundation evidence (2026-07-22)

- T004 RED: Jest could not locate `@/lib/dashboard-authorization` before the
  authorization planner and exact-host store existed.
- T005-T006 GREEN: the focused authorization suites passed 19/19 tests.
- T007 RED: Jest could not locate
  `@/lib/dashboard-instance-reconciliation` before the pure planner existed.
- T008 GREEN: the pure reconciliation suite passed 20/20 tests.
- T009 RED: Jest could not locate
  `@/db/dashboard-instance-reconciliation-store` before the guarded store and
  command lifecycle existed.
- T009-T010 GREEN: all four foundation suites passed 45/45 tests; TypeScript
  emitted no errors and `git diff --check` passed.

## 2. Static Titus qualification

```bash
tenants/hermes-titus/scripts/qualify.sh
npx jest src/lib/__tests__/hermes-nginx-config.test.ts --runInBand
```

Required results include:

- self-hosted OIDC required before non-loopback binding;
- no `--insecure`;
- zero published ports;
- private network only;
- exact Titus host/upstream;
- no credential literals;
- no Titus/Walter UI or authorization branch.

### Local MVP evidence (2026-07-22)

- T011 RED: the Titus identity assertion found no canonical dashboard hostname
  or platform-instance binding. GREEN preserves the single existing
  `hermes-titus` container and `hermes-titus-data` volume while adding only the
  two dashboard selectors.
- T012 RED: Jest could not locate the shared selected-agent capability resolver.
  GREEN renders Titus Advanced Dashboard as available on Overview, Chat,
  Settings, and Admin from one runtime-linked data path with no persona branch.
- T013 RED: the Titus qualifier rejected the old loopback-only source because
  the protected private-network contract was absent. GREEN passed with
  self-hosted OIDC configured before the non-loopback bind, no `--insecure`, no
  published port, an atomic config replacement, and exact-runtime operations.
- T014 RED: all three Titus Nginx assertions failed because no candidate source
  existed. GREEN passed four Nginx tests covering the exact host/upstream,
  bodyless TLS-SNI verifier, every-path auth, forwarding/WebSocket headers, and
  certificate-only HTTP bootstrap.
- T019 RED: Overview, Settings, and Admin still rendered the fixture dashboard
  as not deployed. GREEN passed all 24 Chromium scenarios, including retained
  Chat during dashboard popups, single-agent isolation, keyboard focus, and
  overflow checks at 320, 768, 1024, and 1440 pixels.
- T020 GREEN: the identity, rendered capability, runtime, Nginx, TypeScript,
  shell syntax, and diff gates passed. The Next.js 15.5.18 production build
  passed with an intentionally unreachable build-only database URL and no
  production credentials; the DNS-enabled run was required for Google Fonts.

### Current-authority evidence (2026-07-22)

- T022 RED: the authorization/token suites produced 14 failures because Titus
  remained on legacy-owner authority and Walter was the only canonical special
  case. The binding lifecycle suites produced seven more failures because no
  runtime-scoped native-dashboard OIDC binding was reconciled.
- T025 GREEN: one agent-agnostic canonical-link path now authorizes exact
  Titus and Walter use-case/runtime membership at authorization-code and token
  time. Partial links and unavailable membership fail with a fixed value-free
  error; only instances with both canonical IDs absent retain exact-owner
  compatibility. A disabled client owns one exact runtime-scoped
  `better-auth`/`oidc_client` rollback binding, which becomes active only with
  the client and returns to rollback on disable, recovery, or error.
- The public-client contract was rechecked against the current Hermes and
  Better Auth documentation: issuer discovery, public client without secret,
  authorization code, S256 PKCE, exact callback, and `openid profile email`
  remain the supported configuration.
- T026 RED/GREEN: four new audit assertions initially failed. The shared proxy
  authorizer now records only bounded denial reason, authority mode, optional
  resolved instance reference, sanitized request ID, and timestamp-managed
  audit metadata. Host, user, email, name, URL, cookie, OAuth artifact,
  exception text, and raw client ID are absent.
- T023 RED: two Chromium cases failed on the old generic dashboard fixture and
  missing native-session expiry/reauthentication control. GREEN adds direct
  Titus dashboard expiry and reauthentication plus a normal-link fallback that
  discloses neither Walter nor Open WebUI content.
- T027 GREEN: the complete current-authority matrix passed 123/123 Jest tests
  across ten suites, including exact active-binding enforcement and reuse of an
  already-enabled client without downgrading its binding. Chromium passed 26/26
  scenarios covering logout, expiry, revocation, restoration, native
  reauthentication, direct URL, safe fallback, popup retention, cross-agent
  isolation, and responsive selected-agent surfaces.
- The final repository gate passed 1,104/1,104 runnable Jest tests (27 skipped),
  the Next.js 15.5.18 production build with an intentionally unreachable
  build-only database URL, Titus static qualification, four Nginx contracts,
  TypeScript, shell syntax, and `git diff --check`. The production build used
  external network access only to fetch the repository's Google-hosted fonts.

## 3. Read-only production preflight

Using the repository's Aegis workflow, verify before changes:

- `hermes-titus` and its private `/api/status` are healthy;
- `hermes-titus-data` exists;
- Titus Chat and Walter Chat return anonymous 401;
- Walter dashboard remains protected;
- all protected containers have zero unexpected restarts;
- current model/provider sentinels pass;
- Ops health is 200 on both listeners.

Append the value-free preflight result to the suite `deploys.log`.

### T028 production preflight evidence — 2026-07-23

- PR 98 was externally merged as `152ea59e`; its Vercel production deployment
  completed successfully. Public checks returned HTTP 200 for `www`, HTTP 307
  for the anonymous dashboard sign-in redirect, and HTTP 401 for anonymous
  Titus and Walter Chat.
- `hermes-titus`, `hermes-walter`, both isolated Open WebUI containers, Nginx,
  and Ops were running with restart count zero. Both Open WebUI containers were
  Docker-healthy, had no published ports, and retained their distinct named
  volumes. `hermes-titus-data` and the Walter runtime volume were present.
- Titus's current native dashboard returned healthy privately in its expected
  loopback baseline with authentication disabled. Walter's independent native
  dashboard returned healthy with self-hosted authentication required.
- Titus retained effective model `x-ai/grok-4.3`, reasoning effort `medium`,
  and OpenRouter delegation model `x-ai/grok-build-0.1`. Walter retained
  `openai-codex` as its sole active provider and default `gpt-5.6-sol`.
- Nginx syntax passed. The Titus dashboard DNS name already resolves, but its
  certificate and route are absent, so no public dashboard capability is
  active. Existing Titus and Walter Chat routes returned anonymous HTTP 401;
  Walter's native root/status returned HTTP 302/200.
- Both Ops health listeners returned HTTP 200 and `hermes-titus.service`
  remained active. No runtime, route, TLS, database, OIDC, provider, volume,
  session, chat, identity, or user-data write occurred.

### T029 additive binding precondition evidence — 2026-07-23

The first guarded assignment plan failed closed with `status: blocked`. A
value-free read-only diagnostic proved the schema and private runtime gate were
ready, found one canonical Titus identity, one membership, one active owner,
zero dashboard candidates, and zero matching platform-instance or hostname
bindings. The original Titus foundation planner also refused the changed
manifest as `canonical_state_drift`; it remains intentionally creation-only.
Neither command wrote production data.

The follow-up guarded additive reconciler passed its local RED/GREEN suites and
returned only:

```json
{
  "status": "ready",
  "bindingsToCreate": 2
}
```

Apply remains prohibited until the correction is reviewed, merged, and its
exact production deployment succeeds.

Correction qualification:

- Pure planner/store RED tests first failed on the absent modules and then
  passed 19 assertions covering missing, partial, exact, copied, duplicate,
  unconfirmed, actorless, unqualified-runtime, concurrent-writer, redacted
  failure, verify, and idempotent states. The combined existing assignment and
  new binding suites passed 45 of 45 assertions.
- The disposable Neon harness applied schemas 0009 and 0010, reproduced the
  pre-Feature-024 Titus foundation by removing only the two dashboard selectors,
  proved the creation-only foundation command blocked, and then passed the real
  Drizzle plan/apply/verify/retry path. It found one count-only audit with
  `bindingCount: 2`, passed all four identity/membership integration tests and
  the existing Open WebUI lifecycle, and force-dropped the disposable database.
  No production database was selected for mutation.
- The full Jest run passed 101 suites and 1,123 tests with the expected 4 suites
  and 27 tests skipped for environment-gated coverage. TypeScript, Prettier,
  `git diff --check`, the production build, and all 26 Chromium release
  scenarios passed. Review hardening also moved descriptor-contract validation
  ahead of every database inspection query and retained the 19 focused
  planner/store assertions.
- The official Next.js Maintenance LTS security patch moved the exact framework
  and matching ESLint config from 15.5.18 to 15.5.21. The high-severity audit
  finding cleared; `npm audit --audit-level=high` exits successfully with five
  inherited moderate findings. The Better Auth resource-indicator issue has no
  available fix and this repository's Hermes OIDC boundary explicitly rejects
  every resource indicator; the remaining findings are the non-production
  Drizzle CLI's old esbuild toolchain and are not accepted through a forced
  breaking downgrade.

## 4. Plan the canonical assignment

First reconcile the two exact binding prerequisites through the merged guarded
command. Plan is read-only:

```bash
npm run identity:titus:dashboard-bindings:plan
```

Apply requires the private-runtime sentinel, a bounded non-secret actor, and
the exact confirmation. Then verify separately:

```bash
TITUS_DASHBOARD_PRIVATE_RUNTIME_QUALIFIED=PRIVATE_TITUS_DASHBOARD_HEALTH_VERIFIED \
TITUS_DASHBOARD_BINDING_ACTOR=operator:feature-024-production \
TITUS_DASHBOARD_BINDING_CONFIRM=APPLY_TITUS_DASHBOARD_IDENTITY_BINDINGS \
  npm run identity:titus:dashboard-bindings:apply

npm run identity:titus:dashboard-bindings:verify
```

The reconciler inserts only missing exact runtime-scoped bindings, records one
count-only audit, re-reads production state, and must converge to
`verified_noop` with two verified bindings. It refuses partial canonical
identity, copied bindings, wrong states, ambiguous live identifiers, an
unqualified private runtime, or absent confirmation.

After the binding verify passes, run the database assignment command with the
production environment loaded through the existing guarded process:

```bash
TITUS_DASHBOARD_PRIVATE_RUNTIME_QUALIFIED=PRIVATE_TITUS_DASHBOARD_HEALTH_VERIFIED \
  npx tsx scripts/dashboard-instance-reconciliation.ts plan
```

Expected first-run assignment output contains `status: ready` and one planned
projection, with no IDs, hostnames, emails, or connection details. Any
`blocked` result stops the rollout.

### T029a-T030 production checkpoint — 2026-07-23

PR 99 merged as `fb53ce6` after both Vercel checks passed, and the exact merge
commit's production deployment completed successfully. From merged main, the
binding plan returned `ready` with two bindings to create. Guarded apply and a
separate verify each returned `verified_noop` with exactly two bindings
verified. The subsequent read-only assignment plan returned `ready` with one
assignment to create.

The first confirmed assignment apply failed closed with the bounded
`Dashboard assignment apply failed` error. A fresh read-only plan still
returned `ready` with one assignment, proving no projection survived. Bounded
production schema metadata showed `instance.id` is non-null with no database
default. The raw SQL insert had omitted that column because Drizzle's
TypeScript-side UUID default does not run for raw SQL; its CTE therefore
created neither the projection nor its audit.

A disposable Neon regression reproduced the same RED failure, then passed
GREEN after the command generated one UUID in the application and inserted it
explicitly. The corrected harness passed the real plan/apply/separate-verify
path, asserted exactly one count-only assignment audit, completed all four
identity/membership integration tests plus the existing Open WebUI lifecycle,
and force-dropped the disposable database. Production retry remains prohibited
until this correction is reviewed, merged, and its exact deployment succeeds.

## 5. Apply and verify canonical linkage

After the existing loopback dashboard and retained runtime pass the private
preflight, run the explicit confirmed apply and then the separate verify
command. Never place confirmation values, cookies, tokens, or database URLs in
evidence.

The apply command requires
`TITUS_DASHBOARD_ASSIGNMENT_CONFIRM=APPLY_CANONICAL_DASHBOARD_ASSIGNMENT` and a
bounded `TITUS_DASHBOARD_ASSIGNMENT_ACTOR` value. Both apply and verify also
require the private-runtime qualification sentinel shown above.

Expected verify output is `status: verified_noop` with one assignment count.

PR 100 merged as `2d1f12a` after both Vercel checks passed, and the exact merge
commit's production deployment succeeded. A final read-only plan still
reported one ready assignment. The corrected confirmed apply and a separate
verify both returned `verified_noop` with exactly one assignment verified.
T030 is complete. No OIDC, route, TLS, DNS, service, runtime, provider, volume,
chat, secret, or user-data state changed in that transaction.

## 6. Install disabled and qualify privately

Create the public OIDC client and its exact runtime-scoped resource binding in
disabled state, stage the exact non-secret client contract through protected
non-logging file input, install the Nginx route disabled, and restart only
Titus:

```bash
npm run identity:titus:dashboard-oidc:plan

TITUS_DASHBOARD_OIDC_CONFIRM=ENSURE_TITUS_DASHBOARD_OIDC_DISABLED \
  npm run identity:titus:dashboard-oidc:ensure

npm run identity:titus:dashboard-oidc:verify-disabled

TITUS_DASHBOARD_OIDC_CLIENT_FILE=/tmp/overnightdesk-titus-dashboard-oidc-client-id \
  tenants/hermes-titus/scripts/deploy-aegis.sh install-disabled

tenants/hermes-titus/scripts/deploy-aegis.sh verify-restart-persistence
```

The ensure command is fixed to the exact canonical Titus projection, emits
status only, creates a disabled public client with one runtime-scoped rollback
binding, and atomically stages its opaque ID in a mode-600 local file. The
deployment validates that file without printing it, installs it mode 0400 on
Aegis, and injects it into the mode-0440 runtime environment. Repository config
contains only a placeholder. Any missing, malformed, copied, noncanonical, or
non-disabled state stops the rollout.

The first pre-production trace found that the database lifecycle generated an
opaque client while the original runtime source hard-coded a different value.
No client was created and Aegis was not touched. RED runtime-contract tests
captured the absent protected staging path. GREEN passed four runtime staging
assertions, the Titus shell qualifier, 26 focused OIDC tests, and the full
disposable database command sequence: plan, confirmed ensure, disabled verify,
protected local staging, existing identity/Open WebUI lifecycle, staged-file
cleanup, and force-drop.

PR 101 merged as `f95dc25` after both checks passed, and the exact merge
commit's production deployment succeeded. The production plan reported one
ready canonical target; confirmed ensure and a separate verify created one
disabled public client with one rollback-scoped binding and staged only its
opaque ID. The route-disabled Aegis installation and restart-persistence check
both returned `healthy_private_disabled` with no published ports. Final
read-only evidence showed the protected file root-owned mode 0400, the named
volume retained, Titus and both chats healthy, Walter's container unchanged,
and Nginx/Ops running. T031 is complete.

The first T032 rollback rehearsal failed closed: the route remained absent,
OIDC remained disabled, native auth remained required, and every compared
service and volume was retained, but systemd's `ExecStartPre` volume preparation
overwrote the one-time loopback launcher copy with the candidate launcher.
The live dashboard therefore remained private-network bound rather than
loopback bound. A RED regression captures the ordering defect. Rollback must
use a root-owned persistent marker that makes every volume-preparation pass
select the loopback launcher, verify the live `127.0.0.1:9119` process, and
require a separately reviewed deployment before T032 is retried.

### T032a-T032 durable rollback checkpoint — 2026-07-23

The RED runtime regression reproduced the systemd ordering defect. GREEN added
a root-owned mode-0400 rollback marker that makes every
`prepare-volume.sh` execution select the loopback launcher while present,
rejects invalid marker state, and is cleared by candidate installation. The
five focused runtime tests, Titus static qualifier, shell syntax, formatting,
diff, and secret-sentinel checks passed.

PR 102 merged as `389e8d2` after both checks passed, and its exact production
deployment succeeded. The reviewed source was synchronized without restarting
Titus. The repeated rollback then returned `healthy_loopback_rollback`, proved
the live dashboard process bound only to `127.0.0.1:9119`, confirmed no
published host port or Nginx route, and retained every named Titus and Walter
runtime/chat volume.

A second independent Titus-only systemd restart retained the mode-0400 marker
and loopback binding. Walter, both isolated Open WebUI containers, Nginx, and
Ops retained their exact pre-rehearsal container identities and zero restart
counts. Candidate restoration reused the protected client-ID file, cleared the
marker, restored private self-hosted authentication with the public route still
absent, passed restart persistence, and separately verified the exact OIDC
client remained disabled. T032a and T032 are complete.

Verify:

- the dashboard advertises self-hosted auth;
- direct private requests require a native session;
- Nginx can reach `hermes-titus:9119` on the private network;
- no host port is published;
- Chat and visible history persist;
- Walter is unchanged;
- a repeated prepare/plan is an idempotent no-op.

## 7. Activate DNS, TLS, OIDC, and route

Temporarily activate only the exact Titus dashboard boundary for the
owner-directed qualification matrix. This is not production acceptance. Then
prove:

- HTTPS certificate and hostname are exact;
- anonymous direct access is denied;
- authenticated active Titus membership reaches native login/dashboard;
- Overview, Chat, Settings, and Admin all show Advanced Dashboard available;
- Chat stays open when the dashboard launches;
- all expected Titus Kanban boards are visible and remain scoped to Titus;
- no other agent capability is disclosed.

### T033 controlled activation checkpoint — 2026-07-23

The public preflight returned HTTP 200 for `www`, found no matching Titus
dashboard certificate, and confirmed the dashboard Nginx route was absent with
valid existing Nginx configuration. The guarded database command activated the
exact public PKCE OIDC client and runtime-scoped binding; a separate
`verify-active` command passed before and after route activation.

The reviewed deployment installed only the Titus dashboard HTTP ACME stub,
issued the exact `titus-dashboard.overnightdesk.com` certificate valid through
2026-10-21, installed the protected TLS proxy, and passed Nginx syntax. Public
anonymous access and a direct-Aegis request using the exact hostname both
returned HTTP 401. The response included HSTS, `nosniff`, `DENY` framing,
strict-origin referrer, and permissions-policy headers.

Private native status remained healthy with self-hosted authentication
required. Titus, Walter, both isolated Open WebUI containers, Nginx, and Ops
remained healthy or running with zero inspected restart counts. Bounded native
authentication and Nginx upstream error sentinels were zero. This is controlled
production qualification only: membership and session-lifecycle mutations,
Titus Kanban-board acceptance, and final owner acceptance have not begun.
T033 is complete.

## 8. Controlled authority and lifecycle matrix

With owner-directed checkpoints, test and restore each state independently:

- non-member;
- suspended member;
- expired member;
- platform logout;
- Hermes session expiry;
- OIDC client revocation;
- direct URL after each denial;
- final valid reauthentication.

Every denial must fail closed at both proxy and native boundaries. Record only
bounded result labels and timestamps.

### T034a guarded membership qualification command

Do not edit the production membership with ad hoc SQL. The fixed-target command
resolves exactly one use-case-scoped Titus owner membership through the active
canonical dashboard projection, public OIDC client, and active runtime-scoped
OIDC binding. It blocks copied, ambiguous, runtime-scoped, non-owner, inactive,
disabled, rollback, or drifted records. Output contains only state, status, and
count fields.

For each denial window, run a read-only plan, the exact confirmed apply, and a
separate verify:

```bash
npm run identity:titus:membership-qualification:plan -- non_member
TITUS_MEMBERSHIP_QUALIFICATION_ACTOR=operator:feature-024-production \
TITUS_MEMBERSHIP_QUALIFICATION_CONFIRM=BEGIN_TITUS_NON_MEMBER_DENIAL \
  npm run identity:titus:membership-qualification:apply -- non_member
npm run identity:titus:membership-qualification:verify -- non_member

npm run identity:titus:membership-qualification:plan -- suspended
TITUS_MEMBERSHIP_QUALIFICATION_ACTOR=operator:feature-024-production \
TITUS_MEMBERSHIP_QUALIFICATION_CONFIRM=BEGIN_TITUS_SUSPENDED_DENIAL \
  npm run identity:titus:membership-qualification:apply -- suspended
npm run identity:titus:membership-qualification:verify -- suspended

npm run identity:titus:membership-qualification:plan -- expired
TITUS_MEMBERSHIP_QUALIFICATION_ACTOR=operator:feature-024-production \
TITUS_MEMBERSHIP_QUALIFICATION_CONFIRM=BEGIN_TITUS_EXPIRED_DENIAL \
  npm run identity:titus:membership-qualification:apply -- expired
npm run identity:titus:membership-qualification:verify -- expired
```

The non-member window retains the exact row and changes only its authorization
status; it does not delete identity or membership history. The suspended and
expired windows retain active status while applying only their corresponding
denial timestamp. Every transition is an atomic compare-and-set with one audit
containing only `fromState`, `toState`, and `membershipCount`.

Restore immediately after the owner completes each browser denial checkpoint:

```bash
npm run identity:titus:membership-qualification:plan -- active
TITUS_MEMBERSHIP_QUALIFICATION_ACTOR=operator:feature-024-production \
TITUS_MEMBERSHIP_QUALIFICATION_CONFIRM=RESTORE_TITUS_AFTER_NON_MEMBER_DENIAL \
  npm run identity:titus:membership-qualification:apply -- active
npm run identity:titus:membership-qualification:verify -- active

# Use RESTORE_TITUS_AFTER_SUSPENDED_DENIAL after the suspended window.
# Use RESTORE_TITUS_AFTER_EXPIRED_DENIAL after the expired window.
```

Do not move directly from one denial state to another. If any check or apply
fails, plan the active state, use only the restore confirmation for the exact
current denial, verify active separately, and stop T034 before investigating.
Restoration resolves the canonical owner membership independently of dashboard
runtime or OIDC health so a degraded protected boundary cannot strand broader
Titus platform authority in a denial state.
The command does not change the OIDC client, route, runtime, session, provider,
volume, Chat data, or Walter.

#### T034a local guardrail evidence — 2026-07-23

- RED first failed because the fixed-target qualification planner and store did
  not exist. GREEN passed 25 focused planner and command tests covering exact
  target resolution, all denial/restoration transitions, state-specific
  confirmations, bounded actors, ambiguous/copied state, concurrent writers,
  value-free output, and fail-closed errors.
- A fresh disposable database applied every repository migration, rejected an
  unconfirmed write, completed non-member, suspended, and expired denial plus
  exact restoration through the real operator CLI, verified six metadata-only
  audits, and finished active. The suspended case deliberately stopped the
  dashboard projection, disabled its OIDC client, and moved its binding to
  rollback before restoring membership, proving the rescue path does not depend
  on the degraded boundary. The disposable database was force-dropped.
- The full repository run passed 105 Jest suites and 1,158 tests with the
  expected 4 suites and 27 environment-gated tests skipped. TypeScript, Node
  syntax, Prettier, `git diff --check`, and the Next.js 15.5.21 production build
  passed. `npm audit --audit-level=high` exited successfully with the same five
  documented moderate findings and no dependency change.
- PR 104 merged as `66ab257` after both checks passed, and its exact production
  deployment completed successfully. A fresh production read-only
  `plan -- non_member` returned `ready`, current `active`, desired
  `non_member`, and membership count one with no identifiers. T034a is
  complete. No production membership or session mutation was performed.

#### T034 controlled membership checkpoint — 2026-07-23

- A fresh guarded non-member plan found exactly one active canonical owner
  membership. The atomic transition and separate verification reached
  `non_member`; the owner observed HTTP 401 with no Titus content while Walter
  remained available and unchanged. Exact restoration and separate
  verification returned the membership to `active`, and the owner confirmed
  Titus access restored.
- A fresh guarded suspended-member plan again found exactly one active
  canonical owner membership. The atomic transition and separate verification
  reached `suspended`, but the owner could still access Titus. The window was
  immediately closed through the state-specific restoration and a separate
  active verification.
- Read-only source diagnosis found that the shared Drizzle membership lookup
  rejects inactive status and expired timestamps but does not reject non-null
  suspension or revocation timestamps. This contradicts the current-authority
  contract and explains why the status-based non-member check passed while the
  timestamp-based suspension check did not.
- T034 is stopped before the expired-member window. T034b requires a
  test-first shared-store correction, review, merge, exact production
  deployment, and fresh active-state plan before any controlled denial window
  resumes. No membership row was deleted; the exact membership is active.

#### T034b local current-authority correction — 2026-07-23

- The first disposable run exposed that the existing integration-test safety
  prefix skipped the shared-store suite under the membership harness. Changing
  only the disposable database name to the already approved
  `overnightdesk_identity_*` prefix activated the real test without weakening
  its production guard.
- RED then failed because an active-status membership with a non-null
  suspension timestamp was returned as authorized. GREEN added only null
  suspension and revocation timestamp predicates to the shared Drizzle lookup.
- The corrected disposable run passed the real shared-store assertions for
  enum-status suspension, timestamp suspension, timestamp revocation, expiry,
  inactive use case/runtime, exact runtime scope, and use-case-wide scope. It
  then completed all six guarded Titus denial/restoration transitions, verified
  six metadata-only audits, finished active, and force-dropped the disposable
  database.
- Sixty focused canonical-authorizer, dashboard-store, OIDC, and verifier-route
  tests passed. TypeScript emitted no errors.
- The full repository gate passed 105 suites and 1,158 runnable tests with the
  expected 4 suites and 27 environment-gated tests skipped. The Next.js 15.5.21
  production build passed with an intentionally unreachable database URL.
  Prettier, Node syntax, TypeScript, `git diff --check`, and
  `npm audit --audit-level=high` passed; the audit retained the same five
  documented moderate findings and no dependency changed.
- Spec Kit analysis found no new critical or high artifact conflict: FR-008 and
  SC-002 remain explicit, T034b now closes the discovered shared-store coverage
  gap, and the dependency order blocks T034 until merge, deployment, and a
  fresh active-state plan. Five-axis review found no required change: the
  correction is shared rather than Titus-specific, uses two parameterized null
  predicates in the existing query, adds no query or cache, exposes no value,
  and preserves the established fail-closed response.
- PR 106 merged as `cd168c7` after both checks passed, and its exact production
  deployment completed successfully. Post-deploy checks returned HTTP 200 for
  `www` and anonymous HTTP 401 for the Titus dashboard plus Titus and Walter
  Chat. A fresh production read-only suspended plan returned `ready`, current
  `active`, desired `suspended`, and membership count one. T034b is complete;
  no production authority or runtime state changed.

## 9. Persistence, rollback, and observation

Confirm an existing Titus chat and visible history before and after the exact
Titus restart. Rehearse rollback in this order:

1. disable the exact Titus OIDC client so the runtime-scoped OIDC binding moves
   to `rollback` and the dashboard projection auth becomes `disabled`;
2. disable the Titus dashboard Nginx route;
3. restore the loopback-only Titus runtime configuration and restart only
   `hermes-titus`;
4. verify the retained canonical projection and platform/hostname selectors
   are unchanged while the launch action is unavailable.

Prove Chat remains healthy while Advanced Dashboard becomes unavailable.
Restore the accepted candidate using the same exact records, then observe
Titus, Walter, both OpenWebUI deployments, Nginx, and Ops for unexpected
restarts, auth sentinels, or 5xx responses.

## 10. Closeout

After owner acceptance:

- update `spec.md`, `tasks.md`, roadmap, and this quickstart with value-free
  evidence;
- update `overnightdesk-platform-standard` and synchronize the production copy;
- append production publication and rollback proof to `deploys.log`;
- review, commit, push, open the PR, monitor checks/deployment, merge only after
  acceptance, then prune merged remote state without discarding worktrees.
