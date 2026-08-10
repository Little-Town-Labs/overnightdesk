# T025 Quality Review

## Findings

- **Required — T022 lacks the required idempotent-replay regression.** `specs/040-legacy-lifecycle-retirement/tasks.md:91-97` requires idempotency coverage, and FR-010 requires durable idempotency. Every managed-variable fixture in `src/lib/__tests__/provisioner.test.ts` and `src/app/api/settings/agent-variables/__tests__/route.test.ts` uses `replayed: false`; no test exercises or asserts the valid `replayed: true` response path. Add a focused client and/or handler assertion that an idempotent replay remains value-free and preserves the typed replay result before treating T022 as complete. This is a merge blocker because the task is marked complete without its explicit acceptance evidence; it is not evidence that the production implementation is presently unsafe.
- **Optional — remove the stale test-only `writeSecrets` mock.** `src/app/api/settings/update-credential/__tests__/route.test.ts:2-8` still invents `provisionerClient.writeSecrets` after T024 removes that method. The route does not import or call the provisioner, so this has no runtime effect, but deleting the dead mock and its `not.toHaveBeenCalled()` assertions would make the test accurately describe the narrowed client. This is a follow-up suggestion, not a merge blocker.
- **Optional — consolidate the retirement-test source scanner.** `src/app/api/engine/__tests__/route-retirement.test.ts:28-79` repeats the recursive source scan and pre-authentication 404 harness already used by other retirement suites. A shared test helper could reduce duplication and repeated full-`src` scans, but extracting it is outside the owned T022-T025 paths and is not a merge blocker.

## Verification

- Reviewed current tree `792990986fd48c0f7119de0b81fc364d34829fff` against `origin/main` at `136a12e9c17620350b174f53ad93ef19e49f71ea`; the 13-file diff is 130 insertions and 863 deletions.
- `npx jest --runInBand --runTestsByPath ...` passed: 9 suites, 173 tests, 0 snapshots. The run covered provisioner narrowing, managed-variable handling, Mitchel summary validation, retired routes, middleware classification, remaining engine routes, subscription retirement, the limited dashboard, and the legacy update-credential denial test.
- `npx tsc --noEmit --incremental false` passed.
- `git diff --check origin/main` passed.
- `provisionerClient` exposes exactly `replaceManagedVariable` and the read-only `getMitchelProspectingSummary`. Targeted scans found no executable caller of `provision`, `writeSecrets`, `configureDashboardAuth`, `restart`, `deprovision`, or `getSessions`; the only legacy method reference is the optional stale test mock above.
- The restart, sessions, dashboard-auth route, and dashboard-auth route-test files are absent. Middleware classifies all three paths as retired before authentication, and GET, POST, and OPTIONS tests prove an empty 404 with no redirect and no session lookup.
- The Mitchel summary remains a GET-only provisioner call with a proven dashboard/API consumer and schema validation that fails closed when mutation-capable `outboundSent: true` data is returned.
- No production performance regression was identified: production behavior is primarily deleted, bounded response parsing remains unchanged, and the only performance observation is optional test-harness duplication.

## Scope

This is a brownfield, feature-scale, security-sensitive review bounded to Feature 040 tasks T022-T025. The diff removes client and route authority without adding public interfaces, schemas, dependencies, production mutations, or deployment work. Sign-in, password recovery, chat, protected dashboard, OIDC, and selected-agent implementation paths have no diff against `origin/main`; the retained middleware change only adds the three retired paths to the pre-authentication 404 registry. No scope creep was found.

## Decision

NEEDS-FOLLOW-UP. The sole merge blocker is the missing `replayed: true` idempotency regression required by T022/FR-010. The stale test-only mock and duplicated retirement harness are non-blocking follow-up suggestions. After replay coverage passes the focused suite, no other correctness, architecture, security, performance, test-quality, or scope blocker identified in this review remains.
