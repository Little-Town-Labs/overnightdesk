---
name: newsletter-sources
description: Manage the newsletter whitelist in oc_newsletter_sources (deploy-postgres-1). Use when Gary asks to add, remove, enable, disable, or list newsletter senders for the daily curator digest. The curator only processes Gmail emails whose sender matches an active row in this table.
---

# Newsletter Sources — Whitelist Management

You manage the whitelist of newsletter senders that the daily `newsletter-curator` job (fires 05:00 America/Chicago) uses to decide which Gmail rows to summarize. The curator filters `ingested_messages` with a `LIKE` join against this table — senders not present are silently dropped.

## Tool: `cli.mjs`

A Node CLI that talks to `deploy-postgres-1` via `$DATABASE_URL`. Five subcommands:

| Subcommand | Use |
|---|---|
| `list`                    | Show active senders (JSON array) |
| `list --all`              | Show all senders incl. disabled |
| `add <sender> <label>`    | Upsert row with `active=true`. Label is free-text for human display. |
| `enable <pattern>`        | Set `active=true` on any row whose sender matches `ILIKE '%pattern%'` |
| `disable <pattern>`       | Set `active=false` on any row whose sender matches `ILIKE '%pattern%'` |
| `remove <pattern>`        | DELETE rows matching the pattern |

Always invoke via bash from the skill directory:

```bash
node /data/workspace/.claude/skills/newsletter-sources/tools/cli.mjs <subcommand> [args...]
```

Output is JSON on stdout, errors on stderr with non-zero exit code.

## How to respond to Gary

### "Add foo@example.com as Foo Newsletter"
```bash
node /data/workspace/.claude/skills/newsletter-sources/tools/cli.mjs add "foo@example.com" "Foo Newsletter"
```
Confirm with: "Added `foo@example.com` (Foo Newsletter), active."

### "Add substack newsletter Example, it's at example@substack.com"
Use the specific address if given:
```bash
node /data/workspace/.claude/skills/newsletter-sources/tools/cli.mjs add "example@substack.com" "Example"
```

### "Stop the LinkedIn newsletters"
Disable by partial match (safer than deleting — keeps history):
```bash
node /data/workspace/.claude/skills/newsletter-sources/tools/cli.mjs disable "linkedin"
```
Show the returned rows to confirm what was affected.

### "Turn morning brew back on"
```bash
node /data/workspace/.claude/skills/newsletter-sources/tools/cli.mjs enable "morningbrew"
```

### "Remove the half baked one entirely"
Only when Gary explicitly says "remove" / "delete" (not "stop" / "pause"):
```bash
node /data/workspace/.claude/skills/newsletter-sources/tools/cli.mjs remove "gethalfbaked"
```

### "What newsletters are we tracking?"
```bash
node /data/workspace/.claude/skills/newsletter-sources/tools/cli.mjs list
```
Summarize in a short readable list — don't dump raw JSON unless Gary asks for details.

## Rules

- **Never** fabricate senders. If Gary says "add the NY Times newsletter" without giving an address, ask which address to whitelist — don't guess.
- **Prefer `disable` over `remove`** unless Gary explicitly says to delete. Disabling preserves history; removing is permanent.
- **Exact matches for `add`**; partial-string matches for `enable` / `disable` / `remove`. When a partial match affects multiple rows, show them all in the confirmation.
- **No raw SQL**. Always go through the CLI so changes are visible in a stable interface.
- **This table lives on deploy-postgres-1** (aegis). It is NOT synced to powerbox; that DB is being retired.

## Related docs

- Full pipeline runbook: `/data/workspace/runbooks/newsletter-pipeline.md`
- Curator repo: `overnightdesk-newsletter-curator` on Gary's dev machine
