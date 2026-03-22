# Task Breakdown — Feature 8: Messaging Bridge Setup

## Summary
- **Total Tasks:** 8
- **Phases:** 3
- **Total Effort:** 6 hours

---

## Phase 1: Engine Client + API Routes

### Task 1.1: Bridge Engine Client Functions — Tests
**Status:** 🟡 Ready
**Effort:** 0.5 hours

Write tests for 6 new engine-client functions (getTelegramConfig, updateTelegramConfig, deleteTelegramConfig, getDiscordConfig, updateDiscordConfig, deleteDiscordConfig).

### Task 1.2: Bridge Engine Client Functions — Implementation
**Status:** 🔴 Blocked by 1.1
**Effort:** 0.5 hours

Implement functions following existing pattern.

### Task 1.3: Bridge API Proxy Routes — Tests
**Status:** 🟡 Ready
**Effort:** 0.5 hours

Tests for GET/PUT/DELETE /api/engine/telegram and /api/engine/discord.

### Task 1.4: Bridge API Proxy Routes — Implementation
**Status:** 🔴 Blocked by 1.2, 1.3
**Effort:** 0.5 hours

Create route files with resolveInstance + proxy pattern.

---

## Phase 2: Bridge UI

### Task 2.1: Bridge Pages — Tests
**Status:** 🔴 Blocked by 1.4
**Effort:** 0.5 hours

Tests for wizard forms and status cards.

### Task 2.2: Bridge Pages — Implementation
**Status:** 🔴 Blocked by 2.1
**Effort:** 2.5 hours

- Bridge overview page with status cards
- Telegram wizard with BotFather instructions
- Discord wizard with Developer Portal instructions
- Add "Bridges" tab to dashboard nav

---

## Phase 3: Quality Gates

### Task 3.1: Build & Test Verification
**Status:** 🔴 Blocked by 2.2
**Effort:** 0.5 hours

### Task 3.2: Code Review
**Status:** 🔴 Blocked by 3.1
**Effort:** 0.5 hours
