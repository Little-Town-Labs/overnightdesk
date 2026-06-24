# Research: Follow-Up Sent Logging

## Decision: Manual sent logging is not outbound sending

**Rationale**: The feature closes the sales history loop while preserving the current safety boundary. Trevor records a human-confirmed action that already happened; it does not initiate email, Telegram, SMS, LinkedIn, Instagram, or any external delivery.

**Alternatives considered**:

- Add direct send for approved drafts: rejected because direct sends require approval, audit, opt-out, and channel-policy work.
- Keep manual sends outside Trevor: rejected because the prospect timeline remains incomplete and the cadence digest cannot distinguish done vs pending follow-up work.

## Decision: Use existing draft and interaction tables

**Rationale**: Feature 1 reserved sent-related draft state, Feature 5 stores drafts, and Feature 4 records interactions. A confirmed manual send is naturally a new outbound interaction plus a final draft status transition. No new table is required for the first slice.

**Alternatives considered**:

- Add a separate sent-log table: rejected until multiple send providers or richer delivery telemetry exists.
- Store sent confirmations only on the draft row: rejected because sales history belongs in `trevor.interactions`.

## Decision: Approved drafts are the default confirmation source

**Rationale**: Requiring approval before sent logging keeps the safety model explicit and prevents draft text from becoming a sent record before Mitchel has reviewed it.

**Alternatives considered**:

- Allow any draft to be marked sent: rejected because it bypasses the approval boundary.
- Require all manual sends to originate outside drafts: rejected because it loses the existing draft workflow.

## Decision: Do-not-contact requires explicit audit-only override

**Rationale**: A do-not-contact prospect should never appear as safe to send. If Mitchel needs to record historical outreach that already happened, the workflow must require an explicit reason and label it as audit-only.

**Alternatives considered**:

- Absolute block for all do-not-contact confirmations: safer, but prevents truthful historical recordkeeping.
- Silent allow when the operator confirms: rejected because it weakens the DNC boundary.
