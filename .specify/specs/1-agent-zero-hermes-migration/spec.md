# Feature 1: Agent Zero — Hermes Migration

**Spec version:** 1.1.0
**Status:** Draft
**Owner:** Gary Brown / LittleTownLabs
**Created:** 2026-04-24
**Constitution:** v2.0.0
**Roadmap ref:** Feature 1, Priority P0

---

## Overview

Agent Zero is Gary's own instance on aegis-prod — the platform's embedded ops agent that monitors the fleet, sends Telegram notifications, and provides operational support. Currently it runs on the legacy Go daemon engine (overnightdesk-tenant-0).

This feature migrates Agent Zero from the legacy engine to hermes-agent, the standard platform engine adopted in constitution v2.0.0. The migration achieves two outcomes simultaneously:

**Operational:** Gary gains an ops agent with OpenRouter model routing and the full hermes-agent capability set, replacing a deprecated engine that will no longer receive updates.

**Architectural:** The migration validates the secrets injection pattern — the mechanism by which the platform writes secrets to Phase.dev and injects them into a hermes-agent container at start time. If it works cleanly for Agent Zero, the resulting deployment procedure becomes the authoritative template for the automated provisioner (Feature 2).

**Approach:** A clean swap. Stop the Go daemon container, wire hermes-agent in its place, configure Phase.dev secrets path, start it up. No parallel running period — if hermes-agent fails to start correctly, stop it and restart the Go daemon. Rollback is trivial because the Go daemon's data volume is untouched.

**Scope:** This work affects Gary's infrastructure only. No paying tenant (including Mitchel) is touched. Mitchel's hermes-agent setup is already running independently and is not part of this feature.

---

## User Stories

---

### US-1: Clean Swap with Instant Rollback

**As** Gary, the platform operator,
**I want** Agent Zero to be replaced with hermes-agent in a single controlled swap,
**so that** the migration is simple, reversible, and entirely within my control.

**Acceptance Criteria:**

- AC-1.1: The Go daemon container is stopped cleanly before the hermes-agent container is started — no parallel running period required.
- AC-1.2: If hermes-agent fails to start or is unhealthy after start, the Go daemon can be restarted immediately to restore Agent Zero with no data loss — the Go daemon's data volume is not modified during the swap.
- AC-1.3: After a successful swap, Gary's Telegram receives hermes-agent heartbeats and Agent Zero responds to Gary's commands.
- AC-1.4: The swap is logged as a fleet event visible in the platform dashboard.

---

### US-2: Secrets Pattern Validation Before Touching Paying Tenants

**As** Gary, the platform operator,
**I want** the secrets injection pattern (Phase.dev export → hermes-agent container) to be validated end-to-end on my own instance before it is used for any paying tenant,
**so that** I have confidence the mechanism works correctly and any failure modes are discovered on infrastructure I control, not on a customer's instance.

**Acceptance Criteria:**

- AC-2.1: The hermes-agent instance for Agent Zero reads all its required credentials exclusively from the injected secrets at container start time — no credential is hardcoded or passed in plaintext outside the Phase.dev injection mechanism.
- AC-2.2: Gary can verify that the secrets were correctly loaded by observing Agent Zero's operational behaviour (successful model calls, Telegram connectivity) without needing to inspect the container internals.
- AC-2.3: The deployment procedure used to start Agent Zero is captured in a repeatable, parameterised form that requires only tenant-specific values to produce an equivalent hermes-agent instance for any other tenant.
- AC-2.4: The parameterised deployment procedure is reviewed and confirmed by Gary before Feature 2 (automated provisioner) may begin specification.

---

### US-3: Safe Legacy Data Retention After Swap

**As** Gary, the platform operator,
**I want** the Go daemon tenant-0 data to be preserved after the swap,
**so that** I can roll back at any time if hermes-agent proves problematic, without losing operational history.

**Acceptance Criteria:**

- AC-3.1: The Go daemon container is stopped but its data volume is not deleted or modified during the swap.
- AC-3.2: Gary can reinstate the Go daemon at any point after the swap by starting it against its unchanged data volume — no observation window gate required.
- AC-3.3: Permanent decommissioning of the legacy data volume requires an explicit operator action and is logged as a fleet event with timestamp and operator identity.
- AC-3.4: Legacy data is retained for a minimum of 30 days after Gary explicitly decommissions it, consistent with the platform data retention policy.

---

### US-4: Reusable Deployment Procedure as Provisioner Template

**As** Gary, the platform operator,
**I want** the deployment procedure validated on Agent Zero to serve as the authoritative template for all future tenant provisioning,
**so that** Feature 2 (automated provisioner) is built on a pattern I have personally validated rather than on an untested design.

**Acceptance Criteria:**

- AC-4.1: The deployment procedure is documented in a tenant-agnostic form — all Agent Zero-specific values (tenant identifier, secrets paths, networking configuration) are clearly identified as parameters rather than fixed values.
- AC-4.2: The procedure covers the complete lifecycle: secrets written to Phase.dev → secrets injected into container at start → container health confirmed → routing layer updated.
- AC-4.3: The procedure identifies and documents failure modes encountered during Agent Zero's migration so the automated provisioner can handle them programmatically.
- AC-4.4: A second member of the platform team (or Gary acting as reviewer) can follow the documented procedure for a new tenant identifier and produce a running hermes-agent instance, confirming the procedure is self-contained.

    **Resolved:** Gary follows the procedure manually for a scratch tenant identifier as the acceptance test, then discards it.

---

### US-5: No Impact on Other Tenants

**As** Gary, the platform operator,
**I want** the swap to be entirely contained to Agent Zero infrastructure,
**so that** Mitchel's running hermes-agent instance and any other tenant is completely unaffected.

**Acceptance Criteria:**

- AC-5.1: No other tenant container, routing configuration, or Phase.dev path is touched during the swap.
- AC-5.2: Platform-wide shared infrastructure (nginx, certbot) is not modified.
- AC-5.3: Mitchel's instance (`hermes-mitchel`) continues running without interruption throughout the entire swap.

---

## Functional Requirements

### FR-1: Hermes Agent Zero Instance

The platform must support an operator-owned hermes-agent instance, identified as Agent Zero, running as a first-class tenant on aegis-prod. This instance is owned by Gary and is not subject to billing or subscription lifecycle events.

### FR-2: Secrets Stored in Phase.dev

All credentials required by Agent Zero — including model API keys, messaging tokens, and any gateway credentials — must be stored in Phase.dev under the designated Agent Zero secrets path. No credential may reside in plaintext in the platform database, in any configuration file on the host, or in the container image.

### FR-3: Secrets Injection at Container Start

Agent Zero's hermes-agent container must receive all secrets by injection at start time via the platform's standard secrets injection mechanism. The container must not start successfully if required secrets are absent from Phase.dev at the time of injection.

### FR-4: Telegram Notification Connectivity

Agent Zero must be capable of sending and receiving Telegram messages to Gary's confirmed account after migration. Fleet monitoring notifications (heartbeats, health alerts, container status changes) must be delivered via Telegram.

### FR-5: Fleet Heartbeat Behaviour

Agent Zero must emit periodic heartbeat signals detectable by Gary via Telegram. Heartbeat scheduling is managed natively by hermes-agent's built-in cron and scheduler — no platform-level configuration of the heartbeat interval is required.

### FR-6: Fleet Event Logging for State Transitions

Every state transition in the Agent Zero lifecycle — start, stop, restart, health check pass/fail, cutover from legacy, decommissioning of legacy — must be recorded as a fleet event in the platform database, consistent with the fleet event schema used by all tenant instances.

### FR-7: Legacy Instance Decommissioning

The legacy Go daemon tenant-0 instance must be decommissionable via a controlled operator action. The decommission must stop the legacy instance, retain its data for a minimum of 30 days, and record the action as a fleet event. Decommissioning must not be irreversible within the 30-day retention window.

### FR-8: Health Check Before Cutover

Before Gary authorises decommissioning of the legacy instance, Agent Zero's hermes-agent instance must pass a defined health check that confirms: the container is running, the hermes API is responding, and Telegram connectivity is active.

### FR-9: Operator Confirmation Gate

Decommissioning of the legacy instance requires an explicit operator confirmation action. No automated process may decommission the legacy instance; the gate must require deliberate operator intent.

### FR-10: Deployment Procedure Capture

The process used to provision Agent Zero must be captured in a parameterised, repeatable form at the conclusion of this feature. This captured procedure is the canonical input to Feature 2 specification.

---

## Non-Functional Requirements

### NFR-1: Security — Secrets Never Plaintext

No credential used by Agent Zero may be stored in plaintext outside of Phase.dev. This applies to the host filesystem, the platform database, container environment variables passed outside the secrets injection mechanism, and any intermediate files used during deployment. This is a hard constraint with no exceptions (Constitution Principle 2).

### NFR-2: Container Isolation

Agent Zero's hermes-agent container must run in isolation from all other tenant containers. No shared filesystem mounts, no shared network namespaces, and no cross-container process visibility are permitted. Container security baseline (capability restrictions, read-only rootfs where compatible) applies as per Pillar C.

### NFR-3: Data Retention on Decommission

Legacy tenant-0 data must be retained for a minimum of 30 days after decommissioning before any purge is permitted. This matches the platform's deprovisioning retention policy for all tenants (Constitution Principle 1).

### NFR-4: Fleet Event Completeness

Every observable state change in Agent Zero's lifecycle must produce a fleet event record. A missing event is a compliance failure, not a cosmetic issue. Fleet events are the audit trail that establishes what happened and when.

### NFR-5: Rollback Availability

During the observation window after cutover, it must be possible for Gary to reinstate the legacy instance as the active ops agent without data loss. Rollback capability expires when Gary signs off on decommissioning.

### NFR-6: Secret Rotation Without Redeploy

It must be possible to rotate any credential used by Agent Zero by updating its value in Phase.dev and restarting the container, with no changes to deployment scripts, container images, or platform configuration. This is required by Constitution Principle 2 (secrets management).

---

## Edge Cases

### EC-1: Phase.dev Export Fails at Container Start

If the secrets injection mechanism fails to retrieve credentials from Phase.dev at container start time — due to a network issue, an expired service token, or a missing secret path — the hermes-agent container must not start in a degraded state with missing credentials. The failure must be surfaced as a fleet event and Gary must be notified (via whatever channel is still reachable, potentially the legacy instance if it is still running).

### EC-2: Hermes-Agent Fails First Health Check

If the hermes-agent instance starts but fails the post-start health check (API not responding, Telegram connectivity absent), the legacy Go daemon must not be decommissioned. Gary must be notified of the failure so he can investigate before the cutover is attempted again.

### EC-3: Go Daemon Mid-Job at Swap Time

If the Go daemon is executing an active task when the swap is initiated, Gary should wait for it to complete before stopping the container. The swap procedure must surface the active job state so Gary can make an informed decision before proceeding.

### EC-5: Phase.dev Path Conflict with Existing Tenant Data

If the secrets path designated for Agent Zero in Phase.dev conflicts with or overwrites an existing path used by another tenant, the migration must be aborted without touching the conflicting tenant's secrets.

### EC-6: aegis-prod Capacity During Parallel Operation

During the observation window, two instances (legacy + hermes) are running simultaneously. If aegis-prod's available memory or CPU is insufficient to run both, the priority is to keep the legacy instance running (existing operational baseline) while the new instance fails gracefully, rather than evicting the legacy instance.

---

## Success Criteria

Gary considers Feature 1 complete when all of the following are true:

1. Agent Zero is running as a hermes-agent instance on aegis-prod, receiving its credentials via the platform secrets injection mechanism from Phase.dev, with no plaintext credentials on disk or in the platform database.
2. Agent Zero sends periodic heartbeat messages to Gary's Telegram and responds to Gary's commands via Telegram.
3. Agent Zero's fleet events appear in the platform dashboard alongside events from other tenant instances.
4. Gary has observed the new instance operating without incident for the agreed observation window (see AC-3.2).
5. The legacy Go daemon tenant-0 instance has been decommissioned via the operator confirmation gate, and a fleet event records the decommission.
6. The deployment procedure has been captured in parameterised form and Gary has confirmed it is self-contained and reusable (see AC-4.4).
7. No paying tenant's instance, routing configuration, or secrets path was modified during this feature.

---

## Out of Scope

The following are explicitly excluded from this feature:

- **No migration of Mitchel (aero-fett) or any paying tenant.** This feature touches only tenant-0 / Agent Zero infrastructure.
- **No changes to the automated provisioner.** Feature 2 (Hermes Provisioner) is a separate feature that begins after this feature's deployment procedure is validated.
- **No changes to the OvernightDesk platform frontend (Next.js application).** This feature is purely infrastructure and operational.
- **No hermes-agent configuration development.** The agent's personality, memory configuration, and system prompt (hermes `SOUL.md` / `config.yaml` equivalent) are an operational concern, not a platform feature.
- **No changes to any Phase.dev path except the Agent Zero-designated path.** Existing tenant paths are untouched.
- **No new platform dashboard UI.** Fleet events logged by this feature are visible through the existing fleet events display; no new UI is required.
- **No billing or subscription changes.** Agent Zero is an operator-owned instance outside the billing lifecycle.
