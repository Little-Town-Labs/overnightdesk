---
name: post-call-capture
description: Capture Mitchel's post-call outcomes into Trevor prospecting records without sending follow-up.
---

# Post-Call Capture

Use this skill after Mitchel completes a prospecting phone call and wants Trevor
to record what happened.

## Rules

- Prefer `capture_post_call` over hand-written SQL for this repeated workflow.
- Capture only what Mitchel reports. Do not infer an outcome from old notes.
- Ask only for missing required fields before capture.
- Never send email, Telegram, SMS, social messages, or other outbound follow-up.
- Do not create follow-up drafts in this workflow. Follow-up drafting is a
  separate approval-controlled workflow.
- If Agiled context is linked, report whether CRM note handling is created,
  skipped, failed, or not requested. Local Trevor capture remains the durable
  source for this workflow even when Agiled is unavailable.

## Required Inputs

- `task_id` or `prospect_id`
- `outcome`
- `summary` for interested, quoted, sold, or do-not-contact outcomes

## Typical Flow

1. Call `capture_post_call` with the task or prospect, outcome, summary, and
   next action if one exists.
2. If the response is `needs_input`, ask Mitchel only for the listed fields.
3. If the response is `captured`, summarize the local record, task status,
   prospect updates, and Agiled note status.
4. If a follow-up is needed, ask whether Mitchel wants to start the separate
   follow-up drafting workflow.
