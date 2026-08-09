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

**Decision**: Retain `replaceManagedVariable` and the proven Mitchel summary
read required by the active dashboard. Remove the unsupported `getSessions`
adapter and route: the frontend source calls `/sessions`, but the engine never
registered that endpoint and the platform standard records it as
deferred/superseded. Remove `provision`, `writeSecrets`,
`configureDashboardAuth`, `restart`, and `deprovision` plus their route callers.
After its separately reviewed isolation, the Aegis service retains only
managed-variable handling, the Mitchel summary read, and health/readiness.

**Rationale**: Graph tracing found customer lifecycle callers for provision,
write-secrets, restart, and deprovision, while managed-variable replacement is
the approved privileged operation. The Mitchel summary has a current dashboard
consumer and an engine implementation. `/sessions` has neither an engine route
nor a deployed contract, so retaining it would preserve a broken bridge rather
than an active capability.

**Alternatives considered**:

- Keep all client methods because they are authenticated: rejected because
  authentication does not justify unused lifecycle authority.
- Retire the service immediately: rejected because the qualified
  managed-variable operation is still required.

### Verified caller inventory (2026-08-09)

The canonical code graph and targeted source reads agree on the following
boundary. This is source evidence only; it does not authorize production,
provider, database, secret, or deployment changes.

| Operation | Frontend caller | Engine/platform evidence | Treatment |
| --- | --- | --- | --- |
| `replaceManagedVariable` | `src/app/api/settings/agent-variables/handler.ts` | `POST /v1/managed-variable-replacements` is registered and qualified for the exact Titus boundary | Retain |
| `getMitchelProspectingSummary` | `src/lib/mitchel-prospecting/trevor-summary-client.ts`, reached by the Mitchel dashboard and authenticated summary route | `GET /mitchel/prospecting/summary` is registered, bearer-protected, restricted to `hermes-mitchel`, and read-only | Retain; add the missing operation/owner record to platform-standard during T039-T040 |
| `getSessions` | `src/app/api/engine/sessions/route.ts` | No engine route is registered; platform-standard says it was never deployed and is deferred/superseded | Retire the route and client method |
| `healthz` | No direct frontend caller | `GET /healthz` is registered and documented as unauthenticated liveness | Retain; document its operational owner and check contract during T039-T040 |
| `provision` | `src/app/api/wizard/complete/route.ts` | Legacy `POST /provision` remains registered but is documented as denied at ingress | Retire |
| `writeSecrets` | `src/app/api/wizard/write-step/route.ts` | Legacy `POST /write-secrets` remains registered but is documented as denied at ingress | Retire |
| `restart` | `src/app/api/engine/restart/route.ts` | Legacy `POST /restart` remains registered but is documented as denied at ingress | Retire |
| `configureDashboardAuth` | `src/app/api/admin/hermes/dashboard-auth/route.ts` | Legacy `POST /dashboard-auth` remains registered but is outside the retained boundary | Retire |
| `deprovision` | `src/app/api/account/delete/route.ts` and `src/lib/stripe-webhook-handlers.ts` | Legacy `POST /deprovision` remains registered but is documented as denied at ingress | Retire |

The provisioning callback is also retired lifecycle authority:
`src/app/api/provisioner/callback/route.ts` still accepts engine callbacks and
mutates instance state. The engine still emits that callback from
`internal/hermes/provisioner.go`. It is not a retained named-runtime operation.

Remaining documentation gaps are bounded rather than inferred: the human owner
for the qualified managed-variable operation, the operational owner/check
contract for `/healthz`, and the platform-standard contract for the Mitchel
summary must be recorded before the affected Aegis source or runtime changes.

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
