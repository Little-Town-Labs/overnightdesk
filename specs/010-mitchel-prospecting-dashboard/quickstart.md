# Quickstart: Mitchel Prospecting Dashboard

## Goal

Validate that Feature 10 gives a `hermes-mitchel` user a safe prospecting
workspace in OvernightDesk without exposing Mitchel data to other tenants and
without causing outbound side effects.

## Local Validation

1. Install dependencies if needed:

   ```bash
   npm install
   ```

2. Run focused platform checks after implementation:

   ```bash
   npm run build
   npm test
   ```

3. Run Trevor MCP checks if the tenant-local contract changes:

   ```bash
   cd tenants/hermes-mitchel/mcp-servers/trevor-db
   npm test
   npm run build
   ```

4. Confirm the active feature pointer:

   ```bash
   cat .specify/feature.json
   ```

## Manual Acceptance Checks

1. Sign in as a user mapped to the `hermes-mitchel` tenant.
2. Open the OvernightDesk dashboard.
3. Confirm the Mitchel prospecting workspace appears.
4. Confirm these sections render with data, empty states, or unavailable states:
   - Trevor-only prospects
   - staged candidates
   - today's call tasks
   - review-needed items
   - follow-up drafts
5. Confirm existing Hermes chat remains available.
6. Confirm the Hermes dashboard launch link remains available.
7. Sign in as or simulate a non-`hermes-mitchel` tenant and confirm the Mitchel
   workspace is not visible.
8. Confirm page viewing does not create call tasks, promote candidates, approve
   drafts, or send outbound messages.

## Aegis Reality Checks

Run read-only production checks before deciding whether to use Hermes API server
or Kanban surfaces:

```bash
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 "docker ps --format '{{.Names}}\t{{.Status}}'"
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55 "docker exec hermes-mitchel sh -lc 'python - <<PY
import urllib.request
for url in [\"http://127.0.0.1:8642/health\", \"http://127.0.0.1:9119/api/plugins/kanban/boards\"]:
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            print(url, r.status)
    except Exception as e:
        print(url, type(e).__name__, str(e)[:160])
PY'"
```

Expected planning baseline from 2026-06-25:

- `hermes-mitchel` container is running.
- `http://127.0.0.1:8642/health` is not listening inside the container.
- `http://127.0.0.1:9119/api/plugins/kanban/boards` requires authorization.

## Safety Checks

- No platform route receives or stores `TREVOR_DB_URL`.
- No unauthenticated `/api/plugins/kanban/*` route is exposed through
  OvernightDesk.
- No custom Hermes Agent patch is required for the first slice; use documented
  Hermes configuration/API/plugin behavior where Hermes is involved.
- All dashboard route access starts with authenticated session and explicit
  `hermes-mitchel` authorization.
- Scraped content and notes are displayed as text, not HTML.
- Any future write action has explicit confirmation, audit output, and
  `outboundSent=false` verification.
