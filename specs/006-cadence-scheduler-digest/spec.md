# Feature Specification: Cadence Scheduler and Digest

**Feature Branch**: `006-cadence-scheduler-digest`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Cadence scheduler and digest for Mitchel prospecting: activate the operating loop with an on-demand morning digest that summarizes today's call queue, stale prospects or deals, and follow-up drafts awaiting approval; provide a documented weekday scheduler path for hermes-mitchel only after manual validation; include follow-up reminder scanning and optional dormant-buyer reactivation candidates; avoid exposing secrets or unnecessary prospect details in logs; provide operator runbook steps to validate, enable, disable, and roll back scheduler jobs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate Morning Digest On Demand (Priority: P1)

As Mitchel, I need Trevor to produce a single morning prospecting digest on demand so I can start the day with the most important calls, stale buyers, and pending follow-up work without manually asking several separate tools.

**Why this priority**: The on-demand digest proves the operating loop before any scheduled automation is enabled.

**Independent Test**: Seed or use existing Trevor data, request a digest for a sales day, and verify the response includes call recommendations, stale candidate summary, follow-up draft approval queue, warnings, and `scheduled=false` without sending messages or changing records unless explicitly requested by an existing call queue option.

**Acceptance Scenarios**:

1. **Given** Trevor has active prospects and no follow-up drafts, **When** Mitchel requests today's digest, **Then** Trevor returns a ranked call section plus an empty follow-up approval section.
2. **Given** Trevor has draft follow-ups awaiting approval, **When** Mitchel requests today's digest, **Then** Trevor includes those drafts by prospect, channel, and age without exposing full draft bodies unless explicitly requested elsewhere.
3. **Given** Trevor has stale prospects or overdue next actions, **When** Mitchel requests today's digest, **Then** Trevor includes a stale-work section with reason labels and suggested next step categories.

---

### User Story 2 - Review Follow-Up and Stale Work Reminders (Priority: P2)

As Trevor, I need to identify follow-up drafts and stale buyer records that should appear in the daily cadence so Mitchel can clear pending work before it becomes neglected.

**Why this priority**: The digest is only useful if it surfaces follow-up approval and stale-work queues, not just new calls.

**Independent Test**: Seed draft, approved, and discarded follow-up rows plus prospects with overdue next actions, request a digest, and verify only actionable drafts and stale records appear with counts and bounded details.

**Acceptance Scenarios**:

1. **Given** draft follow-ups exist, **When** the digest is generated, **Then** Trevor lists drafts awaiting approval and excludes discarded or already completed items.
2. **Given** a prospect has an overdue next action or no recent touch, **When** the digest is generated, **Then** Trevor lists the prospect in stale work with a reason that does not require reading raw notes.
3. **Given** a prospect is marked do-not-contact, **When** stale work is scanned, **Then** Trevor suppresses outreach recommendations and labels the record for review only if it must appear.

---

### User Story 3 - Document and Validate Scheduler Enablement (Priority: P3)

As the operator, I need a scheduler path that can be validated on demand before enabling weekday automation, and a clear disable/rollback procedure if the digest becomes noisy or unsafe.

**Why this priority**: Scheduled jobs affect production behavior. The path must be observable and reversible before it runs automatically.

**Independent Test**: Review the runbook and execute the scheduler command in dry-run or on-demand mode, then verify the documented enable, disable, validation, and rollback steps are complete without enabling a cron job by default.

**Acceptance Scenarios**:

1. **Given** Feature 6 is deployed, **When** the operator follows the validation steps, **Then** they can run the digest manually and confirm expected output before scheduling.
2. **Given** the digest has passed manual validation, **When** the operator chooses to enable scheduling, **Then** the runbook describes the weekday schedule, service owner, log location, and disable command.
3. **Given** scheduler output is wrong, noisy, or unsafe, **When** the operator follows rollback steps, **Then** scheduled execution stops without deleting Trevor data.

---

### Edge Cases

- No active prospects, call tasks, follow-up drafts, or stale records exist for the selected day.
- Production has no captured interactions yet, so stale/follow-up sections must be empty but still present.
- Follow-up drafts exist for do-not-contact prospects.
- Existing daily call queue generation would create tasks if persistence is requested; digest defaults must avoid unexpected writes.
- The scheduler is configured but disabled, or the configured run time is outside weekday business cadence.
- Logs must not contain secrets, database URLs, full prospect notes, or full follow-up draft bodies.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an on-demand daily cadence digest for a selected sales day.
- **FR-002**: Digest MUST include a call queue summary using the existing Mitchel call queue behavior.
- **FR-003**: Digest MUST include a follow-up approval section for draft follow-ups awaiting review.
- **FR-004**: Digest MUST include a stale-work section for overdue next actions, stale quoted or negotiating buyers, and dormant reactivation candidates when available.
- **FR-005**: Digest MUST return counts for call recommendations, stale items, follow-up drafts awaiting approval, suppressed do-not-contact records, and warnings.
- **FR-006**: Digest MUST default to no unexpected writes. Any persistence of call tasks must be explicit and reuse the existing call queue persistence behavior.
- **FR-007**: Digest MUST avoid sending outbound messages, creating follow-up drafts, approving drafts, or marking interactions sent.
- **FR-008**: Digest MUST suppress do-not-contact prospects from outreach recommendations and label any necessary appearance as review-only.
- **FR-009**: Digest MUST bound prospect detail in output and logs to operational summaries, avoiding full notes, secrets, database URLs, and full follow-up draft bodies.
- **FR-010**: System MUST expose enough information for Mitchel to decide the next action without requiring raw SQL or manual database inspection.
- **FR-011**: System MUST provide a documented scheduler path for weekday digest execution after manual validation.
- **FR-012**: Scheduler documentation MUST include validation, enable, disable, rollback, owner, log location, and expected side-effect checks.
- **FR-013**: Scheduled execution MUST NOT be enabled by default as part of this feature unless the operator explicitly performs the documented enable step.
- **FR-014**: Digest responses MUST clearly indicate whether they were produced on demand or by a scheduled run.

### Key Entities *(include if feature involves data)*

- **CadenceDigestRequest**: A request for a daily digest, including sales day, limit, persistence choice, and whether the run is scheduled or on demand.
- **CadenceDigest**: The generated daily summary containing call queue, stale work, follow-up approvals, counts, warnings, and run metadata.
- **StaleWorkItem**: A prospect or buyer record needing review because of overdue next action, stale quote or negotiation status, or dormant reactivation criteria.
- **FollowUpApprovalItem**: A stored follow-up draft waiting for Mitchel approval, summarized by prospect, channel, status, and age.
- **SchedulerRunbook**: Operator-facing instructions for validating, enabling, disabling, and rolling back scheduled digest execution.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Mitchel can request a daily digest on demand and receive all required sections in a single response in under 10 seconds for current production scale.
- **SC-002**: A digest generated with default options creates zero new interactions, follow-up drafts, approvals, sends, or scheduler jobs.
- **SC-003**: 100% of actionable draft follow-ups with status `draft` appear in the follow-up approval section up to the configured limit.
- **SC-004**: 100% of do-not-contact prospects are suppressed from outreach recommendations in digest output.
- **SC-005**: Operator documentation allows a second engineer or agent to validate, enable, disable, and roll back the scheduler path without inspecting prior chat context.
- **SC-006**: Production verification can confirm digest availability, scheduler disabled-by-default posture, and unchanged side-effect counts after deployment.

## Assumptions

- Feature 6 builds on the existing Trevor DB MCP server and tenant skill pattern used by Features 2 through 5.
- Initial delivery prioritizes on-demand digest generation and scheduler documentation; automatic weekday scheduling remains opt-in after validation.
- Dormant-buyer reactivation candidates are advisory only until inventory matching exists.
- Existing `trevor.prospects`, `trevor.call_tasks`, `trevor.interactions`, and `trevor.followup_drafts` remain the source of truth.
- No direct outbound channel send is in scope.
