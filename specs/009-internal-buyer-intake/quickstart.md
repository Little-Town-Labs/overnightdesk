# Quickstart: Internal Buyer Intake

## Local Validation

From the Trevor DB MCP server:

```bash
cd tenants/hermes-mitchel/mcp-servers/trevor-db
npm test
npm run build
npm audit --json
```

From the repo root:

```bash
.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
git diff --check
```

## Scenario 1: Capture a New Buyer Conversation

1. Ask Trevor to capture a new buyer from a phone call.
2. Provide name or company, at least one contact path, source, conversation
   summary, and optional preferences.
3. Do not ask for a follow-up draft or call task.

Expected result:

- One Trevor prospect is created or safely linked.
- One interaction is created.
- Source attribution is preserved.
- `outbound_sent=false`.
- No call task or follow-up draft is created unless requested.

## Scenario 2: Dedupe an Existing Buyer

1. Use an intake with a phone or email that matches an existing Trevor prospect.
2. Include new conversation notes and a source.

Expected result:

- Trevor updates the existing prospect instead of creating a duplicate.
- A new interaction is written to the existing prospect.
- The response reports `dedupe_status=matched_existing`.

## Scenario 3: Ambiguous Match Requires Review

1. Use an intake whose name/company can match multiple existing prospects.
2. Omit unique phone/email.

Expected result:

- The response is `needs_review`.
- Up to 5 possible matches are returned.
- No ambiguous prospect update or interaction is written.

## Scenario 4: Next Action Without Sending

1. Use a valid unique intake with `create_call_task=true`.
2. Use another intake with `create_follow_up_draft=true`.

Expected result:

- Internal next-action work is created or reused.
- No outbound message is sent.
- Do-not-contact prospects block persuasive draft/call task creation.

## Scenario 5: Agiled Degraded Path

1. Use an intake with `agiled_sync=create_or_update` while Agiled is unavailable
   or intentionally mocked as failed.

Expected result:

- The local Trevor prospect and interaction still persist when valid.
- The response reports Agiled status as `failed` or `skipped`.
- Warnings contain no credentials or raw provider errors.

## Production Read-Only Preflight

Use `aegis-ssh` before deployment:

```bash
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'hermes-mitchel|tenet0-postgres'"
```

Verify live assumptions:

- `hermes-mitchel` is healthy.
- `tenet0-postgres` is healthy.
- `trevor-db` can connect to the Trevor schema.
- Current counts for prospects, interactions, call tasks, and follow-up drafts
  are recorded before any write smoke.
- No secrets or full prospect notes are printed in logs.
