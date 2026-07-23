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

## 4. Plan the canonical assignment

Run the database command with the production environment loaded through the
existing guarded process:

```bash
TITUS_DASHBOARD_PRIVATE_RUNTIME_QUALIFIED=PRIVATE_TITUS_DASHBOARD_HEALTH_VERIFIED \
  npx tsx scripts/dashboard-instance-reconciliation.ts plan
```

Expected first-run output contains `status: ready` and one planned projection,
with no IDs, hostnames, emails, or connection details. Any `blocked` result
stops the rollout.

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

## 6. Install disabled and qualify privately

Create the public OIDC client and its exact runtime-scoped resource binding in
disabled state, stage the exact non-secret client contract through stdin-only
deployment input, install the Nginx route disabled, and restart only Titus.
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

## 9. Persistence, rollback, and observation

Confirm an existing Titus chat and visible history before and after the exact
Titus restart. Rehearse rollback in the documented order and prove Chat remains
healthy while Advanced Dashboard becomes unavailable. Restore the accepted
candidate, then observe Titus, Walter, both Open WebUI deployments, Nginx, and
Ops for unexpected restarts, auth sentinels, or 5xx responses.

## 10. Closeout

After owner acceptance:

- update `spec.md`, `tasks.md`, roadmap, and this quickstart with value-free
  evidence;
- update `overnightdesk-platform-standard` and synchronize the production copy;
- append production publication and rollback proof to `deploys.log`;
- review, commit, push, open the PR, monitor checks/deployment, merge only after
  acceptance, then prune merged remote state without discarding worktrees.
