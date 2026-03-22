# Implementation Plan — Feature 8: Messaging Bridge Setup

## Executive Summary

Add Telegram and Discord bridge configuration wizards to the dashboard. This is purely frontend + proxy routes — the engine already handles bot connections. Feature 8 reuses all infrastructure from Feature 7 (resolve-instance, engine-client, dashboard layout).

**Estimated Effort:** 6 hours
**Risk Level:** Very Low — UI wizard over existing engine API

---

## Architecture

Extends Feature 7's dashboard with a new "Bridges" tab:

```
/dashboard/bridges               → Bridge overview (status cards)
/dashboard/bridges/telegram      → Telegram setup wizard
/dashboard/bridges/discord       → Discord setup wizard
```

### New Engine Client Functions
- `getTelegramConfig(subdomain, apiKey)` → GET /api/telegram
- `updateTelegramConfig(subdomain, apiKey, config)` → PUT /api/telegram
- `deleteTelegramConfig(subdomain, apiKey)` → DELETE /api/telegram
- `getDiscordConfig(subdomain, apiKey)` → GET /api/discord
- `updateDiscordConfig(subdomain, apiKey, config)` → PUT /api/discord
- `deleteDiscordConfig(subdomain, apiKey)` → DELETE /api/discord

### New API Proxy Routes
- GET/PUT/DELETE /api/engine/telegram
- GET/PUT/DELETE /api/engine/discord

### New Components
```
dashboard/bridges/
├── page.tsx                  ← Server: loads both bridge configs
├── bridge-status-card.tsx    ← Client: status display per bridge
├── telegram/
│   ├── page.tsx              ← Server: loads telegram config
│   └── telegram-wizard.tsx   ← Client: setup wizard form
└── discord/
    ├── page.tsx              ← Server: loads discord config
    └── discord-wizard.tsx    ← Client: setup wizard form
```

---

## Implementation Phases

### Phase 1: Engine Client + API Routes (2 hours)
- Add 6 engine-client functions (follow existing pattern)
- Create 2 proxy route files (telegram, discord) with GET/PUT/DELETE
- Tests for all

### Phase 2: Bridge UI (3 hours)
- Bridge overview page with status cards
- Telegram wizard with BotFather instructions
- Discord wizard with Developer Portal instructions
- Add "Bridges" tab to dashboard nav
- Tests for wizard components

### Phase 3: Quality Gates (1 hour)
- Run tests + build
- Fix any issues

---

## Data Model

No database changes. Bridge configuration lives in engine's per-tenant SQLite.

## Constitutional Compliance

- [x] Data Sacred: Bot tokens proxied, never cached in platform DB
- [x] Security: Tokens write-only (never returned in GET)
- [x] Simple Over Clever: Server components + API routes
- [x] Test-First: TDD for all implementation
