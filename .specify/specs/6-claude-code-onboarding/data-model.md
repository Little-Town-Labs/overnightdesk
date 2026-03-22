# Data Model — Feature 6: Claude Code Onboarding

## Existing Schema (Minor Update Needed)

### instance (existing — from Feature 1)

The `claudeAuthStatus` column already exists with enum values: `not_configured`, `connected`, `expired`.

Feature 6 will:
- Read `claudeAuthStatus` to display current status
- Update `claudeAuthStatus` when auth status proxy detects a change
- Read `subdomain` to construct WebSocket URL for terminal

### New Column Needed

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| engineApiKey | text | Nullable | Platform-internal key for API calls to tenant engine |

**Why:** The platform needs to call the engine's API (auth-status, terminal-ticket) on behalf of the user. The `dashboardTokenHash` is a bcrypt hash — it can't be reversed to get the plaintext. A separate `engineApiKey` is generated during provisioning and stored for platform-internal use.

**Migration:** `ALTER TABLE instance ADD COLUMN engine_api_key text;`

**Security:** This key is:
- Generated during provisioning alongside the bearer token
- Used only by the Vercel backend (never sent to client)
- Different from the user's bearer token (defense in depth)
- Stored as plaintext in the platform DB (acceptable — Vercel backend only, same trust boundary as Stripe keys)
