# Feature 2: Hermes Provisioner

**Feature:** 2-hermes-provisioner
**Source:** PRD v3.0 Section 5, Phase 10
**Constitution:** v2.0.0
**Roadmap:** OvernightDesk v2
**Status:** Draft
**Date:** 2026-04-24

---

## Overview

### Platform Operator Perspective

The Hermes Provisioner eliminates all manual work from the tenant lifecycle. Today, bringing a new hermes-agent tenant online requires Gary to SSH into aegis-prod, create directories, configure secrets, write configuration files, start containers, configure nginx, issue TLS certificates, and update the platform database — a multi-step process prone to error, inconsistency, and operator burnout.

After this feature ships, a Stripe payment confirmation is the only trigger required. The provisioner receives the payment event, creates an isolated hermes-agent environment for the new tenant, and reports back to the platform when the instance is live. Gary gets a notification and a fleet event log — he never touches the server. The same automation handles deprovisioning: on subscription cancellation, containers are stopped cleanly, data is preserved for 30 days, and the platform database reflects the new status without any manual intervention.

Failed provisioning attempts surface clearly in the fleet event log and notify Gary. Partial failures do not leave ghost resources — the provisioner is designed so that re-running the same request produces the correct end state.

### Customer Perspective

A paying customer's experience is simple and fast: they complete Stripe checkout, and within a defined time window their hermes-agent instance is live at a personal subdomain with a valid TLS certificate. They receive confirmation that their instance is ready before they have finished reading the welcome email. They see real status — not a permanent spinner — in their dashboard if something goes wrong.

When a customer cancels, their data is not immediately destroyed. For 30 days after cancellation, their tenant data remains preserved on aegis-prod. This gives them a window to export or reconsider before permanent deletion.

---

## User Stories

### US-1 — Operator: Provisioning happens automatically after payment

**As Gary (platform operator), I want every new tenant to be provisioned automatically when their Stripe payment is confirmed, so that I never have to manually SSH into aegis-prod to bring a new instance online.**

Acceptance criteria:
- When a `checkout.session.completed` Stripe event is received and verified, the provisioning workflow begins without any manual intervention.
- The instance record in the platform database progresses through `queued → provisioning → running` with a fleet event logged at each transition.
- Gary receives a notification (fleet event visible in the operator view) confirming successful provisioning, including the tenant's subdomain.

---

### US-2 — Operator: Failed provisioning is visible and retryable

**As Gary, I want failed provisioning attempts to surface clearly with enough context to understand what went wrong, so that I can diagnose and retry without data loss or ghost resources.**

Acceptance criteria:
- If any step of the provisioning workflow fails, the instance status is set to `error` and a fleet event is logged with the failure step and error detail.
- A failed provisioning run does not leave partially created resources in an inconsistent state — re-triggering the provisioner for the same tenant produces the correct end state.
- Gary can identify which step failed (Phase.dev path creation, container start, TLS issuance, health check, etc.) from the fleet event log alone.

---

### US-3 — Operator: Deprovisioning is safe and data is preserved

**As Gary, I want tenant deprovisioning to stop containers and remove routing cleanly while preserving the tenant's data for 30 days, so that accidental cancellations or reactivations can be handled without permanent data loss.**

Acceptance criteria:
- When a `customer.subscription.deleted` Stripe event is received, containers are stopped and the nginx routing configuration for the tenant is removed.
- The tenant's data directory on aegis-prod is retained for at least 30 days from the deprovisioning timestamp before any deletion occurs.
- The instance record is updated to `deprovisioned` status with a fleet event logged at each deprovisioning step.

---

### US-4 — Customer: Instance is live within the provisioning SLA after payment

**As a new customer, I want my hermes-agent instance to be accessible at my personal subdomain within a predictable time window after completing payment, so that I can begin setup immediately without waiting or uncertainty.**

Acceptance criteria:
- The customer's instance is reachable at `{tenantId}.overnightdesk.com` within 5 minutes of payment confirmation under normal operating conditions.
- The subdomain is served over HTTPS with a valid TLS certificate — no browser security warnings.
- The platform dashboard shows the instance status as `running` and provides the subdomain URL once provisioning completes.

---

### US-5 — Customer: Dashboard reflects honest provisioning status

**As a customer waiting for my instance to provision, I want to see the real current status in my dashboard — not a spinner that runs forever — so that I know whether to wait, contact support, or take action.**

Acceptance criteria:
- The customer's dashboard displays the current instance status (`queued`, `provisioning`, `running`, `error`) accurately at all times.
- If provisioning fails, the dashboard shows an error state with a human-readable explanation — not a loading indicator.
- If the instance reaches `running` status while the customer has their dashboard open, the status updates to reflect this without requiring a full page reload.

---

### US-6 — Customer: Data persists for 30 days after cancellation

**As a customer who has cancelled, I want my agent's data to remain preserved for 30 days, so that I have a window to reconsider, export my data, or reactivate before anything is permanently deleted.**

Acceptance criteria:
- After subscription cancellation and container shutdown, the customer can see in their dashboard that their instance is deprovisioned and that data retention is in effect.
- The customer is informed (via the dashboard and a transactional email) of the 30-day data retention window and the date after which data will be permanently deleted.
- No tenant data is permanently deleted during the 30-day retention window, regardless of system events.

---

## Functional Requirements

### Stripe Webhook Handling

**FR-1** — The system must receive and process `checkout.session.completed` Stripe events to initiate tenant provisioning.

**FR-2** — The system must receive and process `customer.subscription.deleted` Stripe events to initiate tenant deprovisioning.

**FR-3** — All Stripe webhook handlers must verify the webhook signature before processing any event.

**FR-4** — All Stripe webhook handlers must be idempotent — receiving the same event multiple times must produce the same end state without duplicating resources, side effects, or fleet events.

---

### Provisioning Workflow

**FR-5** — When provisioning is triggered, the platform must create an instance record with status `queued` and log a fleet event before dispatching work to the provisioner service.

**FR-6** — The provisioner must create a per-tenant isolated secrets path in Phase.dev, scoped exclusively to that tenant's identifier.

**FR-7** — The provisioner must generate a Phase service token scoped to the tenant's secrets path and store it encrypted in the platform database on the instance record.

**FR-8** — The provisioner must create an isolated data directory for the tenant on aegis-prod.

**FR-9** — The provisioner must write the startup script for the tenant's hermes-agent instance into the tenant's directory.

**FR-10** — The provisioner must export Phase.dev secrets into the tenant's environment file before starting the container.

**FR-11** — The provisioner must start the hermes-agent gateway container and dashboard sidecar container for the tenant on the shared Docker network.

**FR-12** — The provisioner must generate and activate an nginx server block routing the tenant's subdomain (`{tenantId}.overnightdesk.com`) to the tenant's running containers.

**FR-13** — The provisioner must issue a TLS certificate for the tenant's subdomain via certbot.

**FR-14** — The provisioner must poll the tenant's health endpoint until the instance responds successfully or a timeout is reached.

**FR-15** — When the health check passes, the platform must update the instance status to `running` and log a fleet event.

**FR-16** — Each step of the provisioning workflow must log a fleet event recording the step name, outcome, and any relevant detail.

**FR-17** — Container security hardening (seccomp, AppArmor, capability restrictions, resource limits) must be applied at provisioning time.

---

### Deprovisioning Workflow

**FR-18** — When deprovisioning is triggered, the provisioner must stop all containers associated with the tenant.

**FR-19** — The provisioner must remove the nginx server block for the tenant's subdomain and reload the nginx configuration.

**FR-20** — The tenant's data directory on aegis-prod must be retained for a minimum of 30 days from the deprovisioning timestamp before any permanent deletion.

**FR-21** — The platform must update the instance record to `deprovisioned` status and log a fleet event.

**FR-22** — Deprovisioning must not delete the tenant's Phase.dev secrets path immediately — retention follows the same 30-day window.

---

### Instance State Tracking

**FR-23** — The platform database must track each instance through the full lifecycle: `queued → provisioning → running → deprovisioned` (with `error` and `stopped` as valid states).

**FR-24** — Every state transition must be accompanied by a fleet event record that includes the actor, the transition, and relevant context.

**FR-25** — The provisioning timestamp and deprovisioning timestamp must be recorded on the instance record.

---

## Non-Functional Requirements

### Idempotency

**NFR-1** — The provisioner must be idempotent at every step. Re-running the provisioner for a tenant that is already partially or fully provisioned must detect the existing state and reach the correct end state without creating duplicate resources.

**NFR-2** — Stripe webhook handlers must guard against double-delivery. Receiving `checkout.session.completed` twice for the same session must not create two instances or trigger two provisioning runs.

---

### Provisioning SLA

**NFR-3** — Under normal operating conditions, a tenant instance must reach `running` status within 5 minutes of the provisioning request being accepted. Resolved: SLA is "container healthy and reachable from aegis-prod". DNS propagation is not part of the SLA — a wildcard A record (*.overnightdesk.com → aegis-prod) ensures all tenant subdomains resolve instantly with no per-tenant DNS changes required.

**NFR-4** — The provisioner must implement a health-check timeout. If the container does not respond within the timeout window, the instance must be marked `error` and a fleet event logged rather than waiting indefinitely.

---

### Security

**NFR-5** — Secrets must flow exclusively through Phase.dev. The provisioner must never write tenant secrets (OpenRouter API keys, messaging tokens, gateway credentials) into the platform database in plaintext or reversible encoding.

**NFR-6** — The Phase service token stored on the instance record must be encrypted at rest.

**NFR-7** — Secrets must be injected into the container at runtime via Phase.dev resolution — never baked into the container image or passed as plaintext environment variables sourced directly from the platform database.

**NFR-8** — The provisioner service must authenticate requests from the platform before executing any provisioning action.

**NFR-9** — The provisioner must apply the full container security baseline at creation time — no tenant container may be started without the required hardening profile.

---

### Observability

**NFR-10** — Every fleet event must include sufficient context for Gary to diagnose a failure without accessing the aegis-prod server directly.

**NFR-11** — The provisioner must not expose infrastructure error details (stack traces, internal paths, credentials) in any surface visible to the customer.

---

## Edge Cases

**EC-1 — Stripe duplicate events:** The same `checkout.session.completed` event is delivered more than once (Stripe retry behaviour). The system must detect that an instance already exists for the payment session and skip re-provisioning. No duplicate instance, no duplicate fleet events.

**EC-2 — Phase.dev API unavailable:** Phase.dev is unreachable when the provisioner attempts to create the tenant path or generate a service token. The provisioner must fail fast, log a fleet event with the failure, mark the instance `error`, and leave the system in a state from which provisioning can be retried cleanly.

**EC-3 — certbot failure:** TLS certificate issuance fails (DNS not yet propagated, rate limit reached, certbot misconfigured). The provisioner must log the failure as a fleet event and mark the instance `error`. The nginx server block must not be left in a broken state that affects other tenants. Resolved: Hard stop. Certbot failure marks the instance as error and halts provisioning. The nginx server block is removed before exiting to leave no broken state. DNS propagation is no longer a cause of certbot failure since the wildcard A record ensures subdomains resolve immediately.

**EC-4 — Container fails health check:** The container starts but does not respond to health checks within the timeout window. The provisioner must stop the container, log the failure with the health check response (or lack thereof), and mark the instance `error`. nginx and TLS resources created up to that point must be cleaned up.

**EC-5 — Partial provisioning failure:** Any step after the Phase.dev path creation fails (directory creation, script write, container start, nginx, TLS). The provisioner must log which step failed, mark the instance `error`, and ensure that re-running the provisioner from that point does not create duplicate resources (idempotent resumption).

**EC-6 — DNS propagation delay:** The tenant subdomain is not externally resolvable immediately after nginx configuration and TLS issuance. The health check must target the container directly (bypassing external DNS) to confirm the instance is healthy — external DNS resolution should not be a gate for the `running` status. The customer-facing dashboard can display the subdomain even if DNS has not fully propagated globally, with appropriate messaging.

**EC-7 — Subscription cancelled during active provisioning:** A cancellation event arrives while provisioning is still in progress. The system must complete or abort the provisioning run cleanly before executing deprovisioning steps — it must not attempt to deprovision a half-provisioned instance concurrently.

**EC-8 — Deprovisioning re-triggered:** A `customer.subscription.deleted` event is delivered multiple times. The deprovisioning handler must be idempotent — detecting an already-deprovisioned instance and skipping redundant work without error.

---

## Success Criteria

### For Gary (Platform Operator)

- A new tenant payment triggers end-to-end provisioning with zero manual SSH sessions required.
- Every provisioning and deprovisioning event is visible in the fleet event log with enough detail to diagnose failures.
- Failed provisioning leaves no orphaned resources (ghost containers, broken nginx blocks, uncleaned directories).
- Provisioning of a net-new tenant completes within 5 minutes under normal conditions.
- The system handles Stripe event retries without creating duplicate instances.

### For the Customer

- The customer's instance is accessible at `{tenantId}.overnightdesk.com` over HTTPS within 5 minutes of payment.
- The platform dashboard shows accurate, real-time provisioning status — no permanent loading states.
- On cancellation, the dashboard shows deprovisioned status and communicates the 30-day data retention window.
- The customer never sees an instance in a permanently ambiguous state.

---

## Out of Scope

The following are explicitly excluded from this feature specification:

- **Secrets collection (Feature 3 — Setup Wizard):** This feature provisions an empty Phase.dev path for the tenant. Populating that path with actual secrets (OpenRouter API key, Telegram bot token, agent personality config) is the responsibility of the self-service setup wizard (Feature 3). The provisioner starts the container with an empty or minimal secrets set.

- **Web chat interface (Feature 4):** nginx `/v1/*` routing to the hermes gateway API on port 8642, and the `API_SERVER_KEY` secret management required for web chat, are out of scope here.

- **Migration of existing manually-provisioned tenants:** Mitchel (`hermes-mitchel`) and any other tenants provisioned manually before this feature are not migrated by this feature. Their management remains manual.

- **Data purge after retention window:** The 30-day data purge job (permanent deletion of deprovisioned tenant data) is not part of this feature's provisioning or deprovisioning flows. It is a separate scheduled operation.

- **Reactivation flow:** Reactivating a cancelled subscription and re-provisioning a deprovisioned tenant from preserved data is out of scope for this feature.

- **Admin dashboard UI:** Gary's visibility into provisioning status is through fleet events in the database and notifications. A dedicated operator admin UI is not part of this feature.
