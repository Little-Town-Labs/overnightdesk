# Feature Specification: Hermes Dashboard OIDC SSO

**Feature Branch**: `017-hermes-oidc-sso`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Use OvernightDesk's existing customer identity as a self-hosted OIDC provider for the full Hermes dashboard so the instance owner signs in once, remains an OvernightDesk customer, and receives a short-lived Hermes session without a second credential prompt."

## User Scenarios & Testing

### User Story 1 - Launch the Full Dashboard with One Login (Priority: P1)

An authenticated instance owner launches their running Hermes dashboard from
OvernightDesk and arrives at the complete native Hermes management interface
without entering another username or password or creating an account with Nous.

**Why this priority**: The current launch path either fails or presents a
second credential system that the customer cannot use. Restoring the promised
single-login dashboard experience is the primary customer value.

**Independent Test**: Sign in to OvernightDesk as the owner of one running
instance, select Launch Dashboard, and verify the browser reaches that
instance's native Hermes dashboard without another credential prompt.

**Acceptance Scenarios**:

1. **Given** an instance owner has a valid OvernightDesk session and a running
   instance, **When** they launch the dashboard, **Then** they reach the root of
   their native Hermes dashboard without entering another credential.
2. **Given** the owner is not signed in to OvernightDesk, **When** they follow a
   dashboard launch link, **Then** they authenticate through OvernightDesk and
   continue to the originally requested dashboard.
3. **Given** the owner has authenticated successfully, **When** they navigate
   through Hermes configuration, API-key, session, skill, model, and monitoring
   pages, **Then** the complete native dashboard remains available.
4. **Given** a short-lived Hermes session expires while the OvernightDesk
   session remains valid, **When** the owner next uses the dashboard, **Then**
   reauthentication completes through OvernightDesk without another credential
   prompt.

---

### User Story 2 - Deny Cross-Tenant and Invalid Access (Priority: P2)

An instance owner can access only the Hermes dashboard assigned to their own
running instance. A signed-in customer, copied link recipient, disabled client,
or malformed authorization attempt cannot cross tenant boundaries or obtain a
session for another owner's dashboard.

**Why this priority**: The Hermes dashboard can change agent configuration and
secrets. A single-login experience is acceptable only if ownership remains
fail-closed at every authorization boundary.

**Independent Test**: Sign in as a customer who does not own the target
instance, attempt the normal launch and authorization paths for that tenant,
and verify that no Hermes session is issued and no dashboard content loads.

**Acceptance Scenarios**:

1. **Given** a signed-in customer does not own the requested instance,
   **When** they request its dashboard or authorization flow, **Then** access is
   denied without revealing tenant configuration or owner identity.
2. **Given** an authorization request names a different tenant, callback, or
   client than the requested dashboard, **When** it is evaluated, **Then** the
   request fails closed and no session or authorization code is issued.
3. **Given** an instance or dashboard authorization registration is disabled,
   revoked, missing, or no longer running, **When** its owner attempts launch,
   **Then** access is denied with a safe actionable message.
4. **Given** a valid authorization response is replayed, altered, expired, or
   delivered without the original browser transaction, **When** it reaches the
   callback, **Then** no Hermes session is created.

---

### User Story 3 - Provision, Revoke, and Recover Dashboard SSO (Priority: P3)

An operator can provision a distinct dashboard authorization registration for
each tenant, verify it before customer use, revoke it when the tenant is
disabled or cancelled, and roll back a failed rollout without deleting Hermes
data or replacing the native dashboard.

**Why this priority**: Single sign-on must be repeatable across customer
instances and recoverable during deployment, cancellation, key rotation, or
identity-provider failure.

**Independent Test**: Provision an isolated canary tenant, complete one owner
login, revoke its dashboard registration, prove further login is denied, then
restore the prior protected login configuration without changing the tenant's
durable data.

**Acceptance Scenarios**:

1. **Given** a new tenant is provisioned, **When** dashboard access is prepared,
   **Then** it receives one distinct active registration with only its exact
   public callback and the minimum identity scopes.
2. **Given** the tenant is disabled, cancelled, or deprovisioned, **When** its
   authorization registration is revoked, **Then** new dashboard sessions
   cannot be created.
3. **Given** identity discovery, signing verification, callback handling, or
   tenant authorization fails, **When** an operator investigates, **Then**
   metadata-only evidence identifies the failure category without exposing
   tokens, credentials, codes, or customer data.
4. **Given** a canary rollout must be reversed, **When** the operator follows
   the rollback procedure, **Then** the previous protected login path is
   restored and all Hermes tenant data remains intact.

### Edge Cases

- A customer owns no instance, owns an instance that is not running, or has a
  stale launch page after the instance changes state.
- A customer edits the tenant hostname, client identifier, callback address,
  requested scopes, issuer, audience, or return location.
- Two browser tabs start authorization transactions for the same tenant, or a
  stale callback arrives after a newer successful transaction.
- The authorization code is replayed, the proof key is missing or mismatched,
  state or nonce is absent, or the browser cookie was issued for another flow.
- The signing key rotates while a valid short-lived session or authorization
  transaction is in progress.
- Identity discovery, signing-key retrieval, or token exchange is unavailable,
  slow, malformed, or inconsistent with the configured issuer.
- The customer's OvernightDesk session expires before authorization completes
  or the Hermes session expires while the OvernightDesk session remains valid.
- A tenant callback is reached through a reverse proxy with a wrong or missing
  public scheme, host, or prefix.
- A revoked or cancelled tenant still has an older Hermes session cookie.
- Logs, errors, analytics, or support evidence accidentally include an
  authorization code, token, verifier, signing key, cookie, or secret field.

## Requirements

### Functional Requirements

- **FR-001**: OvernightDesk MUST be the customer identity authority for Hermes
  dashboard access; the feature MUST NOT require a Nous account.
- **FR-002**: A valid OvernightDesk session for the instance owner MUST be
  sufficient to complete dashboard authentication without another credential
  prompt.
- **FR-003**: Only the owner recorded for an instance MUST be eligible to obtain
  a Hermes dashboard session for that instance.
- **FR-004**: The owner MUST receive access to the complete native Hermes
  dashboard rather than a replacement, partial proxy, or reimplemented UI.
- **FR-005**: Each tenant MUST have a distinct dashboard authorization client
  registration bound to one exact public callback address.
- **FR-006**: Dashboard clients MUST be public clients with proof-key protection
  and MUST NOT depend on a client secret that can be extracted from the Hermes
  runtime.
- **FR-007**: Authorization MUST use an exact issuer, exact client audience,
  exact callback, one-time state, nonce, short-lived code, and proof-key
  validation before a Hermes session is created.
- **FR-008**: Identity tokens MUST use an asymmetric signature algorithm Hermes
  accepts and MUST be verifiable through published, rotation-capable signing
  keys.
- **FR-009**: Identity claims MUST provide a stable subject and the owner's
  available email and display name while exposing no tenant secrets or platform
  administrative data.
- **FR-010**: The authorization boundary MUST resolve the requested client to
  one instance and verify its recorded owner, running state, active dashboard
  registration, requested callback, and permitted scopes before approval.
- **FR-011**: First-party consent MAY be skipped only for an active,
  pre-provisioned OvernightDesk dashboard client after owner authorization has
  succeeded; arbitrary or dynamically registered clients MUST NOT receive that
  treatment.
- **FR-012**: Public unauthenticated client registration MUST remain disabled.
- **FR-013**: Hermes dashboard sessions MUST be short-lived and independently
  clearable; expiry MAY re-run single sign-on while the OvernightDesk session is
  still valid.
- **FR-014**: OvernightDesk logout is not required to terminate an existing
  Hermes session immediately in this release, but Hermes logout MUST clear the
  Hermes session and tenant revocation MUST prevent new sessions.
- **FR-015**: The existing reverse-proxy tenant ownership check MUST remain in
  place as defense in depth and MUST fail closed for mismatched users or hosts.
- **FR-016**: The browser dashboard flow MUST remain separate from the Hermes
  machine API key flow; dashboard owners MUST NOT receive or require the
  machine API key.
- **FR-017**: The dashboard launch action MUST target the tenant root when SSO is
  enabled and MUST preserve a safe sign-in or support path when authentication
  cannot complete.
- **FR-018**: Provisioning MUST create, configure, disable, and revoke the
  tenant's authorization registration in step with the instance lifecycle.
- **FR-019**: A tenant MUST NOT be switched away from its previous protected
  login path until discovery, token verification, callback, full dashboard,
  expiry, restart, and rollback tests pass for a canary.
- **FR-020**: Tokens, codes, proof-key verifiers, cookies, signing private keys,
  credentials, and tenant secret values MUST NOT appear in source control,
  platform records intended for ordinary operations, logs, errors, telemetry,
  process listings, or deployment evidence.
- **FR-021**: Security events MUST record only the minimum metadata needed to
  distinguish authorization start, success, denial reason, callback failure,
  signing-key failure, client revocation, and tenant mismatch.
- **FR-022**: Customer-facing failures MUST provide a safe actionable next step
  without exposing internal infrastructure, tenant identifiers belonging to
  another customer, or raw protocol errors.
- **FR-023**: Rollback MUST restore the prior protected dashboard login without
  deleting or replacing any tenant data volume or native Hermes dashboard
  functionality.
- **FR-024**: The feature MUST be implemented test-first; every new behavior
  and abuse case MUST have a test that is observed failing before its production
  implementation is added.
- **FR-025**: No change may be considered ready to merge until the documented
  correctness, readability, architecture, security, performance, test, and
  build quality gateway passes with no unresolved Critical or Required finding.

### Key Entities

- **Dashboard Authorization Client**: A unique per-instance public registration
  containing its client identity, exact callback, allowed scopes, owner
  relationship, lifecycle state, and revocation metadata; it contains no client
  secret.
- **Authorization Transaction**: A short-lived, single-use browser transaction
  binding the owner session, client, callback, state, nonce, requested scopes,
  and proof key.
- **Signing Key**: A rotatable asymmetric key pair whose public portion verifies
  identity tokens and whose private portion is never exposed to tenants or
  customers.
- **Hermes Dashboard Session**: A short-lived tenant-local session established
  only after successful identity-token verification and independently cleared
  by Hermes logout or expiry.
- **Dashboard Authorization Event**: Redacted operational evidence describing
  the tenant client, event category, outcome, timestamp, and safe denial reason.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In qualification, 100% of launches by the recorded owner of a
  healthy canary instance reach the native Hermes dashboard without a second
  credential prompt.
- **SC-002**: In negative qualification, 100% of attempts by a non-owner,
  wrong-host request, wrong-client request, altered callback, disabled tenant,
  revoked registration, replayed code, or invalid browser transaction produce
  zero Hermes sessions and zero dashboard content.
- **SC-003**: An owner with an existing OvernightDesk session reaches the
  dashboard within 10 seconds under healthy service conditions, excluding the
  time the user spends entering OvernightDesk credentials when reauthentication
  is actually required.
- **SC-004**: After a Hermes session expires, an owner with a valid OvernightDesk
  session completes single sign-on again without another credential prompt in
  100% of qualification attempts.
- **SC-005**: The canary verifies every major native Hermes dashboard section,
  including configuration and API-key management, loads through the authorized
  session with no replacement UI and no unhandled browser-console error.
- **SC-006**: Signing-key rotation preserves validation for in-flight or
  unexpired tokens during the documented overlap window and allows new tokens
  to validate with the new key in 100% of qualification attempts.
- **SC-007**: Revoking a tenant registration prevents every subsequent new
  dashboard session within one minute while leaving the tenant's durable data
  unchanged.
- **SC-008**: Repository scans, database inspection, response samples, logs,
  telemetry, process inspection, and rollout evidence contain zero credentials,
  tokens, codes, proof-key verifiers, private signing keys, or session cookies.
- **SC-009**: A canary rollback restores the previous protected login path
  within five minutes and preserves all existing Hermes tenant data and native
  dashboard capabilities.
- **SC-010**: The final quality review records explicit results for all five
  review axes, reports zero unresolved Critical or Required findings, and is
  backed by passing targeted tests, the full test suite, type checking, and a
  production build.

## Assumptions

- The first release authorizes only the single owner already recorded on the
  instance; teams, delegated administrators, and shared tenant membership are
  deferred.
- The owner receives the full native Hermes management surface, including
  high-impact configuration and API-key pages, because tenant ownership is the
  administrative boundary.
- A short-lived Hermes session independent of the longer OvernightDesk session
  is acceptable; coordinated global logout is deferred.
- OvernightDesk's existing identity, email verification, session, tenant
  ownership, reverse proxy, and instance lifecycle records remain authoritative.
- Each production tenant has one stable HTTPS dashboard hostname and one exact
  callback under the OvernightDesk-controlled domain.
- A previous protected login configuration can be retained during the canary
  and restored without deleting tenant data.

## Out of Scope

- Replacing, forking, reskinning, or rebuilding the native Hermes dashboard.
- Nous Portal accounts, Nous-hosted customer identity, or Nous-managed tenants.
- Team members, delegated administrators, multiple owners, role management, or
  organization-wide authorization.
- Immediate global logout across OvernightDesk and all Hermes instances.
- Changing Hermes machine API-key authentication or exposing machine API keys
  to browser users.
- Adding arbitrary third-party OIDC clients, public dynamic registration, or a
  general developer OAuth platform.
- Deploying the feature to every tenant before one isolated canary passes the
  complete security, functionality, expiry, restart, and rollback qualification.
