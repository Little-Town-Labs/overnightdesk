# Quickstart: Agent Control Surfaces

## Local prerequisites

```bash
npm ci
npm test -- --runInBand
npm run build
```

Use test fixtures only. Never enter a real Phase token or secret value in local
tests, browser fixtures, snapshots, or logs.

## Increment 1: reproduce Runtime inconsistency

1. Add Titus and Walter directory fixtures with different optional capabilities.
2. Render each through the same selected-agent component.
3. Confirm the RED test shows Runtime is missing for the canonical-only Titus
   fixture under the current implementation.
4. Implement the shared context/panel and confirm both agents show Runtime in
   the same order with truthful different capability states.

## Increment 2: Settings

1. Verify account controls render when the agent directory is unavailable.
2. Verify an explicit unauthorized selector fails closed.
3. Verify switching agents updates every agent-scoped heading/status and leaves
   account-wide content unchanged.
4. Verify no first-instance lookup remains in Settings.

## Increment 3: Admin

1. Verify non-admin access is denied at every Admin route.
2. Verify Fleet and Metrics are visibly global.
3. Verify Configuration uses the same selected-agent identity/Runtime panels.
4. Check keyboard order and 320/768/1024/1440 layouts.

## Increment 4: credential hardening

1. Prove the old arbitrary `{secrets}` body fails before implementation.
2. Prove unknown keys, paths, agents, roles, malformed values, and repeated
   request IDs perform zero provisioner calls.
3. Prove supported exact-instance catalog requests call only the one approved
   internal key and return no value.
4. Prove audit failure denies mutation and logs contain no test sentinel.
5. Render unsupported canonical Phase boundaries read-only.

## Final qualification

```bash
npm test -- --runInBand
npm run build
npm audit --audit-level=high
npx playwright test tests/browser/open-webui-auth-spike.spec.ts --project=chromium
git diff --check
```

Production acceptance requires an authenticated owner check switching Titus and
Walter through Overview, Settings, and Admin, plus public fail-closed and Aegis
health verification. A Phase write is not production-accepted until the
separate provisioner endpoint, rollback, value-suppression, and standard update
are complete.

## Latest local checkpoint — 2026-07-22

- `npm test -- --runInBand`: 80 suites passed, 3 skipped; 919 tests passed,
  26 skipped.
- `npm run build`: passed with an intentionally unreachable build-only database
  URL; no production credential or database access was used.
- `git diff --check`: passed before the P4 commit.
- `npm audit --audit-level=high`: reports two high and five moderate findings.
  The high advisory is inherited from `sharp <0.35.0` through Next.js; npm's
  proposed automatic remediation is a breaking Next.js downgrade and is not an
  approved fix.
- Chromium release qualification, the boundary-aware provisioner, publication,
  deployment, platform-standard reconciliation, and authenticated owner
  acceptance remain incomplete.
