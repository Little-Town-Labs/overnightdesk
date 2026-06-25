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
- Use `list_follow_ups_awaiting_send` to find approved drafts that still need a
  human send confirmation. The queue returns bounded summaries and does not
  expose full draft bodies.
- Use `log_manual_follow_up_sent` only after Mitchel confirms a draft was sent
  manually outside Trevor. This records one local interaction and marks the
  draft `manual_sent`; it never sends an outbound message.
- Do-not-contact prospects must not receive persuasive copy. Treat any generated
  output as an internal review note unless Mitchel confirms the contact status
  has changed. A do-not-contact sent log requires `audit_only_reason`.

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

## Review Awaiting Send

Call `list_follow_ups_awaiting_send` with:

- `limit`: optional, 1-25.
- `include_do_not_contact`: optional; defaults to including review-only DNC
  records so the operator can resolve them deliberately.

Expected response fields include:

- `items`: approved unsent drafts with `draft_id`, `prospect_id`,
  `display_name`, `channel`, `subject`, `approved_at`, `age_days`,
  `review_only`, and bounded `summary`.
- `counts.awaiting_send` and `counts.review_only`.
- No draft body text.

## Log Manual Send

Call `log_manual_follow_up_sent` with:

- `draft_id`: approved draft ID.
- `sent_at`: timestamp the human sent the follow-up.
- `confirmed_by`: operator name or identifier.
- `sent_via`: optional channel/provider label; defaults to the draft channel.
- `external_message_id`: optional bounded external reference.
- `audit_only_reason`: required for do-not-contact prospects.

Allowed outcomes:

- `logged`: one outbound interaction was created and the draft is `manual_sent`.
- `blocked`: draft state or DNC rules prevented the write.
- `needs_input`: required input was missing or invalid.
- `not_found`: draft ID was not found.

Every response must keep `outbound_sent=false`.

## Operational Checks

Before deployment, verify:

- `trevor-db` tests pass.
- MCP server version includes the follow-up tools.
- Production comparison shows current `aegis-prod` does not already expose the
  new follow-up tools before the Feature 7 deploy.
