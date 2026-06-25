# Cadence Digest

Use this workflow when Mitchel asks for the morning digest, daily cadence,
stale buyer review, or follow-up approval queue.

## Boundaries

- Use `generate_cadence_digest`; do not hand-write SQL for this repeated
  workflow unless the purpose-built tool is unavailable.
- Digest runs are read-only by default.
- Never send email, SMS, Telegram, LinkedIn, Instagram, or any outbound message.
- Never create follow-up drafts or approve/discard drafts from this workflow.
- Do not include full prospect notes or full follow-up draft bodies in the
  digest response.
- Treat do-not-contact records as review-only. Do not recommend outreach.

## Standard Flow

Call `generate_cadence_digest` with:

- `limit`: usually 10.
- `persist_call_tasks`: false unless Mitchel explicitly wants call tasks written.
- `scheduled`: false for normal user-requested runs.
- `include_review_needed`: true unless Mitchel asks for only call-ready work.
- `include_dormant`: true unless the digest should exclude dormant review work.

## Response Shape

Present:

- Call queue recommendations.
- Review-needed items separately from call-ready work.
- Stale work with reason and suggested next step.
- Follow-up approvals awaiting review.
- Counts and warnings.
- Side-effect summary.

## Scheduler Posture

Scheduling is disabled by default. Before any weekday automation is enabled,
the operator must follow:

```text
tenants/hermes-mitchel/runbooks/cadence-scheduler.md
```

The validation run must confirm useful output, clean logs, and unchanged
default side-effect counts.
