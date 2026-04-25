# Requirements Checklist — Feature 4: Web Chat Interface

**Spec:** `/mnt/f/overnightdesk/.specify/specs/4-web-chat-interface/spec.md`
**Checklist version:** 1.0.0
**Date:** 2026-04-23
**Validator:** Gary Brown / LittleTownLabs

---

## Instructions

Each item below represents a quality gate for the specification. Review `spec.md` and mark each item `[x]` when satisfied, or `[ ]` with a note when the spec needs revision. A spec may not proceed to `/speckit-plan` until all items are resolved.

---

## 1. Completeness

- [x] The spec has an Overview that explains what the feature does and why it exists.
- [x] The spec has User Stories covering all primary customer interactions (minimum 4).
- [x] Every User Story has at least 3 Acceptance Criteria.
- [x] The spec has Functional Requirements (FR-N) covering all behaviors implied by the user stories.
- [x] The spec has Non-Functional Requirements covering performance, security, and responsiveness.
- [x] The spec has an Edge Cases section covering failure modes and boundary conditions.
- [x] The spec has an Out of Scope section defining explicit exclusions.
- [x] The spec has Success Criteria that are objectively verifiable.

---

## 2. Clarity and User-Centricity

- [x] All functional requirements are stated from the user/system perspective ("SHALL"), not as implementation instructions.
- [x] No implementation technology is named in the functional or non-functional requirements (no "Vercel AI SDK", "useChat", "API route", "Next.js", "React component").
- [x] User stories use the standard "As a / I want / So that" format.
- [x] Acceptance criteria are specific enough to be testable — each one can be verified as pass/fail.
- [x] Error messages described in the spec use plain language and do not reference internal system names.

---

## 3. Security Requirements

- [x] The spec explicitly states that the hermes API credential (`API_SERVER_KEY`) must never reach the browser.
- [x] The spec requires server-side session verification before any request is proxied.
- [x] The spec requires tenant isolation — one customer cannot proxy requests to another tenant's agent.
- [x] The spec prohibits exposing internal error details to the customer (raw HTTP codes, stack traces, infrastructure hostnames).
- [x] The spec requires input validation on the server-side endpoint.
- [x] The spec confirms that no conversation content is stored in the platform database.

---

## 4. Constitutional Alignment

- [x] **Principle 1 (Data Sacred):** The spec prohibits platform-side storage of conversation content. Out of Scope explicitly lists admin visibility into tenant conversations.
- [x] **Principle 2 (Security):** FR-18 through FR-22 implement the server-side-only proxy pattern with session verification and credential isolation.
- [x] **Principle 4 (Simple Over Clever):** The spec does not introduce scope beyond what is described in the roadmap. No speculative features added.
- [x] **Principle 6 (Honesty):** Error states are required to be honest and actionable (FR-23 through FR-25, EC-1 through EC-8). NC-3 recommends an inline status banner rather than hiding the tab.
- [x] **Principle 7 (Owner's Time):** The feature requires no manual intervention from the platform owner for normal operation.
- [x] **Principle 8 (Platform Quality):** NFR-7 through NFR-9 enforce mobile responsiveness. FR-12 requires a visual in-progress indicator. All error states have customer-facing next actions.
- [x] **Test-First Imperative:** Success Criterion 8 explicitly requires 80% test coverage on the server-side endpoint, consistent with the constitutional minimum.

---

## 5. Scope Discipline

- [x] The feature scope matches the roadmap description for Feature 4 (Web Chat Interface).
- [x] Cross-session persistence is explicitly excluded (Out of Scope and US-5 AC-5.3).
- [x] File uploads, voice, multi-agent selection, and conversation export are explicitly excluded.
- [x] Admin access to tenant conversations is explicitly excluded and attributed to Principle 1.
- [x] The feature is gated to hermes tenants only (FR-1, FR-4).
- [x] No requirements reference features beyond Feature 4's boundaries (model selector deferred to future — NC-2).

---

## 6. Testability

- [x] Each functional requirement can be verified through a test (unit, integration, or E2E).
- [x] Security requirements (FR-18 through FR-22) are verifiable via browser developer tools and server-side test assertions.
- [x] NFR-1 (3-second first-token latency) is a measurable threshold.
- [x] NFR-7 (375px mobile viewport) is a concrete, testable dimension.
- [x] Success criteria are objectively binary — each can be verified as met or not met.

---

## 7. Ambiguities and Open Items

- [ ] **NC-1 (Conversation history limit):** Recommendation provided. Confirm: display full session history up to 100 message pairs, no pagination.
- [ ] **NC-2 (Model selection):** Recommendation provided. Confirm: single default model per tenant for this feature; model selector deferred.
- [ ] **NC-3 (Chat tab visibility in non-running states):** Recommendation provided. Confirm: show Chat tab always for hermes tenants; display inline status banner when instance is not `running`.

*These three items are marked `[NEEDS CLARIFICATION]` in spec.md. Owner review and resolution is required before `/speckit-plan` proceeds.*

---

## 8. Dependency Verification

- [x] The spec acknowledges that Feature 2 (Hermes Provisioner) must be complete — running hermes containers are a prerequisite.
- [x] The spec acknowledges that Feature 3 (Setup Wizard) must be complete — `API_SERVER_KEY` in Phase.dev is required.
- [x] The spec does not introduce new dependencies beyond those listed in the roadmap.

---

## Checklist Result

| Section | Status |
|---------|--------|
| 1. Completeness | PASS |
| 2. Clarity and User-Centricity | PASS |
| 3. Security Requirements | PASS |
| 4. Constitutional Alignment | PASS |
| 5. Scope Discipline | PASS |
| 6. Testability | PASS |
| 7. Ambiguities | 3 OPEN ITEMS (NC-1, NC-2, NC-3) |
| 8. Dependency Verification | PASS |

**Overall:** CONDITIONAL PASS — Spec is ready for owner review of NC-1, NC-2, NC-3. Once those three items are resolved (accept recommendations or provide alternative decisions), the spec may proceed to `/speckit-clarify` and then `/speckit-plan`.
