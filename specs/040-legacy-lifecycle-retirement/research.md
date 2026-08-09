# Research: Legacy Customer Lifecycle Retirement

## Decision 1: Leave an existing-account TTS frontend

**Decision**: Preserve sign-in, password recovery, sessions,
membership-scoped selected-agent access, chat, and dashboard. Remove all
registration and public customer acquisition.

**Rationale**: The owner is the only active user. Austin and Mitchel have not
used their existing identities, but deleting or modifying those identities is
unnecessary and outside the retirement.

**Alternatives considered**:

- Retain invite-only registration: rejected because no new-account workflow is
  required.
- Add owner-only account flags: rejected because it creates a new identity
  model for no current benefit.

## Decision 2: Disable signup at the auth boundary

**Decision**: Remove the signup and verification UI and explicitly disable the
Better Auth email signup path. Retain the existing user-create denial hook as a
defense-in-depth guard until tests prove no registration path remains.

**Rationale**: Removing `/sign-up` does not remove the catch-all Better Auth API.
The current `/api/auth/[...all]` route can still expose
`/api/auth/sign-up/email` unless the server configuration denies it.

**Alternatives considered**:

- Remove only the page: rejected because direct API registration would remain.
- Remove email/password auth: rejected because it would break owner sign-in and
  password recovery.

## Decision 3: Replace billing authorization with current identity rules

**Decision**: Extract `isAdmin` and any current internal-role checks from
`billing.ts`. Protected layouts require a valid session; privileged security
routes require the current admin/role rule; selected-agent and dashboard access
continues to require canonical membership.

**Rationale**: `requireSubscription` currently allows protected access when
billing is disabled, and `requireProOrAdmin` grants security capabilities from a
Pro subscription. Both are obsolete authority paths.

**Alternatives considered**:

- Keep billing permanently disabled: rejected because dormant code can be
  re-enabled and continues to confuse authorization.
- Make every existing account an admin: rejected because it widens authority
  and violates membership boundaries.

## Decision 4: Preserve the active workspace, not lifecycle presentation

**Decision**: Keep selected-agent resolution, Agent Overview, Open Chat,
Advanced Dashboard/OIDC authorization, and required read-only runtime data.
Remove plan labels, payment banners, billing controls, setup/provisioning
states, customer onboarding, broad restart, and “created after payment” copy.

**Rationale**: The code graph shows the current dashboard combines active
selected-agent modules with old `subscription`, `SetupWizard`,
`ProvisioningProgress`, and `RestartButton` branches. Deleting the dashboard
wholesale would remove the product the owner uses.

**Alternatives considered**:

- Replace the dashboard with a new frontend: rejected as unnecessary scope.
- Keep dormant lifecycle components hidden: rejected because hidden authority
  and stale product claims are the retirement target.

## Decision 5: Narrow the mixed provisioner client

**Decision**: Retain `replaceManagedVariable` and only proven read-only calls
required by active dashboard/chat behavior, currently session and Mitchel
summary reads. Remove `provision`, `writeSecrets`,
`configureDashboardAuth`, `restart`, and `deprovision` plus their route callers.
The Aegis service retains only managed-variable handling and health/readiness
after its separately reviewed isolation.

**Rationale**: Graph tracing found customer lifecycle callers for provision,
write-secrets, restart, and deprovision, while managed-variable replacement is
the approved privileged operation. Read-only callers must be preserved or
replaced before service isolation so the dashboard does not regress.

**Alternatives considered**:

- Keep all client methods because they are authenticated: rejected because
  authentication does not justify unused lifecycle authority.
- Retire the service immediately: rejected because the qualified
  managed-variable operation is still required.

## Decision 6: Separate source deletion from database deletion

**Decision**: Remove all application use of subscriptions in the source slice.
Prepare a migration that first proves provider obligations and local
subscription rows are zero, then drops only the pure subscription table/types.
Do not drop the `instance` table; it is active named-runtime and OIDC truth.
Compatibility fields are removed only when targeted reads prove no active
consumer.

**Rationale**: The subscription model is pure legacy billing state, while the
instance model is shared by current workspace selection, dashboard linkage, and
runtime identity. Treating both as “customer data” would destroy active
platform state.

**Alternatives considered**:

- Keep subscription schema indefinitely: rejected as contradictory durable
  truth after a proven empty census.
- Drop all instance/lifecycle schema: rejected because current named-runtime
  workflows depend on it.

## Decision 7: Remove self-service account deletion

**Decision**: Delete the account-deletion UI and endpoint. Future deletion is
an explicit owner-operated process outside this feature.

**Rationale**: The current endpoint couples user deletion to Stripe
cancellation, OIDC mutation, and deprovisioning and could delete the sole active
owner identity.

**Alternatives considered**:

- Preserve hard deletion without lifecycle calls: rejected because it retains
  high-risk behavior with little current value.
- Add soft deletion: rejected because it creates a new account lifecycle.

## Decision 8: Retired routes are absent

**Decision**: Retired UI and API routes return `404 Not Found` and perform no
redirect or mutation. The root route remains as a minimal entry to sign-in or
the authenticated dashboard.

**Rationale**: Uniform absence is easy to test, fails closed through wildcard
routing, and does not advertise or accidentally reactivate retired features.

**Alternatives considered**:

- Redirect retired pages: rejected because it hides stale links and makes the
  removed surface appear supported.
- Return 410: rejected because the internal frontend does not need public
  deprecation signaling.
