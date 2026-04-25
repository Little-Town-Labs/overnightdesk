# Requirements Checklist — Feature 3: Self-Service Setup Wizard

**Spec version:** Draft 2026-04-23
**Checklist type:** Requirements quality validation
**Validates:** spec.md

---

## 1. User Story Quality

| # | Check | Pass |
|---|-------|------|
| 1.1 | Every user story follows the "As [role], I want [goal], so that [reason]" format | [x] |
| 1.2 | Each user story has at least 3 acceptance criteria | [x] |
| 1.3 | Acceptance criteria are measurable and testable (not vague adjectives like "easy" or "nice") | [x] |
| 1.4 | Both personas are represented (customer as end user, Gary as operator perspective in overview) | [x] |
| 1.5 | No acceptance criterion describes implementation detail or technology | [x] |
| 1.6 | All 6 user stories are internally consistent — no acceptance criteria contradict each other | [x] |
| 1.7 | The "skip optional steps" story (US-2) makes clear which steps are optional and which are required | [x] |
| 1.8 | The "invalid key" story (US-3) specifies that advancement is blocked, not just warned | [x] |
| 1.9 | The "abandoned wizard" story (US-6) specifies that provisioning is NOT triggered on partial completion | [x] |

---

## 2. Functional Requirements Coverage

| # | Check | Pass |
|---|-------|------|
| 2.1 | The critical ordering constraint (wizard before provisioning) is a named requirement (FR-1, FR-2) | [x] |
| 2.2 | Stripe webhook is explicitly prohibited from triggering provisioning (FR-2) | [x] |
| 2.3 | Wizard completion state tracking per instance is a named requirement (FR-3) | [x] |
| 2.4 | All three wizard steps (OpenRouter key, Telegram, personality) have corresponding FRs | [x] |
| 2.5 | Server-side validation of the OpenRouter key is a named requirement (FR-5) | [x] |
| 2.6 | Secrets write must precede provisioning trigger (FR-16, FR-17, FR-18) | [x] |
| 2.7 | Provisioning trigger on wizard completion is a named requirement (FR-17) | [x] |
| 2.8 | Atomic secrets write before provisioning is a named requirement (FR-16) | [x] |
| 2.9 | Provisioning must not fire if secrets write fails (FR-18) | [x] |
| 2.10 | Real-time status update without full page reload is a named requirement (FR-21) | [x] |
| 2.11 | Dashboard transition to hub on `running` status is a named requirement (FR-22) | [x] |
| 2.12 | Error state display (not permanent spinner) on provisioning failure is a named requirement (FR-23) | [x] |
| 2.13 | Settings page credential update flow has corresponding FRs (FR-24 through FR-28) | [x] |
| 2.14 | Container restart on credential update is a named requirement (FR-27) | [x] |
| 2.15 | Default values for skipped personality step are a named requirement (FR-15) | [x] |
| 2.16 | Skipping Telegram must result in no Telegram secrets written (FR-11) | [x] |
| 2.17 | Wizard completion fleet event is a named requirement (FR-19) | [x] |

---

## 3. Non-Functional Requirements

| # | Check | Pass |
|---|-------|------|
| 3.1 | No secrets may be stored in the platform database in plaintext — named NFR (NFR-1) | [x] |
| 3.2 | Server-side-only transmission of secrets is a named NFR (NFR-2) | [x] |
| 3.3 | Server-side-only validation (no client exposure of key) is a named NFR (NFR-3) | [x] |
| 3.4 | No logging of secret values at any log level is a named NFR (NFR-4) | [x] |
| 3.5 | Secrets isolation between tenants is a named NFR (NFR-5) | [x] |
| 3.6 | Plain-language instructions for non-technical users is a named NFR (NFR-6) | [x] |
| 3.7 | Direct links to external credential sources (openrouter.ai/keys, @BotFather) are a named NFR (NFR-7) | [x] |
| 3.8 | Mobile responsiveness is a named NFR (NFR-8) | [x] |
| 3.9 | Five-minute completion target for non-technical users is a named NFR (NFR-9) | [x] |
| 3.10 | Plain-language error messages (no raw error codes) is a named NFR (NFR-10) | [x] |
| 3.11 | Retry-safe secrets write failure handling is a named NFR (NFR-11) | [x] |
| 3.12 | Session expiry during wizard returns customer to correct step (NFR-12) | [x] |

---

## 4. Edge Case Coverage

| # | Check | Pass |
|---|-------|------|
| 4.1 | Invalid/expired OpenRouter key is addressed (EC-1) | [x] |
| 4.2 | Secrets store write failure is addressed with retry path (EC-2) | [x] |
| 4.3 | Provisioning failure after successful wizard completion is addressed (EC-3) | [x] |
| 4.4 | Customer abandons wizard mid-way is addressed (EC-4) | [x] |
| 4.5 | Customer attempts to re-open wizard on a running instance is addressed (EC-5) | [x] |
| 4.6 | Race condition between Stripe webhook and wizard-gated provisioning is addressed (EC-6) | [x] |
| 4.7 | Concurrent credential update while container is restarting is addressed (EC-7) | [x] |
| 4.8 | Partial Telegram configuration (token without user IDs or vice versa) is addressed (EC-8) | [x] |

---

## 5. Constitutional Alignment

| # | Check | Pass |
|---|-------|------|
| 5.1 | Spec does not specify implementation technology, framework, or SDK | [x] |
| 5.2 | No tenant secret is permitted to flow through the platform database in plaintext — spec enforces this (NFR-1, NFR-2, FR-7, FR-10) | [x] |
| 5.3 | Secrets flow to the per-tenant secrets store path exclusively (consistent with Principle 2 — Security and Principle 1 — Data Sacred) | [x] |
| 5.4 | Wizard completion is required before provisioning fires — consistent with Pillar C (provisioning orchestration) | [x] |
| 5.5 | Fleet event logging is required at wizard completion (FR-19) — consistent with Pillar C | [x] |
| 5.6 | Error states are shown honestly to the customer (FR-23, NFR-10) — consistent with Principle 6 (Honesty) | [x] |
| 5.7 | Non-technical user experience is a named NFR (NFR-6) — consistent with Principle 8 (Platform Quality) | [x] |
| 5.8 | Mobile responsiveness is a named NFR (NFR-8) — consistent with Principle 8 | [x] |
| 5.9 | Settings credential updates do not require Gary's involvement — consistent with Principle 7 (Owner's Time Protected) | [x] |
| 5.10 | Spec is silent on implementation (no "React", no "API route", no "Phase SDK") — requirements only | [x] |

---

## 6. Ordering Constraint Integrity

| # | Check | Pass |
|---|-------|------|
| 6.1 | The spec explicitly states that the Stripe webhook must NOT trigger provisioning (FR-2) | [x] |
| 6.2 | The spec explicitly states that provisioning is triggered by wizard completion only (FR-17) | [x] |
| 6.3 | The spec explicitly states that secrets must be written before provisioning is triggered (FR-16, FR-17, FR-18) | [x] |
| 6.4 | The edge case for the Stripe-before-wizard race is addressed (EC-6) | [x] |
| 6.5 | The spec addresses what happens when wizard is abandoned (provisioning not triggered, instance stays `queued`) (EC-4) | [x] |
| 6.6 | The spec addresses what happens if the customer never completes the wizard (instance stays `queued`, wizard always shown) (FR-1) | [x] |

---

## 7. Out of Scope Clarity

| # | Check | Pass |
|---|-------|------|
| 7.1 | Agent model selection is explicitly out of scope | [x] |
| 7.2 | Agent system prompt / SOUL.md customisation is explicitly out of scope | [x] |
| 7.3 | Discord bridge is explicitly out of scope (future feature) | [x] |
| 7.4 | Billing changes are explicitly out of scope (Stripe Customer Portal) | [x] |
| 7.5 | SSH / direct container access is explicitly out of scope | [x] |
| 7.6 | Data export is explicitly out of scope | [x] |

---

## 8. Clarifications Required

| # | Clarification | Recommendation in Spec | Resolved |
|---|---------------|------------------------|---------|
| C-1 | US-6: Should partially-completed wizard steps pre-populate on return (masked display vs. re-entry required)? | Show masked placeholder for completed steps; require re-entry to change; clear partial input on return | [ ] |
| C-2 | FR-29: Should Settings credential updates re-validate the OpenRouter key before writing, same as the wizard? | Yes — validate on save to prevent a bad key update causing a non-functional agent restart | [ ] |
| C-3 | EC-6: Should the instance use a distinct status value (e.g. `awaiting_provisioning`) to separate "payment received, wizard pending" from "wizard complete, ready to provision" to prevent the Stripe-before-wizard race? | Yes — a dedicated status gate removes ambiguity and makes the provisioner's guard condition unambiguous | [ ] |
