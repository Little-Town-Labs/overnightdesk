# Requirements Checklist — Feature 2: Hermes Provisioner

**Spec version:** Draft 2026-04-24
**Checklist type:** Requirements quality validation
**Validates:** spec.md

---

## 1. User Story Quality

| # | Check | Pass |
|---|-------|------|
| 1.1 | Every user story follows the "As [role], I want [goal], so that [reason]" format | [x] |
| 1.2 | Each user story has at least 3 acceptance criteria | [x] |
| 1.3 | Acceptance criteria are measurable and testable (not vague adjectives like "fast" or "nice") | [x] |
| 1.4 | Both personas are represented (Gary as operator, customer as end user) | [x] |
| 1.5 | No acceptance criterion describes implementation detail or technology | [x] |
| 1.6 | All 6 user stories are internally consistent — no acceptance criteria contradict each other | [x] |

---

## 2. Functional Requirements Coverage

| # | Check | Pass |
|---|-------|------|
| 2.1 | Every step in the provisioning flow described in the task brief has a corresponding FR | [x] |
| 2.2 | Every step in the deprovisioning flow has a corresponding FR | [x] |
| 2.3 | Stripe webhook handling (both events) is covered by FRs | [x] |
| 2.4 | State transitions (queued → provisioning → running → deprovisioned) are covered by FRs | [x] |
| 2.5 | Fleet event logging is required at each transition (FR-16, FR-24) | [x] |
| 2.6 | Phase service token creation and encrypted storage is a named requirement (FR-7) | [x] |
| 2.7 | TLS certificate issuance is a named requirement (FR-13) | [x] |
| 2.8 | Health check polling before marking instance running is a named requirement (FR-14, FR-15) | [x] |
| 2.9 | 30-day data retention on deprovisioning is a named requirement (FR-20) | [x] |
| 2.10 | Container security hardening is referenced as a provisioning-time requirement (FR-17) | [x] |

---

## 3. Non-Functional Requirements

| # | Check | Pass |
|---|-------|------|
| 3.1 | Idempotency is a named NFR with specific guidance (NFR-1, NFR-2) | [x] |
| 3.2 | Provisioning SLA is stated with a concrete target (NFR-3: 5 minutes) | [x] |
| 3.3 | Health check timeout behaviour is specified as an NFR (NFR-4) | [x] |
| 3.4 | Secrets-through-Phase.dev is a named security NFR (NFR-5) | [x] |
| 3.5 | Phase service token encryption at rest is a named NFR (NFR-6) | [x] |
| 3.6 | Provisioner service authentication is a named NFR (NFR-8) | [x] |
| 3.7 | Observability requirements reference operator-sufficient context without leaking to customers (NFR-10, NFR-11) | [x] |

---

## 4. Edge Case Coverage

| # | Check | Pass |
|---|-------|------|
| 4.1 | Stripe duplicate event delivery is addressed (EC-1) | [x] |
| 4.2 | Phase.dev API unavailability is addressed (EC-2) | [x] |
| 4.3 | certbot / TLS failure is addressed (EC-3) | [x] |
| 4.4 | Container failing health check is addressed (EC-4) | [x] |
| 4.5 | Partial provisioning failure and idempotent resumption is addressed (EC-5) | [x] |
| 4.6 | DNS propagation delay vs health check gating is addressed (EC-6) | [x] |
| 4.7 | Subscription cancellation arriving during active provisioning is addressed (EC-7) | [x] |
| 4.8 | Deprovisioning re-trigger / idempotency is addressed (EC-8) | [x] |

---

## 5. Constitutional Alignment

| # | Check | Pass |
|---|-------|------|
| 5.1 | Spec does not specify implementation technology or framework | [x] |
| 5.2 | No tenant secrets are permitted to flow through the platform database in plaintext — spec enforces this (FR-5, NFR-5, NFR-7) | [x] |
| 5.3 | Container image is referenced by name (`nousresearch/hermes-agent:latest`) — the only permitted image per constitution | [x] |
| 5.4 | All state transitions are required to produce fleet event records — consistent with Pillar C | [x] |
| 5.5 | Deprovisioning 30-day retention matches Principle 1 (Data Sacred) | [x] |
| 5.6 | Idempotency of webhook handlers matches Pillar B and Pillar C requirements | [x] |
| 5.7 | Provisioner authentication requirement is consistent with Principle 2 (Security) | [x] |
| 5.8 | Spec explicitly defers to Feature 3 for secrets population — provisioner only creates the empty path | [x] |

---

## 6. Scope Clarity

| # | Check | Pass |
|---|-------|------|
| 6.1 | Out-of-scope items are explicitly listed | [x] |
| 6.2 | Setup Wizard (Feature 3) is called out as out of scope with clear boundary | [x] |
| 6.3 | Web chat nginx routing (Feature 4) is called out as out of scope | [x] |
| 6.4 | Migration of existing manually-provisioned tenants is called out as out of scope | [x] |
| 6.5 | 30-day purge job is called out as out of scope (separate scheduled operation) | [x] |
| 6.6 | Reactivation flow is called out as out of scope | [x] |
| 6.7 | Admin dashboard UI is called out as out of scope | [x] |

---

## 7. Specification Completeness

| # | Check | Pass |
|---|-------|------|
| 7.1 | Success criteria are defined separately for operator and customer | [x] |
| 7.2 | Success criteria are grounded in the functional requirements and NFRs | [x] |
| 7.3 | All [NEEDS CLARIFICATION] markers include a concrete recommendation | [x] |
| 7.4 | Maximum 3 [NEEDS CLARIFICATION] markers in spec | [x] (2 used) |
| 7.5 | Dependency on Feature 1 (validated provisioning pattern) is acknowledged in context | [x] |
| 7.6 | Spec is written from the user/operator perspective — no implementation bias | [x] |

---

## Summary

**Total checks:** 40
**Passing:** 40
**Failing:** 0

**Clarifications required before planning:**

1. **NFR-3 / EC-6 — SLA boundary vs DNS propagation:** The provisioning SLA is defined as "container healthy and reachable from aegis-prod within 5 minutes." External DNS propagation is explicitly excluded from the SLA. Confirm this is acceptable for the customer-facing dashboard — recommendation is yes, with dashboard messaging to set expectations.

2. **EC-3 — certbot failure handling:** Recommendation is to treat TLS failure as a hard stop rather than bringing the container up over plain HTTP. Confirm this is the intended behaviour before planning begins.

**Spec is ready for `/speckit-plan`** once the two clarifications above are resolved.
