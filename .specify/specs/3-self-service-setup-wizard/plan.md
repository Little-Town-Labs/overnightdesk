# Implementation Plan: Self-Service Setup Wizard

**Spec version:** 1.1.0 | **Constitution:** v2.0.0 | **Feature:** 3 (P1)
**Created:** 2026-04-24

---

## Executive Summary

The setup wizard gates provisioning behind secret collection. After a Stripe payment creates an instance with `status = queued`, the customer completes a 3-step wizard. Secrets are written to Phase.dev per-step (not all-at-once) via a new provisioner endpoint. On wizard completion, `provisionerClient.provision()` fires and the status advances to `awaiting_provisioning`. The dashboard polls until `running`, then transitions to the hub.

This feature has three codebases in play: the Next.js platform (Vercel), the existing hermes-provisioner (aegis-prod), and the platform DB schema (Neon).

---

## Architecture Decisions

### AD-1: Secrets written per-step via provisioner `/write-secrets` endpoint

**Decision:** Each wizard step writes its secrets to Phase.dev immediately on step completion (not as a single atomic write at the final step). The write is performed by a new `POST /write-secrets` endpoint on the hermes-provisioner, which uses the Phase CLI.

- **Rationale:** Keeps Phase CLI operations on aegis-prod (where it is installed). Vercel cannot call Phase CLI directly. Immediate per-step writes enable wizard state persistence across sessions (EC-4) — if a user abandons after step 1, their OpenRouter key is already in Phase.dev. The spec's "atomic write" intent is satisfied for provisioning: provisioning fires only after all steps complete, so the container always sees a complete config.
- **Alternative rejected:** Platform writes to Phase REST API directly from Vercel. Requires Phase REST API research, a new Vercel env var, and exposes secrets to the Vercel edge environment. More attack surface for no benefit.
- **Tradeoff:** Partial secrets may exist in Phase.dev for abandoned wizards — acceptable since provisioning never fires until wizard is complete.

### AD-2: Wizard state tracked via `wizardState` JSONB column on `instance`

**Decision:** Add `wizardState jsonb` to the `instance` table. Stores which steps have been completed and which step the user is currently on — boolean indicators only, no secret values. Supports resumption across sessions (EC-4, US-6).

```json
{ "completedSteps": [1], "currentStep": 2 }
```

- **Rationale:** Masked placeholders on return (US-6 AC) require knowing which steps were completed. Platform DB is the right store for UI state. No secret values ever enter the DB — Phase.dev holds those.
- **Alternative rejected:** Browser localStorage for wizard state. Not persistent across devices/incognito and lost on sign-out.

### AD-3: `awaiting_provisioning` added to `instanceStatusEnum`

**Decision:** New enum value `awaiting_provisioning` inserted between `queued` and `provisioning`. Status lifecycle: `queued` → `awaiting_provisioning` → `provisioning` → `running`.

- **Rationale:** Eliminates EC-6 (Stripe-before-wizard race). Provisioner ignores `queued` instances. Only wizard completion can advance to `awaiting_provisioning`. The status is the ordering gate — no separate boolean flag needed.
- **Data model change:** Drizzle migration to alter the Postgres enum.

### AD-4: Stripe webhook stops at `queued` — no provisioner call

**Decision:** Remove `provisionerClient.provision()` from `handleCheckoutCompleted`. The webhook creates the instance at `queued` and stops.

- **Rationale:** Direct implementation of FR-2. Provisioning is triggered only by the wizard completion API route.
- **Impact:** Update idempotency guard in `handleCheckoutCompleted` to also skip `awaiting_provisioning`.

### AD-5: OpenRouter key validated server-side via `GET /api/v1/models`

**Decision:** Validate the OpenRouter key by calling `https://openrouter.ai/api/v1/models` with the key as a Bearer token. A 200 response means the key is valid; any non-200 is invalid.

- **Rationale:** Simple, reliable, no SDK needed. Returns 401 for bad keys. Called from a Next.js API route — key never leaves the server.

### AD-6: Real-time status via client-side polling

**Decision:** After wizard completion, the dashboard page polls `GET /api/instance/status` every 5 seconds. When status reaches `running` or `error`, polling stops and the UI transitions.

- **Rationale:** Simpler than WebSockets or SSE for an infrequent status change (provisioning takes ~60–90s). Polling at 5s is fine for UX and negligible cost.

---

## Data Model Changes

### 1. Add `awaiting_provisioning` to `instanceStatusEnum`

```sql
ALTER TYPE instance_status ADD VALUE 'awaiting_provisioning' AFTER 'queued';
```

Note: Postgres enum alterations are additive only. Existing rows with `queued` are unaffected.

Drizzle schema change:
```typescript
export const instanceStatusEnum = pgEnum("instance_status", [
  "queued",
  "awaiting_provisioning",   // NEW
  "provisioning",
  "awaiting_auth",
  "running",
  "stopped",
  "error",
  "deprovisioned",
]);
```

### 2. Add `wizardState` column to `instance`

```sql
ALTER TABLE instance ADD COLUMN wizard_state jsonb;
```

Drizzle schema change:
```typescript
wizardState: jsonb("wizard_state"),  // { completedSteps: number[], currentStep: number }
```

---

## Implementation Phases

### Phase 0 — Schema + Stripe webhook (platform)

**0.1** — Drizzle migration: add `awaiting_provisioning` to enum, add `wizardState` column.

**0.2** — `src/db/schema.ts`: update enum + add column.

**0.3** — `src/lib/stripe-webhook-handlers.ts` `handleCheckoutCompleted`: remove provisioner call entirely. Instance is created with `status = queued`, wizard state null. Update idempotency guard to skip `awaiting_provisioning` too.

**0.4** — `src/app/(protected)/dashboard/page.tsx`: add `awaiting_provisioning` to `statusConfig` map with appropriate label/detail text.

---

### Phase 1 — Provisioner: `/write-secrets` endpoint

New endpoint on the hermes-provisioner (`/mnt/f/overnightdesk-engine/internal/hermes/`):

**`POST /write-secrets`** — writes one or more secrets to Phase.dev for a tenant.

Request:
```json
{
  "tenantId": "alice",
  "secrets": {
    "OPENROUTER_API_KEY": "sk-or-...",
    "TELEGRAM_BOT_TOKEN": "123:abc",
    "TELEGRAM_ALLOWED_USERS": "123456789,987654321",
    "HERMES_AGENT_NAME": "Alice",
    "TIMEZONE": "America/New_York"
  }
}
```

Response: `200 { "success": true }` or `400/500 { "error": "..." }`

Implementation on provisioner:
- For each key/value pair, run: `phase secrets create KEY --app $PHASE_APP --env $PHASE_ENV --path /{tenantId}` (or `update` if already exists)
- The provisioner handles create-vs-update idempotently
- Bearer auth (same `PROVISIONER_SECRET`)

**Also update `POST /provision`** to accept optional `secrets` map — this allows the wizard to combine secret writing + provisioning in a single call for the completion step.

---

### Phase 2 — Platform API routes

**`POST /api/wizard/write-step`**
Called by the wizard after each step is confirmed. Validates the step inputs, calls `POST /write-secrets` on the provisioner, updates `instance.wizardState`.

Request:
```typescript
{ step: 1 | 2 | 3; secrets: Record<string, string> }
```

- Step 1: validates OpenRouter key first, then writes
- Step 2: validates both token and user IDs present, then writes
- Step 3: writes name + timezone (or defaults)

**`POST /api/wizard/complete`**
Called on final wizard confirmation. Calls `provisionerClient.provision()`, sets status to `awaiting_provisioning`, logs fleet event.

**`GET /api/instance/status`**
Returns current instance status + wizardState for polling. Already partially exists — extend to include `wizardState`.

**`POST /api/settings/update-credential`**
Called by Settings page to update a specific credential. Validates (OpenRouter key re-validated if changed), calls `POST /write-secrets`, calls `POST /restart`.

---

### Phase 3 — Wizard UI (platform)

New component: `src/app/(protected)/dashboard/setup-wizard.tsx`

**Structure:**
- Client component (`'use client'`)
- 3-step multi-step form
- Progress indicator (step 1/2/3)
- Step 1: OpenRouter key input + validate button → inline validation result
- Step 2: Telegram bot token + user IDs (optional, skip button)
- Step 3: Agent name + timezone (optional, skip button)
- Final confirmation step before submitting

**Integration in `dashboard/page.tsx`:**
- If `isHermesTenant(inst)` AND `inst.status === "queued"` → show `<SetupWizard />`
- If `isHermesTenant(inst)` AND `inst.status === "awaiting_provisioning"` or `"provisioning"` → show `<ProvisioningProgress />`
- If `isHermesTenant(inst)` AND `inst.status === "running"` → show existing hermes hub

New component: `src/app/(protected)/dashboard/provisioning-progress.tsx`
- Shows current status with label and animated indicator
- Polls `/api/instance/status` every 5s
- Transitions to hub on `running`, shows error on `error`

---

### Phase 4 — Settings UI (platform)

Update: `src/app/(protected)/dashboard/settings/page.tsx`

Add new `AgentCredentials` section (hermes tenants only):
- OpenRouter API key field (masked, editable)
- Telegram bot token field (masked, editable, optional)  
- Telegram allowed user IDs field (editable, optional)
- "Save and restart agent" button per credential group

Calls `/api/settings/update-credential` on save. Shows success/error inline.

---

## Security Considerations

| Concern | How it's addressed |
|---|---|
| OpenRouter key never in DB | Written to Phase.dev only, never stored in platform DB |
| OpenRouter key in transit | HTTPS + authenticated session; server-side API call to validate |
| OpenRouter key in logs | Log only `"openrouter key validated"`, never the value |
| Wizard API auth | Better Auth session required on all wizard API routes |
| provisioner secret | `PROVISIONER_SECRET` env var; timing-safe comparison |
| Per-step write atomicity | If `write-secrets` fails mid-step, instance stays `queued`, wizard shows retry |
| Settings update while restarting | EC-7: return 409 if restart already in progress; client shows "wait and retry" |

---

## Testing Strategy

**Unit tests:**
- `wizardState` update logic (step completion tracking)
- OpenRouter key validation (mock HTTP, happy + error paths)
- `write-secrets` call construction (correct Phase args per step)

**Integration tests:**
- `POST /api/wizard/write-step` with each step type
- `POST /api/wizard/complete` → provisioner called + status updated
- Settings update → write-secrets + restart called
- Stripe webhook does NOT call provisioner (regression test)

**Go tests (provisioner):**
- `POST /write-secrets` calls `phase secrets create/update` for each key
- Auth validation (401 without token)
- tenantID validation

Minimum 80% coverage on new platform code (constitution).

---

## Constitutional Compliance

| Requirement | Satisfied by |
|---|---|
| P1 Secrets sacred | All secrets via Phase.dev; `wizardState` has only booleans |
| P2 No plaintext secrets in DB | `write-secrets` writes to Phase.dev; no values in platform DB |
| P2 Secret rotation without redeploy | Settings → write-secrets + restart |
| P3 No autonomous provisioning | Wizard completion is explicit customer action; provisioner fires only then |
| P4 Simple | No new state management libraries; polling over WebSockets |
| P6 Honesty | Error states shown clearly (invalid key, failed write, provisioning error) |
| P7 Owner's time | Zero manual credential injection after this feature |
| P8 Platform quality | Non-technical user can complete in ≤5 min (NFR-9) |
| Pillar B API security | All wizard/settings routes require authenticated session |
| Pillar C Fleet events | Wizard completion logged as fleet event (FR-19) |

---

## Estimated Effort

| Component | Work |
|---|---|
| Schema migration (enum + column) | 1h |
| Stripe webhook change | 30m |
| Provisioner `/write-secrets` + tests | 3h |
| Platform API routes (write-step, complete, update-credential) | 3h |
| Wizard UI component + provisioning progress | 4h |
| Settings UI update | 2h |
| Tests (platform + provisioner) | 3h |
| **Total** | **~16.5h** |
