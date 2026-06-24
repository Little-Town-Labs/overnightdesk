---
name: pre-call-brief
description: Prepare a concise, read-only Trevor pre-call brief for Mitchel without creating interactions or outreach.
---

# Pre-Call Brief

Use this skill when Mitchel asks for call prep, a prospect brief, or context for a queue task before making a human phone call.

## Operating Rules

- Prefer `generate_pre_call_brief` over hand-written SQL for this repeated workflow.
- Use `task_id` when the request comes from the daily call queue.
- Use `prospect_id` when Mitchel names a known Trevor prospect ID.
- Use `query` only for name or company lookup, and respect disambiguation results.
- Never create `trevor.interactions`; post-call capture owns completed-call records.
- Never send, draft, or place outbound outreach from this skill.
- If a prospect is do-not-contact, lead with that warning and do not present the brief as call-ready.
- If Agiled or inventory context is missing, say so plainly.

## Response Shape

Keep the answer compact:

- Prospect identity and company.
- Task ID and objective when present.
- Last touch, if known.
- Recommended ask.
- Suggested opener.
- Follow-up fallback if there is no answer.
- Missing context and warnings.

Do not include full private notes unless Mitchel explicitly asks for a specific detail.
