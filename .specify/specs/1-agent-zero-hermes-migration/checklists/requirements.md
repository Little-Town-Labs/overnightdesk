# Requirements Quality Checklist
## Feature 1: Agent Zero — Hermes Migration

**Spec version validated:** 1.0.0
**Checklist version:** 1.0.0
**Validated:** 2026-04-24

---

## Purpose

This checklist validates that `spec.md` meets the quality standards required before planning begins. It does not validate the implementation — it validates the specification itself. Every item must pass before `/speckit-plan` is invoked.

---

## Section 1: No Implementation Details

Specifications define WHAT, not HOW. Implementation details (technology names, script syntax, file paths, specific commands, Docker flags, configuration file formats) belong in the plan, not the spec.

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1.1 | No Docker/container runtime commands in requirements (no `docker run`, `docker stop`, etc.) | PASS | Spec refers to "container start", "container stop" as abstract operator behaviours — no runtime syntax |
| 1.2 | No scripting language references (bash, Python, Go, etc.) | PASS | No language references present |
| 1.3 | No specific file paths in functional requirements | PASS | One path reference (`/opt/{tenantId}/`) appears only in FR-7 as a direct quote from the constitution's decommission retention policy, used as a data location identifier, not an implementation instruction. Acceptable. |
| 1.4 | No CLI command syntax in requirements (no `phase secrets export`, `phase run`, etc.) | PASS | EC-1 and FR-3 reference the "secrets injection mechanism" generically without specifying the CLI command |
| 1.5 | No specific port numbers in functional requirements | PASS | No port numbers in requirements; ports appear only in the roadmap context, not in spec.md |
| 1.6 | No specific image tags or registry references | PASS | hermes-agent is referenced as the engine name, not as a registry image tag |
| 1.7 | No nginx or proxy configuration details | PASS | "routing layer updated" (AC-4.2) is abstract; no nginx config syntax present |
| 1.8 | No database schema or column names | PASS | "fleet event record" and "platform database" are abstract; no schema details |

**Section 1 verdict: PASS**

---

## Section 2: User Stories Are User-Facing

User stories must be written from the perspective of the actor who experiences the value — not from the perspective of the system performing the action.

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 2.1 | All user stories use "As [actor], I want [behaviour], so that [value]" format | PASS | All 5 stories follow the format |
| 2.2 | Actor is Gary (platform operator) throughout, consistent with feature scope | PASS | All stories are written from Gary's perspective |
| 2.3 | "I want" clause describes a capability or outcome, not a technical mechanism | PASS | Stories express operational outcomes (continuity, confidence, safety, reusability, non-disruption) |
| 2.4 | "So that" clause expresses business or operational value | PASS | Each "so that" clause states why the outcome matters to Gary |
| 2.5 | No story uses system-perspective language ("The system shall…", "The service must…") | PASS | All stories are written from Gary's perspective |

**Section 2 verdict: PASS**

---

## Section 3: Acceptance Criteria Are Testable

Every acceptance criterion must be verifiable without interpretation. "Works correctly" is not testable. "Sends a Telegram message within X minutes" is testable.

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 3.1 | Every user story has at least 3 acceptance criteria | PASS | US-1: 4 ACs, US-2: 4 ACs, US-3: 4 ACs, US-4: 4 ACs, US-5: 3 ACs |
| 3.2 | No acceptance criterion uses vague qualifiers ("properly", "correctly", "well", "appropriately") | PASS | All ACs use observable or measurable language |
| 3.3 | Every acceptance criterion describes an observable outcome or behaviour | PASS | All ACs describe states Gary can observe (Telegram message received, fleet event visible, instance running) |
| 3.4 | Timing or quantity references in ACs are specific ("60 consecutive minutes", "30 days", "minimum observation window") | PASS | AC-1.1 specifies 60-minute window; AC-3.1 specifies 30 days; AC-3.2 flags the observation window duration as a clarification |
| 3.5 | Conditional ACs ("if X then Y") are unambiguous about when they apply | PASS | AC-1.3, AC-3.2 (on clarification), EC-1, EC-2 have clear conditions |
| 3.6 | No AC depends on implementation details to be verified | PASS | All ACs are verifiable from operator-observable behaviour |

**Section 3 verdict: PASS**

---

## Section 4: Constitutional Compliance

All requirements must be consistent with the platform constitution v2.0.0.

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 4.1 | Secrets-never-plaintext principle enforced (Constitution Principle 2) | PASS | FR-2, FR-3, NFR-1 all enforce this principle explicitly |
| 4.2 | Container isolation principle maintained (Constitution Principle 1, Pillar C) | PASS | NFR-2 enforces container isolation; no cross-tenant access described |
| 4.3 | 30-day data retention on decommission (Constitution Principle 1) | PASS | FR-7, NFR-3, AC-3.1 all enforce 30-day retention |
| 4.4 | Fleet events logged for all state transitions (Constitution Pillar C) | PASS | FR-6, NFR-4, and multiple ACs require fleet event logging |
| 4.5 | Secret rotation without redeploy (Constitution Principle 2) | PASS | NFR-6 explicitly requires this capability |
| 4.6 | Operator decision gate — no autonomous decommissioning (Constitution Principle 3) | PASS | FR-9 requires explicit operator confirmation; automation may not decommission |
| 4.7 | hermes-agent is the standard engine (Constitution Principle 4, Pillar C) | PASS | Feature is explicitly migrating to hermes-agent; no custom engine |
| 4.8 | No plaintext bearer tokens or credentials stored in platform DB | PASS | FR-2, NFR-1 enforce this; consistent with Principle 2 secrets management |

**Section 4 verdict: PASS**

---

## Section 5: Scope Boundaries Are Clear

The spec must clearly state what is in scope and what is not. Ambiguous scope leads to uncontrolled expansion.

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 5.1 | "Out of Scope" section is present and explicit | PASS | Dedicated out-of-scope section with 6 explicit exclusions |
| 5.2 | The spec does not describe work belonging to Feature 2, 3, or 4 | PASS | Automated provisioner, setup wizard, and web chat explicitly excluded |
| 5.3 | Paying tenant infrastructure is explicitly excluded | PASS | US-5 and Out of Scope both state this clearly |
| 5.4 | Platform frontend (Next.js) changes are explicitly excluded | PASS | Out of Scope states no frontend changes |
| 5.5 | Agent Zero's hermes personality/config is explicitly excluded from feature scope | PASS | Out of Scope identifies this as operational, not platform feature work |

**Section 5 verdict: PASS**

---

## Section 6: Ambiguities Are Flagged

Unresolved ambiguities must be marked `[NEEDS CLARIFICATION]` with a recommendation. The spec allows a maximum of 3 clarification markers.

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 6.1 | Clarification markers are present for genuinely ambiguous items | PASS | 3 markers present |
| 6.2 | Each marker includes a recommendation (not just a question) | PASS | All 3 markers include a "Recommendation:" sentence |
| 6.3 | Total clarification markers do not exceed 3 | PASS | Exactly 3 markers used |
| 6.4 | Clarifications are resolvable by Gary without external research | PASS | All 3 are Gary's own operational preferences (observation window duration, heartbeat interval, reviewer identity) |

**Clarification items requiring Gary's decision before planning:**

| ID | Location | Question | Recommendation |
|----|----------|----------|----------------|
| CL-1 | AC-3.2 | Minimum observation window before legacy decommission sign-off | 48 hours of clean operation (no restarts, no missed heartbeats) |
| CL-2 | FR-5 | Heartbeat interval for new Agent Zero | 30-minute default, configurable via Phase.dev secret |
| CL-3 | AC-4.4 | Who acts as reviewer for the deployment procedure validation test | Gary performs the role by following the procedure for a scratch tenant |

**Section 6 verdict: PASS (pending Gary's decisions on CL-1, CL-2, CL-3)**

---

## Section 7: Success Criteria Are Unambiguous

Success criteria define the exit condition for the feature. They must be verifiable by the owner without interpretation.

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 7.1 | Success criteria are present as a dedicated section | PASS | 7 success criteria listed |
| 7.2 | Each criterion is independently verifiable | PASS | All 7 criteria describe observable states Gary can check |
| 7.3 | Success criteria collectively cover all user stories | PASS | US-1 → SC-1,2,3; US-2 → SC-1,6; US-3 → SC-4,5; US-4 → SC-6; US-5 → SC-7 |
| 7.4 | Success criteria do not include implementation milestones ("script written", "PR merged") | PASS | All criteria describe operational states, not delivery artefacts |

**Section 7 verdict: PASS**

---

## Section 8: Edge Cases Are Operator-Relevant

Edge cases must describe failure modes that the operator or system would actually encounter, not theoretical computer science scenarios.

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 8.1 | Edge cases are present | PASS | 6 edge cases documented |
| 8.2 | Each edge case describes an observable failure scenario | PASS | All 6 are realistic failure modes Gary or the system would encounter |
| 8.3 | Edge cases reference the failure mode and the expected system response, without specifying implementation | PASS | Each EC describes what must NOT happen and what must happen instead, without prescribing mechanism |
| 8.4 | Edge cases do not duplicate the functional requirements | PASS | ECs cover failure-path behaviour; FRs cover happy-path behaviour |

**Section 8 verdict: PASS**

---

## Overall Verdict

| Section | Status |
|---------|--------|
| 1 — No Implementation Details | PASS |
| 2 — User Stories Are User-Facing | PASS |
| 3 — Acceptance Criteria Are Testable | PASS |
| 4 — Constitutional Compliance | PASS |
| 5 — Scope Boundaries Are Clear | PASS |
| 6 — Ambiguities Flagged | PASS (3 open clarifications) |
| 7 — Success Criteria Unambiguous | PASS |
| 8 — Edge Cases Operator-Relevant | PASS |

**Overall: PASS — Ready for `/speckit-clarify` to resolve CL-1, CL-2, CL-3, then proceed to `/speckit-plan`.**

The three open clarification items (CL-1, CL-2, CL-3) do not block spec quality — they are Gary's operational preferences that must be captured before implementation planning can produce concrete acceptance gates. They do not affect the architectural scope of the feature.
