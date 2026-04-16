# Newsletter Pipeline — Runbook

**Last updated:** 2026-04-15

The newsletter pipeline extracts newsletter emails from Gary's Gmail, cleans them through the SecurityTeam, summarizes and scores them via an LLM, and publishes a morning digest to Discord `#newsletter-ideas`.

## Sequence (all times America/Chicago)

| Time | Component | Action |
|---|---|---|
| **04:00** | n8n workflow `Daily Email Digest` (`wc3XGJUvHznVLc30`) | Fetches last 24h of Gmail. Branches in parallel: <br>  • HTTP POST to `tenant-0:8080/hooks/automate` → Agent Zero → `#gmail-summary` (existing behavior)<br>  • Postgres INSERT into `content_staging` (new — feeds the curator) |
| **04:00 – 04:55** | SecurityTeam staging-poller (systemd timer every 5 min) | Picks up `content_staging WHERE security_status='pending'`, runs the full inbound pipeline (unicode normalize, HTML sanitize, secret redact, frontier scan), writes cleaned rows to `ingested_messages` with `approval_status='auto_approved'` |
| **05:00** | `newsletter-curator` (systemd timer, oneshot) | Reads `ingested_messages` joined against `oc_newsletter_sources WHERE active=true`, scores each via OpenRouter, writes to `oc_newsletter_insights`, sends Discord digest to `#newsletter-ideas`, marks source rows `processed` |
| ~**05:05** | Discord | Digest lands in `#newsletter-ideas` |

## Components

### Timers (systemd --user on aegis-prod, owner: ubuntu)

```
~/.config/systemd/user/newsletter-curator.timer        OnCalendar=*-*-* 05:00:00 America/Chicago
~/.config/systemd/user/newsletter-curator.service     Type=oneshot, ExecStart=phase run -- docker run newsletter-curator:latest
~/.config/systemd/user/securityteam-staging-poll.timer OnUnitActiveSec=5min
~/.config/systemd/user/securityteam-staging-poll.service Type=oneshot, ExecStart=docker exec overnightdesk-securityteam node /app/poll-staging-cli.mjs
```

Ubuntu user lingering is `no`, so these only run while a session is active *or* after reboot (systemd-user without lingering re-arms on login). If that causes problems, enable with `sudo loginctl enable-linger ubuntu`.

### n8n workflow

- **URL:** https://automate.overnightdesk.com/workflow/wc3XGJUvHznVLc30
- **Trigger:** daily 04:00 `America/Chicago` (workflow `settings.timezone` is set in DB)
- **Nodes:**
  1. Schedule (`Daily 4AM CT`)
  2. Gmail: `getAll`, `q=newer_than:1d`
  3. Code: formats a single-prompt string per 24h batch
  4. HTTP Request: POST to `overnightdesk-tenant-0:8080/hooks/automate` (Zero's existing digest)
  5. Postgres: INSERT into `content_staging` (parallel to #3/#4 — branches from Gmail)
- **Postgres credential:** `deploy-postgres-1 (overnightdesk)` / id `nSfb0VPNDNqgH6qU` (stored in n8n encrypted store, separate from Phase)

### SecurityTeam staging-poller wrapper

The `pollStagingOnce` function in `src/pipeline/staging-poller.ts` is exported but has no `main`. We run it via a tiny CLI wrapper inside the container:

```js
// /app/poll-staging-cli.mjs (inside overnightdesk-securityteam)
import { Pool } from "pg";
import { pollStagingOnce, PostgresApprovalQueueAdapter } from "./dist/pipeline/index.js";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PostgresApprovalQueueAdapter(pool);
try {
  const r = await pollStagingOnce({ pool, adapter });
  console.log(`poll-staging: processed=${r.processed} safe=${r.safe} pendingApproval=${r.pendingApproval} errors=${r.errors} durationMs=${r.durationMs}`);
} finally {
  await pool.end();
}
```

> **Tech debt:** this wrapper is currently a loose file inside the running container. It disappears on rebuild. Promote it to `src/cli/poll-staging.ts` in the securityteam repo so it's in the image.

### Newsletter source whitelist

Curator filters `ingested_messages` against `oc_newsletter_sources WHERE active=true`. Emails from senders not in the whitelist are silently ignored (they still flow through SecurityTeam and land in `ingested_messages` — the curator just doesn't process them).

**Seed data was copied from `powerbox` openclaw DB via dbhub MCP on 2026-04-15** (7 initial rows). Going forward, aegis is the source of truth; powerbox will be retired.

## Adding / removing newsletters

Three ways, in increasing convenience:

1. **SQL directly:**
   ```sql
   INSERT INTO oc_newsletter_sources (sender, label, active)
   VALUES ('foo@example.com', 'Foo Newsletter', true)
   ON CONFLICT (sender) DO UPDATE SET label=EXCLUDED.label, active=true;
   ```
2. **Ask Agent Zero** via Telegram / Discord DM (if the `newsletter-sources` skill is deployed):
   - "Add foo@example.com as Foo Newsletter"
   - "Disable LinkedIn Newsletters"
   - "List active newsletters"
3. **Via dbhub MCP** (read-only on `openclaw` source; aegis not yet exposed via dbhub)

`sender` is matched with `LIKE '%sender%'` so you can use partial strings like `substack.com` to match a whole publisher, or specific addresses for precision.

## Failure diagnosis

### "Nothing landed in #newsletter-ideas this morning"

Check in this order:

1. **Did the n8n workflow fire?**
   ```sql
   SELECT id, status, "startedAt", "stoppedAt"
   FROM execution_entity
   WHERE "workflowId" = 'wc3XGJUvHznVLc30'
   ORDER BY "startedAt" DESC LIMIT 5;
   ```
   Run on `n8n-postgres` (`docker exec n8n-postgres psql -U n8n -d n8n -c '...'`). If no execution at ~04:00 CT: n8n-side issue.

2. **Did rows land in content_staging?**
   ```sql
   SELECT source, security_status, count(*), max(fetched_at)
   FROM content_staging
   WHERE source='gmail' AND fetched_at > now() - interval '12 hours'
   GROUP BY 1, 2;
   ```
   Run on `deploy-postgres-1`. If 0 rows: the Postgres branch of the n8n workflow failed. Check n8n execution detail for the failed branch.

3. **Did the staging-poller process them?**
   ```
   journalctl --user -u securityteam-staging-poll --since '12 hours ago'
   ```
   Look for `processed=N safe=N errors=N`. If `errors > 0`: check `content_staging.security_error` for the row.

4. **Did the curator run?**
   ```
   journalctl --user -u newsletter-curator --since '12 hours ago'
   ```
   Expected: `🚀 Injected 8 secrets ... Processed N items: X high, Y medium, Z low`. If `no new items to process`: either no Gmail rows matched `oc_newsletter_sources`, or all rows are already `processed`.

5. **Did the digest post?**
   - `curator: digest send failed: ...` in the journal means commmodule rejected the request. Most common cause: the Discord channel name in `COMM_MODULE_DISCORD_CHANNEL` (Phase `/newsletter-curator/`) doesn't have a matching `DISCORD_CHANNEL_<NAME>` webhook in `/commmodule/`.
   - Zero items with `content_worthiness='high'` is treated as a "quiet day" and Discord post is **skipped** intentionally — no error, no message.

### Quick smoke test (end-to-end)

```sql
-- Insert fake row
INSERT INTO content_staging (source, content_type, message_id, body, sender, subject, received_at, metadata)
VALUES ('gmail', 'text', 'manual-test-' || gen_random_uuid()::text,
  'Test body with enough words to score...', 'crew@morningbrew.com', '[Manual Test]',
  NOW(), '{}'::jsonb);
```

```bash
# Run poller immediately
docker exec overnightdesk-securityteam node /app/poll-staging-cli.mjs
# Run curator
systemctl --user start newsletter-curator.service
journalctl --user -u newsletter-curator --since '1 minute ago' --no-pager
```

Check `#newsletter-ideas` in Discord within ~30s.

## Key file / table map

| Concern | Location |
|---|---|
| n8n workflow | `automate.overnightdesk.com` → workflow `wc3XGJUvHznVLc30` |
| Curator binary | Docker image `newsletter-curator:latest` on aegis-prod |
| Staging-poller code | `overnightdesk-securityteam` repo `src/pipeline/staging-poller.ts` |
| Staging-poller wrapper | `/app/poll-staging-cli.mjs` inside container (ephemeral) |
| Dirty table | `content_staging` on `deploy-postgres-1` |
| Clean table | `ingested_messages` on `deploy-postgres-1` |
| Insights | `oc_newsletter_insights` on `deploy-postgres-1` (also replicated to Neon) |
| Whitelist | `oc_newsletter_sources` on `deploy-postgres-1` |
| Discord output | `#newsletter-ideas` (webhook `DISCORD_CHANNEL_NEWSLETTER_IDEAS` in commmodule Phase secrets) |

## Related docs

- Curator: `overnightdesk-newsletter-curator/README.md`
- SecurityTeam: `overnightdesk-securityteam/README.md` (staging-poller section)
- CommunicationModule: `overnightdesk-communicationmodule/README.md`
- Phase rotation: `.docs/runbooks/phase.md` (not yet written — still TODO)
