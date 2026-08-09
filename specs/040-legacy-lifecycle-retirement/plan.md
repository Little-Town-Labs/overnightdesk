# Implementation Plan: Legacy Customer Lifecycle Retirement

**Branch**: `040-legacy-lifecycle-retirement` | **Date**: 2026-08-09 | **Spec**: [spec.md](spec.md)

**Input**: Issue #215 and the clarified Feature 040 specification.

## Summary

Reduce OvernightDesk to the authenticated Timeless Technology Solutions
frontend that is used today. Preserve existing-account sign-in, password
recovery, membership-scoped chat, the selected-agent dashboard, and the
qualified managed-variable replacement path. Remove registration, marketing
and pricing, Stripe, subscription authorization, setup/provisioning wizards,
callbacks, self-service account deletion, and general lifecycle mutations.

The implementation is a brownfield system retirement. It lands in independently
verifiable source slices, then uses separate approvals for database cleanup,
production configuration, credentials, and Aegis service changes.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 20.9+; SQL for a bounded
PostgreSQL migration; existing Go service source only where the
managed-variable service boundary must be isolated.

**Primary Dependencies**: Next.js 15.5, React 19, Better Auth 1.6.23, Drizzle
ORM 0.45, PostgreSQL, the existing selected-agent workspace, and the qualified
managed-variable replacement contract.

**Storage**: Existing application PostgreSQL database. No new store or account
state is introduced. The legacy subscription table is removed only through a
separately approved migration after a zero-obligation/record preflight; active
identity, membership, platform-instance, runtime, conversation, and business
records remain.

**Testing**: Jest contract/unit tests, focused route tests, TypeScript/build
checks, dependency and source scans, migration plan/verify queries, and
separately authorized production smoke checks.

**Target Platform**: Vercel-hosted Next.js frontend and application database,
plus the Aegis named-runtime operations boundary used by the surviving
managed-variable capability.

**Project Type**: Brownfield web application and privileged-service retirement.

**Performance Goals**: No measurable regression to existing sign-in, chat, or
dashboard behavior. Removed routes terminate locally with 404 and perform zero
external or database mutation.

**Constraints**: Existing owner access must remain recoverable; registration
must be disabled at both UI and Better Auth API boundaries; no dormant identity
is modified; no subscription may authorize access; only qualified
managed-variable replacement remains as a privileged provisioner mutation;
production, payment, data, and secret changes require separate approval.

**Scale/Scope**: One actively used owner account, dormant existing identities
left untouched, three named business runtime contexts, one frontend, one
application database, and one qualified privileged operation.

## Constitution Check

*GATE: Pass before Phase 0 research and re-check after Phase 1 design.*

- **Business data and use-case boundaries**: PASS. The plan preserves identity,
  membership, named-runtime, and business data and removes subscription-derived
  authority.
- **Least privilege**: PASS. Signup, Stripe callbacks, arbitrary secret maps,
  dynamic provisioning, broad restart, deprovisioning, and account deletion
  endpoints are removed.
- **Agents assist; people decide**: PASS. Source work is separated from
  production, payment, secret, and destructive-data approvals.
- **Named workloads over dynamic hosting**: PASS. Existing named runtimes
  remain; no customer runtime lifecycle survives.
- **Operate for the current business**: PASS. The remaining product is the
  limited TTS frontend used by the owner.
- **Operational truth**: PASS. README, PRD, ADR 007, inventories, runbooks, and
  the canonical deployment ledger are explicit closeout surfaces.
- **Recoverability**: PASS. Source, data, service, and secret changes have
  separate rollback handles and observation gates.
- **Workspace quality**: PASS. Owner sign-in, password recovery, chat, and
  dashboard checks are first-class regression gates.

## Architecture Decisions

1. **Existing-account frontend only**: `/` becomes a minimal authenticated
   entry that leads to sign-in or the dashboard. There is no registration,
   verification, pricing, checkout, or customer-hosting journey.
2. **Current identity and membership replace billing authority**: extract admin
   and internal authorization helpers from `billing.ts`; protected layouts and
   security APIs use current role/membership rules only.
3. **Remove, do not stub, customer APIs**: deleted pages and route handlers
   resolve to Next.js 404. The Better Auth catch-all explicitly intercepts the
   email-registration path with 404 before dispatch, while sign-in, recovery,
   sessions, and OIDC continue through the retained handler.
4. **Preserve the deep active workspace module**: selected-agent resolution,
   chat, dashboard capabilities, OIDC authorization, and read-only runtime
   views remain. Subscription banners, plan labels, setup/provisioning states,
   and restart controls are removed from those surfaces.
5. **Narrow the provisioner client**: preserve the typed managed-variable
   replacement operation and only proven read-only calls needed by chat or
   dashboard. Remove provision, write-secrets, configure-dashboard-auth,
   restart, and deprovision methods and their callers. Health/readiness remains
   operational support, not lifecycle authority.
6. **Keep active platform-instance truth**: the `instance` table is shared with
   named-runtime selection and OIDC and is not dropped. Pure subscription
   schema and demonstrably unused wizard compatibility fields are handled by a
   separate migration gate.
7. **No account cleanup in this feature**: self-service account deletion is
   removed. The owner-operated process is documented and must refuse deletion
   of the sole active owner. Gary, Austin, Mitchel, and all other existing
   identities remain unchanged.

## Delivery Sequence

1. **Freeze the surviving contract**: add owner sign-in, password recovery,
   chat/dashboard, membership denial, registration denial, retired-route 404,
   and no-mutation tests before deleting source.
2. **Remove acquisition and registration**: replace the marketing root, remove
   signup/verification/pricing/checkout pages, remove links to them, and deny
   Better Auth signup at the server boundary.
3. **Remove Stripe and subscription authority**: extract current admin helpers,
   remove billing guards and dashboard subscription presentation, delete Stripe
   routes/libraries/templates/tests, and remove the Stripe dependency and
   environment contract.
4. **Remove customer lifecycle controls**: delete wizard, callback,
   provisioning-progress, restart, self-delete, subscription, and legacy
   instance-control routes; narrow `instance.ts` and `provisioner.ts` while
   retaining selected-agent reads and managed-variable replacement.
5. **Reconcile schema and documentation**: generate a preflight/plan/apply/verify
   migration for pure legacy data, update product and operational truth, and
   prove source/config scans have no active customer lifecycle claim.
6. **Activate separately**: after reviewed source merges, obtain independent
   approval for Vercel activation, database migration, Aegis operations-service
   isolation, provider/secret cleanup, and observation closeout. Vercel
   activation that removes callbacks or wizard behavior is blocked until the
   provider/local/in-flight zero-state preflight passes. Destructive data work
   is additionally blocked until rollback succeeds against a disposable
   database.

## Project Structure

### Documentation (this feature)

```text
specs/040-legacy-lifecycle-retirement/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── retirement-boundary.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (auth)/                         # retain sign-in/reset; remove signup/verify
│   ├── (protected)/                    # retain workspace; remove lifecycle UI
│   ├── api/auth/                       # retain auth catch-all with signup disabled
│   ├── api/settings/agent-variables/   # retain qualified replacement adapter
│   └── api/                            # remove Stripe/wizard/callback/lifecycle routes
├── db/
│   └── schema.ts                       # retain active identity/instance; migrate subscription
└── lib/
    ├── auth.ts                         # deny signup, retain sign-in/recovery/OIDC
    ├── provisioner.ts                  # narrow to approved mutation + proven reads
    └── selected-agent-*.ts             # retained active workspace boundaries

drizzle/                                # bounded legacy-data migration
tests and src/**/__tests__/             # surviving and retirement contracts
README.md
PRD.md
.env.example
package.json
package-lock.json
```

**Structure Decision**: Keep the existing Next.js application and extract
current identity/authorization behavior from legacy billing modules. Do not
create a replacement service, frontend, account state, or customer lifecycle.
Cross-repository Aegis service isolation is a dependent production slice, not a
reason to retain mutation methods in this frontend.

## Phase 0: Research Complete

[research.md](research.md) records the source graph findings and the decisions
for auth denial, authorization replacement, dashboard preservation, provisioner
narrowing, and data cleanup.

## Phase 1: Design Complete

- [data-model.md](data-model.md) defines retained and retired records and the
  preflight-gated state transition.
- [contracts/retirement-boundary.md](contracts/retirement-boundary.md) defines
  surviving and retired HTTP/service surfaces.
- [quickstart.md](quickstart.md) defines local verification and separately
  approved activation gates.

## Post-design Constitution Check

PASS. The design removes historical customer authority without changing active
identity, membership, named-runtime, conversation, or business-data ownership.
It preserves only the product surface and privileged operation required by the
current business and keeps destructive or production work behind explicit
approval.

## Complexity Tracking

No constitution violation or new architectural layer is required.
