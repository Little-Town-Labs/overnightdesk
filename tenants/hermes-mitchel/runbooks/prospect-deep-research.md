# Prospect Deep Research

This runbook covers the review-first deep research workflow for Trevor
prospects. It stores public evidence linked to `trevor.prospects` and does not
send outbound messages or directly update `trevor.prospects.email`.

## Source Rules

- Use official websites/contact pages as the strongest email evidence.
- Use city, town, chamber, and business directories as strong public context
  when they identify the same business.
- Use news stories for business context such as expansion, closure, ownership,
  awards, relocation, or diamond-buying relevance.
- Use RDAP/WHOIS only to verify domain plausibility, registration status, or
  domain age. Do not use registrar abuse, privacy proxy, or personal registrant
  contacts as outreach emails.

## MVP Tools

- `store_prospect_research_evidence`: stores one bounded evidence row for one
  prospect.
- `list_prospect_research_evidence`: lists bounded evidence rows by prospect or
  review status.

Both tools return `outbound_sent=false`.

## Operating Flow

1. Prioritize prospects missing email, especially where a website/contact clue
   already exists.
2. Store public evidence with source URL, source type, confidence, and a concise
   search-location note.
3. Leave evidence in `pending_review` until Mitchel or the operator approves or
   rejects it.
4. Promote approved high-confidence email evidence only through a controlled
   email enrichment apply path.
5. Promote business context as concise prospect notes only after review.

## Safety Checks

- Never store raw page dumps or private contact data.
- Never fabricate emails from patterns.
- Never treat RDAP/WHOIS as sufficient email evidence.
- Keep notes bounded and source-attributed.
- Preserve all production deploys in
  `/home/frosted639/src/overnightdesk-suite/deploys.log`.
