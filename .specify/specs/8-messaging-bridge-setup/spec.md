# Feature 8: Messaging Bridge Setup

## Overview

Messaging Bridge Setup provides wizard-driven configuration for Telegram and Discord bots, allowing customers to interact with their AI assistant through messaging platforms. The engine already handles the bot connections — this feature is purely the setup UI that collects credentials and sends them to the engine via REST API.

**Business Value:** Messaging bridges are a key differentiator. Customers who configure Telegram or Discord interact with their assistant throughout the day, increasing engagement and reducing churn. Self-service setup eliminates owner involvement.

---

## User Stories

### User Story 1: Configure Telegram Bot
**As a** subscriber with a running instance
**I want** to set up a Telegram bot that connects to my AI assistant
**So that** I can interact with my assistant through Telegram

**Acceptance Criteria:**
- [ ] Setup wizard guides user through BotFather bot creation with step-by-step instructions
- [ ] User can enter their bot token
- [ ] User can enter their Telegram user ID (for allowed users)
- [ ] User can enable or disable the Telegram bridge
- [ ] Current connection status is displayed (connected, disconnected, error)
- [ ] Bot token is never displayed after initial setup (write-only)
- [ ] Changes are saved immediately with success/error feedback

**Priority:** High

---

### User Story 2: Configure Discord Bot
**As a** subscriber with a running instance
**I want** to set up a Discord bot that connects to my AI assistant
**So that** I can interact with my assistant through Discord

**Acceptance Criteria:**
- [ ] Setup wizard guides user through Discord Developer Portal bot creation
- [ ] User can enter their Discord bot token
- [ ] User can enter their Discord user ID (for allowed users)
- [ ] User can enable or disable the Discord bridge
- [ ] Current connection status is displayed (connected, disconnected, error)
- [ ] Bot token is never displayed after initial setup (write-only)
- [ ] Changes are saved immediately with success/error feedback

**Priority:** High

---

### User Story 3: View Bridge Status
**As a** subscriber
**I want** to see the status of my configured messaging bridges at a glance
**So that** I can verify they are working correctly

**Acceptance Criteria:**
- [ ] Dashboard shows bridge status for Telegram and Discord
- [ ] Status includes: enabled/disabled, connection status, last activity
- [ ] Unconfigured bridges show a "Set up" prompt
- [ ] Error states display a helpful message about what went wrong

**Priority:** Medium

---

### User Story 4: Remove Bridge Configuration
**As a** subscriber
**I want** to remove a configured messaging bridge
**So that** I can disconnect the bot and stop receiving messages

**Acceptance Criteria:**
- [ ] User can delete Telegram bot configuration
- [ ] User can delete Discord bot configuration
- [ ] Deletion requires confirmation
- [ ] After deletion, the bridge shows as unconfigured

**Priority:** Low

---

## Functional Requirements

### FR-1: Telegram Setup Wizard
Step-by-step wizard explaining how to create a Telegram bot via BotFather, with inline instructions. Collects: bot token, allowed user IDs, enabled toggle. Validates token format before saving. Saves configuration via engine PUT /api/telegram endpoint.

### FR-2: Discord Setup Wizard
Step-by-step wizard explaining how to create a Discord bot via Developer Portal, with inline instructions. Collects: bot token, allowed user IDs (as Discord snowflake strings), enabled toggle. Notes the required MESSAGE_CONTENT intent. Saves via engine PUT /api/discord endpoint.

### FR-3: Bridge Status Display
The bridges page loads current configuration from GET /api/telegram and GET /api/discord. Shows connection status, enabled state, and allowed user count for each. Bot tokens are never returned by the engine GET endpoints (security).

### FR-4: Bridge Deletion
DELETE /api/telegram and DELETE /api/discord remove the bridge configuration. Requires confirmation dialog. After deletion, the page shows the bridge as unconfigured with a "Set up" option.

### FR-5: Navigation
Bridges page is accessible from the dashboard tab navigation (add "Bridges" tab alongside existing tabs). Only shown when instance is running.

---

## Non-Functional Requirements

### Security
- Bot tokens are write-only (never displayed after setup)
- All bridge API calls go through server-side proxy routes (tokens stay server-side)
- Allowed user IDs prevent unauthorized Telegram/Discord users from interacting with the assistant

### Usability
- Wizard provides copy-pasteable commands (e.g., "/newbot" for BotFather)
- Step indicators show progress through the wizard
- Instructions include links to BotFather and Discord Developer Portal
- Mobile-responsive layout

---

## Edge Cases & Error Handling

### Invalid Token Format
- Telegram tokens follow format: `123456:ABC-DEF...` — validate before saving
- Discord tokens are opaque strings — validate minimum length only

### Engine Unreachable
- Show "Unable to reach your instance" message if engine API times out
- Bridge status shows "Unknown" when engine cannot be reached

### Bridge Already Configured
- If bridge is already configured, show current status instead of wizard
- Provide "Reconfigure" option to update token/users

### Empty Allowed Users
- Warn that an empty allowed users list means the bot won't respond to anyone

---

## Success Metrics

- **Setup completion:** 40%+ of subscribers configure at least one bridge within first month
- **Self-service:** 0% of bridge setups require owner intervention
