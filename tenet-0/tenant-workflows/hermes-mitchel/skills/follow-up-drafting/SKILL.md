# Follow-Up Drafting

Use this workflow when Mitchel asks Trevor to draft a follow-up from a captured
call outcome.

## Boundaries

- Draft only. This workflow never sends email, Telegram, SMS, LinkedIn, or
  Instagram messages.
- Drafts are stored in `trevor.followup_drafts` for human review.
- Use `generate_follow_up_draft` only after a call has been captured in
  `trevor.interactions`.
- Use `mark_follow_up_draft` to approve or discard a draft. Approval means the
  text is reviewed; it does not send the message.
- Do-not-contact prospects must not receive persuasive copy. Treat any generated
  output as an internal review note unless Mitchel confirms the contact status
  has changed.

## Generate A Draft

Call `generate_follow_up_draft` with:

- `interaction_id`: the captured interaction ID.
- `channel`: one of `email`, `telegram`, `sms`, `linkedin`, or `instagram`.
- `tone`: optional bounded tone note.
- `regenerate`: optional; use only when Mitchel explicitly wants a new active
  draft instead of reusing an existing one.

Expected response fields include:

- `status`: `drafted`, `existing`, `not_found`, or `invalid`.
- `draft_id`, `prospect_id`, `interaction_id`, `channel`, `draft_status`.
- `subject`: present for email, `null` for copy-ready channels.
- `body`: reviewable draft text.
- `warnings`: safety or missing-context warnings.
- `outbound_sent`: always `false`.

## Approve Or Discard

Call `mark_follow_up_draft` with:

- `draft_id`: the stored draft ID.
- `action`: `approve` or `discard`.
- `approved_by`: required when approving.

Approval and discard update draft state only. A later workflow must explicitly
log any manually sent follow-up back to `trevor.interactions`.

## Operational Checks

Before deployment, verify:

- `trevor-db` tests pass.
- MCP server version includes the follow-up tools.
- Production comparison shows current `aegis-prod` does not already expose the
  new follow-up tools before the Feature 5 deploy.
