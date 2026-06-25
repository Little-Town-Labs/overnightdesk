---
name: daily-call-queue
description: Generate and explain Mitchel's daily Trevor call queue without autonomous outreach.
---

# Daily Call Queue

Use this skill when Mitchel asks who to call today, asks for a prospecting queue, or wants to review pending Trevor call tasks.

## Operating Rules

- Use `generate_daily_call_queue` for the queue. Do not hand-write SQL for this repeated workflow unless the purpose-built tool is unavailable.
- Never recommend a prospect marked do-not-contact as callable.
- Never send email, SMS, Telegram, social messages, or any other outbound follow-up from this skill.
- Treat `trevor.prospects` and `trevor.call_tasks` as the durable working records.
- Agiled and inventory context are optional. If they are missing, say that plainly.
- Keep responses concise enough for a sales call block: ranked list, reason, objective, opener, missing context.

## Standard Flow

1. Call `generate_daily_call_queue` with `persist: true` and a practical `limit` such as 10.
2. Present only `recommendations` as call-ready work.
3. Present `review_needed` separately as data cleanup or research work, not as call-ready work.
4. Mention counts for suppressed and review-needed records without naming do-not-contact prospects.
5. When Mitchel finishes a call task, use `mark_call_task_status` only to mark the task state. Do not create an interaction; post-call capture is a separate workflow.

## Response Shape

For each call-ready recommendation, include:

- Rank and prospect display name.
- Reason for calling.
- Call objective.
- Suggested opener.
- Missing context, if any.
- Task ID when returned.

## Safety Checks

Before answering:

- Confirm no recommendation has `readiness` other than `call_ready`.
- If inventory context was not supplied, do not claim inventory-driven matching.
- If Agiled context is missing, say "Agiled context missing" rather than inferring CRM state.
- Do not include full private notes unless Mitchel explicitly asks for a specific prospect detail.
