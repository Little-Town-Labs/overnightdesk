# Tasks: Hermes Dashboard OIDC SSO

**Input**: Design documents from `/specs/017-hermes-oidc-sso/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by FR-024. Every behavior or abuse-case test is written and
observed failing before the corresponding production change.

**Organization**: Tasks are grouped by user story. Paths beginning with
`../overnightdesk-engine/` and `../overnightdesk-platform-standard/` belong to
separate Git repositories and must be committed there.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other marked tasks after its prerequisites
- **[Story]**: Maps to a user story in spec.md
- Every task names the file or directory it changes or validates

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish supported dependencies, branches, and decision records
without enabling OIDC for a tenant.

- [x] T001 Upgrade `better-auth` and `@better-auth/oauth-provider` to 1.6.23 and align `drizzle-orm` to the adapter-supported 0.45.2 release in package.json and package-lock.json
- [x] T002 Create the matching `017-hermes-oidc-sso` feature branch in ../overnightdesk-engine/ and confirm both repository worktrees are clean
- [x] T003 [P] Record the provider, owner-only, token-lifetime, cross-repository, and rollback decisions in docs/decisions/002-hermes-dashboard-oidc-sso.md
- [x] T004 [P] Document non-secret issuer and rollout configuration keys in .env.example and ../overnightdesk-engine/deploy/hermes-provisioner.env.example

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add provider storage and protocol infrastructure shared by every
story while preserving all existing Better Auth behavior.

**⚠️ CRITICAL**: No user story work starts until this phase passes its
regression checkpoint.

- [x] T005 Add failing schema assertions for OAuth client, token, consent, JWKS, and instance-link constraints in src/db/__tests__/schema-constraints.test.ts
- [x] T006 Add the Better Auth OAuth/JWKS tables, dashboard-auth enum, nullable unique instance client link, status, timestamp, and relations in src/db/schema.ts
- [x] T007 Generate and inspect the additive Drizzle migration and metadata in drizzle/ for the Phase 2 schema
- [x] T008 Add failing provider-configuration and time-controlled overlap tests for RS256, 30-day rotation, one-hour old/new key grace, 120-second codes, 900-second access/ID tokens, exact scopes, no refresh grant, no dynamic registration, disabled generic JWT surfaces, and denied client CRUD in src/lib/__tests__/auth-oidc-config.test.ts and src/lib/__tests__/auth-oidc-rotation.test.ts
- [x] T009 Configure Better Auth JWT and OAuth provider plugins with the tested rotation, expiry, surface-reduction, and protocol defaults in src/lib/auth.ts
- [x] T010 Add failing route tests for issuer-path OpenID discovery and root OAuth authorization-server metadata in src/app/api/auth/__tests__/oidc-metadata.test.ts
- [x] T011 Implement the explicit Next.js well-known metadata routes under src/app/api/auth/.well-known/ and src/app/.well-known/oauth-authorization-server/api/auth/
- [x] T012 Add `oauthProviderClient()` to src/lib/auth-client.ts and a regression test proving signed `oauth_query` is forwarded by email/password sign-in in src/lib/__tests__/auth-client-oidc.test.ts
- [x] T013 Run existing auth, tenant verification, database schema, type-check, and build regression suites from package.json and record the Phase 2 checkpoint in specs/017-hermes-oidc-sso/quickstart.md

**Checkpoint**: Existing login remains functional and the provider exposes only
the intended protocol surface; no tenant client is active.

---

## Phase 3: User Story 1 — Launch the Full Dashboard with One Login (Priority: P1) 🎯 MVP

**Goal**: A signed-in owner launches the complete native Hermes dashboard at
the tenant root and completes Hermes authentication through OvernightDesk
without another credential.

**Independent Test**: With a running test instance and active test client,
launch the root URL, complete code+S256 flow through the existing sign-in page,
and verify the RS256 ID token and native dashboard session without a second
credential prompt.

### Tests for User Story 1

- [ ] T014 [P] [US1] Add failing unit tests for canonical issuer, exact callback, public-client payload, and root-versus-fallback launch URL in src/lib/__tests__/hermes-oidc.test.ts and src/lib/__tests__/hermes-dashboard.test.ts
- [ ] T015 [P] [US1] Add failing sign-in continuation tests for authenticated, unauthenticated, and expired signed OAuth queries in src/app/(auth)/sign-in/__tests__/page.test.tsx
- [ ] T016 [P] [US1] Add failing provisioner contract tests for the non-secret `dashboardAuth` request in src/lib/__tests__/provisioner.test.ts
- [ ] T017 [P] [US1] Add failing Go tests for strict dashboard-auth payload validation and atomic Hermes YAML merge in ../overnightdesk-engine/internal/hermes/dashboard_oidc_test.go
- [ ] T018 [P] [US1] Add a failing Go test proving generated startup omits `--insecure` and retains `--host 0.0.0.0 --port 9119 --no-open` in ../overnightdesk-engine/internal/hermes/provisioner_test.go

### Implementation for User Story 1

- [ ] T019 [US1] Implement canonical issuer/callback builders plus idempotent server-only ensure and activate primitives for public clients in src/lib/hermes-oidc.ts
- [ ] T020 [US1] Preserve the signed OAuth continuation and safe callback destination through email/password login in src/app/(auth)/sign-in/page.tsx
- [ ] T021 [US1] Ensure the instance client before extending the typed platform-to-provisioner request with `dashboardAuth` in src/lib/provisioner.ts and src/app/api/wizard/complete/route.ts
- [ ] T022 [US1] Implement bounded URL, issuer, callback, client-ID, and scope validation plus atomic YAML merge in ../overnightdesk-engine/internal/hermes/dashboard_oidc.go
- [ ] T023 [US1] Extend the engine provision request and apply dashboard OIDC before container start in ../overnightdesk-engine/internal/hermes/provisioner.go
- [ ] T024 [US1] Remove insecure dashboard startup while retaining the authenticated bind and forwarded public URL behavior in ../overnightdesk-engine/internal/hermes/provisioner.go
- [ ] T025 [US1] Return the tenant root only for active OIDC linkage and retain the protected `/login` fallback otherwise in src/lib/hermes-dashboard.ts and src/app/(protected)/dashboard/page.tsx
- [ ] T026 [US1] Run the US1 Jest and Go targets, measure a healthy launch under 10 seconds, prove the 900-second Hermes cookie lifetime, and prove Hermes logout clears dashboard-auth cookies against specs/017-hermes-oidc-sso/contracts/oidc-provider.md

**Checkpoint**: The owner-only happy path can establish a native Hermes session
and no existing tenant is switched automatically.

---

## Phase 4: User Story 2 — Deny Cross-Tenant and Invalid Access (Priority: P2)

**Goal**: Wrong owners, clients, callbacks, scopes, tenant states, and stale
transactions cannot obtain a code, token, or dashboard content.

**Independent Test**: Run the authorization matrix as a second user and with
each altered protocol input; every attempt produces zero authorization codes,
tokens, Hermes sessions, or tenant content.

### Tests for User Story 2

- [ ] T027 [P] [US2] Add failing authorization and exchange tests for non-owner, unverified owner, wrong client link, non-running instance, inactive linkage, disabled client, malformed metadata, callback/scope escalation, altered or missing state/nonce, replayed code, missing or mismatched verifier, and non-S256 PKCE in src/lib/__tests__/hermes-oidc-authorization.test.ts and src/lib/__tests__/hermes-oidc-protocol.test.ts
- [ ] T028 [P] [US2] Add failing token-time tests for ownership or lifecycle changes between code issuance and ID-token creation in src/lib/__tests__/hermes-oidc-token.test.ts
- [ ] T029 [P] [US2] Add failing route tests proving wrong-host and copied-link requests remain denied by src/app/api/auth/verify-tenant/__tests__/route.test.ts
- [ ] T030 [P] [US2] Add failing tests for redaction of state, nonce, code, verifier, tokens, cookies, email, and private keys in src/lib/__tests__/hermes-oidc-audit.test.ts

### Implementation for User Story 2

- [ ] T031 [US2] Implement signed provider-state client resolution and canonical pre-code owner authorization in src/lib/hermes-oidc.ts
- [ ] T032 [US2] Add the token-time canonical owner/lifecycle check and minimum standard claims in src/lib/hermes-oidc.ts and src/lib/auth.ts
- [ ] T033 [US2] Keep client CRUD and dynamic registration unavailable to browser users and add safe OAuth denial mapping in src/lib/auth.ts
- [ ] T034 [US2] Add redacted dashboard authorization event categories and fingerprints through src/lib/hermes-oidc-audit.ts and the existing platformAuditLog schema
- [ ] T035 [US2] Preserve exact tenant-host ownership verification and generic denial responses in src/app/api/auth/verify-tenant/route.ts
- [ ] T036 [US2] Run the complete negative authorization matrix and inspect test/log output for prohibited protocol artifacts using specs/017-hermes-oidc-sso/quickstart.md

**Checkpoint**: User Stories 1 and 2 both pass; no invalid test case can mint a
usable Hermes identity token.

---

## Phase 5: User Story 3 — Provision, Revoke, and Recover Dashboard SSO (Priority: P3)

**Goal**: Operators can idempotently prepare, activate, disable, reconfigure,
and roll back one tenant without deleting native Hermes data.

**Independent Test**: Configure an isolated tenant, activate its client, prove
owner login, disable it and prove new login fails, restore the protected prior
configuration, and verify the data directory is unchanged.

### Tests for User Story 3

- [ ] T037 [P] [US3] Add failing lifecycle tests for idempotent ensure, activate, disable, error, and recovery transitions in src/lib/__tests__/hermes-oidc-lifecycle.test.ts
- [ ] T038 [P] [US3] Add failing cancellation and account-deletion tests proving client disable precedes asynchronous deprovision in src/lib/__tests__/stripe-webhook.test.ts and src/app/api/account/__tests__/delete.test.ts
- [ ] T039 [P] [US3] Add failing authenticated `POST /dashboard-auth` handler tests for validation, idempotence, restart, and safe errors in ../overnightdesk-engine/internal/hermes/handlers_test.go
- [ ] T040 [P] [US3] Add failing engine rollback tests proving config restoration and tenant data preservation in ../overnightdesk-engine/internal/hermes/dashboard_oidc_test.go
- [ ] T041 [P] [US3] Add failing callback tests for activation success, configuration error, and redacted evidence in src/app/api/provisioner/__tests__/callback.test.ts

### Implementation for User Story 3

- [ ] T042 [US3] Extend the US1 lifecycle primitives with idempotent disable, error, revoke, and recover operations in src/lib/hermes-oidc.ts
- [ ] T043 [US3] Wire client disable before suspension, cancellation, account deletion, and deprovision paths in src/lib/stripe-webhook-handlers.ts and src/app/api/account/delete/route.ts
- [ ] T044 [US3] Add authenticated `POST /dashboard-auth` registration and handler code in ../overnightdesk-engine/internal/hermes/handlers.go
- [ ] T045 [US3] Add `configureDashboardAuth()` and safe timeout/error mapping to src/lib/provisioner.ts
- [ ] T046 [US3] Wire provisioner callback status to pending/active/error dashboard-auth transitions in src/app/api/provisioner/callback/route.ts
- [ ] T047 [US3] Add safe customer launch-unavailable states and operator recovery detail in src/app/(protected)/dashboard/page.tsx and existing fleet event surfaces
- [ ] T048 [US3] Draft the canary activation, revocation, key rotation, restart, and five-minute rollback procedure as not-yet-live guidance in ../overnightdesk-platform-standard/HOW/tenant-provisioning.md
- [ ] T049 [US3] Add the OIDC contract as planned/canary state while retaining Basic Auth as the verified live state in ../overnightdesk-platform-standard/WHAT/hermes.yaml
- [ ] T050 [US3] Run US3 lifecycle suites and a filesystem-level engine test proving rollback does not delete or replace the tenant data directory

**Checkpoint**: All three stories are locally/preview complete; production
canary execution still requires an explicit production operation.

---

## Phase 6: Polish and Cross-Cutting Qualification

**Purpose**: Verify the dependency upgrade, security boundary, documentation,
and build before the required quality review.

- [ ] T051 [P] Reconcile spec, plan, contracts, data model, ADR, and implementation wording across specs/017-hermes-oidc-sso/ and docs/decisions/002-hermes-dashboard-oidc-sso.md
- [ ] T052 Run the full Jest suite, TypeScript type check, production Next.js build, dependency audit, and migration inspection from package.json and drizzle/
- [ ] T053 Run the full Go test suite, Go build, vet/static checks, and diff checks in ../overnightdesk-engine/
- [ ] T054 Inspect repository diffs, generated artifacts, logs, and test fixtures for secrets or protocol artifacts in overnightdesk/ and ../overnightdesk-engine/
- [ ] T055 Perform an approved isolated production canary and rollback using the aegis-ssh skill; explicitly verify launch timing, cookie expiry, logout, key overlap, replay denial, process/log redaction, and data preservation before promoting ../overnightdesk-platform-standard/ to verified live state and appending /home/frosted639/src/overnightdesk-suite/deploys.log
- [ ] T056 Update task checkboxes and requirement checklist evidence in specs/017-hermes-oidc-sso/tasks.md and specs/017-hermes-oidc-sso/checklists/requirements.md
- [ ] T057 Apply the `code-review-and-quality` gateway to all repository diffs and evidence, record it in specs/017-hermes-oidc-sso/quality-review.md, and resolve every Critical or Required finding before merge readiness

---

## Dependencies and Execution Order

### Phase dependencies

- **Setup** has no dependency.
- **Foundational** depends on T001 and blocks all user stories.
- **US1** depends on the provider foundation and is the MVP.
- **US2** depends on the provider foundation and integrates with US1, but its
  authorization matrix remains independently testable.
- **US3** depends on lifecycle primitives from US1 and denial behavior from US2.
- **Qualification** depends on all selected stories; T055 additionally requires
  explicit production approval and T057 requires all other evidence.

### User story dependency graph

```text
Setup -> Foundation -> US1 -> US2 -> US3 -> Qualification -> Quality Gateway
```

### Within each story

- Write and run the story's test tasks first; record the expected failure.
- Add models/configuration before services, services before endpoint wiring, and
  endpoint wiring before independent qualification.
- Commit coherent slices in the repository that owns them.
- Do not activate a tenant merely because its code path exists.

### Parallel opportunities

- T003 and T004 can run in parallel after dependency selection.
- Test authoring tasks within each story marked `[P]` touch separate files.
- Platform and engine test work can proceed independently once the contract is
  fixed, but cross-repository integration waits for both sides.
- T051 and documentation review can proceed alongside non-mutating verification.

## Parallel Examples

### User Story 1

```text
T014 platform builders/launch tests
T015 sign-in continuation tests
T016 provisioner client contract tests
T017-T018 engine validation/startup tests
```

### User Story 2

```text
T027 authorization matrix
T028 token-time race/lifecycle tests
T029 nginx tenant verification regression
T030 audit redaction tests
```

### User Story 3

```text
T037 platform lifecycle state tests
T038 cancellation/deletion tests
T039-T040 engine reconfigure/rollback tests
T041 callback state tests
```

## Implementation Strategy

### MVP first

1. Complete Setup and Foundation without activating any tenant.
2. Complete US1 against a test client and test tenant.
3. Validate issuer discovery, S256, RS256, callback, expiry, and native dashboard
   access independently.
4. Do not release the MVP until US2's owner-isolation matrix also passes; auth
   security is part of the minimum viable product even though it is a separate
   acceptance story.

### Incremental delivery

1. Provider foundation: deployable but inert.
2. Owner journey: test/preview only.
3. Abuse-case enforcement: required before any production canary.
4. Lifecycle and rollback: required before canary activation.
5. One approved canary, then the quality gateway and a separate broad-rollout
   decision.

## Notes

- `[P]` means file-level parallelism, not permission to bypass dependencies.
- Never include secrets, OAuth queries, state, nonce, codes, PKCE material,
  tokens, cookies, private keys, or customer email in evidence.
- Existing Basic Auth remains a protected rollback path until the canary passes.
- Production deployment and broad tenant rollout are not implied by completing
  local development tasks.
