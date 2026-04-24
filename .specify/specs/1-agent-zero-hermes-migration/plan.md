# Implementation Plan: Agent Zero — Hermes Migration

**Spec version:** 1.1.0 | **Constitution:** v2.0.0 | **Feature:** 1 (P0)
**Created:** 2026-04-24

---

## Executive Summary

Replace the legacy Go daemon (`overnightdesk-tenant-0`) running on aegis-prod with a `hermes-agent` container acting as Agent Zero. The swap is performed in a single controlled window: stop the Go daemon, inject Phase.dev secrets to disk, start hermes-agent gateway + dashboard sidecar, verify health, then update the platform `instance` row.

The Go daemon's bind-mounted data volume at `/opt/overnightdesk/tenant-0/` is never touched — rollback is a single `docker start` away.

Beyond the operational outcome, this feature's real deliverable is a **validated, parameterised deployment procedure** — the canonical input to Feature 2 (automated provisioner). Every step executed manually here must be traceable to a parameter or template that the future provisioner can substitute.

**Delivery mode:** Manual operator execution by Gary over SSH. No new platform source code beyond a one-row DB update and two fleet event inserts.

---

## Architecture Decisions

### AD-1: Separate Data Directory (`/opt/agent-zero/`), Not a Clone of Tenant-0

**Decision:** hermes-agent writes to a fresh `/opt/agent-zero/` bind mount, not a reuse of `/opt/overnightdesk/tenant-0/`.

- **Rationale:** Go daemon data remains pristine for rollback (AC-1.2, AC-3.1). Follows the `hermes-mitchel` precedent (`/opt/{name}/` → `/opt/data`). Clean cutover with zero schema-compatibility concerns between the two engines.
- **Alternatives rejected:** Shared volume (breaks rollback guarantee); copy-on-start (implies engine compatibility that doesn't exist).

### AD-2: Phase.dev Path `/agent-zero/` — Parallel to Tenant Path Convention

**Decision:** New Phase.dev path `/agent-zero/` under app `overnightdesk`, env `production`. Secrets injected via `phase secrets export --path /agent-zero > /opt/agent-zero/.env` at deploy time — hermes reads `/opt/data/.env` natively.

- **Rationale:** Mirrors the existing validated pattern (`/tenant-0`, `/platform-orchestrator`, `/tenet0-postgres`). Zero risk of collision with another tenant path (EC-5). `.env` lives on host disk only — not in the platform DB, not in the image (NFR-1, Constitution P2).
- **Alternative rejected:** `phase run -- docker compose up` wrapping (Go daemon style). Rejected because hermes-agent's contract expects `/opt/data/.env` — we follow the engine's contract.

### AD-3: Two Containers (Gateway + Dashboard), Shared Data Volume

**Decision:** Mirror the `hermes-mitchel` topology: `hermes-agent-zero` (gateway: Telegram + cron) and `hermes-agent-zero-dashboard` (sidecar: `:9119`). Both bind-mount `/opt/agent-zero/` → `/opt/data`.

- **Rationale:** Matches upstream Nous Research deployment pattern. Dashboard failures do not take down the gateway. Separation of concerns (Constitution P4).

### AD-4: Platform DB Update is a One-Shot Script

**Decision:** Update the Agent Zero `instance` row via a scripted Drizzle call. No new API surface required.

- **Rationale:** Single idempotent statement. Will be absorbed into the Feature 2 provisioner service later. No need to build new tooling for a one-time operation.

### AD-5: No Observation Window, No Parallel Running

**Decision:** Clean swap per spec. Go daemon data volume decommissioning is a **separate, later, explicit operator action** (FR-7, FR-9, AC-3.3).

- **Rationale:** Parallel operation risks port conflicts and exceeds aegis-prod capacity (EC-6). Rollback is trivial — one command restores prior state with zero data loss.

---

## Phase-by-Phase Implementation

### Phase 0 — Pre-Swap Preparation *(no service interruption)*

**0.1 Capture the Go daemon's current secrets**
- SSH to aegis-prod; read `/opt/overnightdesk/tenant-0/.env` and inspect the running container for injected env vars.
- Enumerate every secret Agent Zero currently relies on.

**0.2 Create Phase.dev `/agent-zero/` path**
- In Phase.dev console (app `overnightdesk`, env `production`), create path `/agent-zero/`.
- Populate at minimum:
  - `OPENROUTER_API_KEY` — model routing (new; Go daemon did not use this)
  - `TELEGRAM_BOT_TOKEN` — carried from tenant-0 (same bot, ♦️Diamonds group + Gary direct)
  - Any additional secrets discovered in step 0.1
- Verify: `phase secrets list --app overnightdesk --env production --path /agent-zero` returns expected keys.

**0.3 Pre-create data directory on aegis-prod**
- Create `/opt/agent-zero/` owned by `ubuntu`, permissions `0700`.
- Write `/opt/agent-zero/config.yaml` — hermes agent config (personality, cron schedules for heartbeats, Telegram chat IDs for ♦️Diamonds group and Gary direct). This file is not a secret.

**0.4 Author the parameterised deploy script**

Script name: `scripts/deploy-hermes-tenant.sh`. Not executed yet — authored and reviewed in this phase.

**Required parameters (all externally supplied):**

| Parameter | Agent Zero value | Role |
|-----------|-----------------|------|
| `TENANT_NAME` | `agent-zero` | Container name suffix, data dir suffix, Phase path |
| `PHASE_APP` | `overnightdesk` | Phase.dev app |
| `PHASE_ENV` | `production` | Phase.dev env |
| `PHASE_PATH` | `/agent-zero` | Phase.dev secrets path |
| `DATA_DIR` | `/opt/agent-zero` | Host bind-mount source |
| `GATEWAY_PORT` | `8642` | hermes API port (internal only for Agent Zero) |
| `DASHBOARD_PORT` | `9119` | Dashboard sidecar port |
| `DOCKER_NETWORK` | `overnightdesk_overnightdesk` | Existing Docker network |
| `IMAGE` | `nousresearch/hermes-agent:latest` | Engine image |

**What the script must do:**
1. Validate all required parameters are set; fail fast if any are missing.
2. Verify `DATA_DIR` exists with `0700` permissions, owned by `ubuntu`.
3. Verify `$DATA_DIR/config.yaml` exists.
4. Run `phase secrets export` → write to `$DATA_DIR/.env`; set `chmod 600`.
5. Validate `.env` contains at minimum `OPENROUTER_API_KEY` and `TELEGRAM_BOT_TOKEN`; abort if missing (EC-1).
6. Remove any existing containers with the same names (idempotent).
7. Start **gateway** container: name `hermes-$TENANT_NAME`, image, network, bind mount `$DATA_DIR:/opt/data`, restart `unless-stopped`, command `hermes gateway run`, security baseline (cap-drop ALL, read-only rootfs with `/tmp` + `/opt/data` writable, seccomp, AppArmor).
8. Start **dashboard** container: name `hermes-$TENANT_NAME-dashboard`, same image + mount + network, command `hermes dashboard --host 0.0.0.0 --port 9119 --no-open --insecure`, same security baseline, port published to `127.0.0.1:$DASHBOARD_PORT` only.
9. Health check loop: poll gateway API for up to 60s; exit 0 on success, exit 1 + dump logs on timeout (EC-2).
10. Emit structured success line `DEPLOY_OK tenant=$TENANT_NAME` for operator / future provisioner to parse.

**Failure-mode documentation (FR-10, AC-4.3):** Each step's failure mode (missing Phase secret, network not present, image pull failure, health-check timeout) must be logged alongside the script with remediation notes.

---

### Phase 1 — The Swap *(brief service interruption)*

**1.1 Check for active jobs (EC-3)**
- Query the Go daemon for in-flight work. If active, wait for completion before proceeding.

**1.2 Notify in ♦️Diamonds** (Gary, manual): "Agent Zero migration starting, brief downtime expected."

**1.3 Stop the Go daemon**
- `cd /opt/overnightdesk && docker compose stop tenant-0`
- Confirm: container shows `Exited`.
- **Do not touch** `/opt/overnightdesk/tenant-0/` data directory (AC-3.1).

**1.4 Run the deploy script**
- `TENANT_NAME=agent-zero PHASE_PATH=/agent-zero DATA_DIR=/opt/agent-zero ./scripts/deploy-hermes-tenant.sh`
- Watch for `DEPLOY_OK` output or a documented failure mode.

**1.5 Post-start health checks (FR-8)**
- Gateway API: HTTP 200 from inside the gateway container.
- Dashboard: HTTP 200 at `http://127.0.0.1:9119/` from the host.
- Telegram connectivity: gateway log shows active polling/connection. Gary confirms receipt of a Telegram message from Agent Zero (AC-1.3, FR-4).

**1.6 If health check fails → ROLLBACK** (see Rollback Procedure section).

---

### Phase 2 — Platform DB Update

**2.1 Update the `instance` row for Agent Zero**

Using Drizzle (one-shot script or Drizzle Studio):

```ts
await db.update(instance)
  .set({
    containerId: "hermes-agent-zero",   // triggers isHermesTenant() = true
    status: "running",
    claudeAuthStatus: "connected",      // hermes uses OpenRouter, no Claude BYOS
    provisionedAt: new Date(),
    updatedAt: new Date(),
    consecutiveHealthFailures: 0,
  })
  .where(eq(instance.tenantId, "<agent-zero-tenant-id>"));
```

Note: `isHermesTenant()` in `src/lib/instance.ts` keys on `containerId` prefix `hermes-` — this single update flips Agent Zero into the hermes code path platform-wide.

**2.2 Log fleet events (FR-6, AC-1.4, NFR-4)**

Insert into `fleet_event`:
- `eventType: "engine.swap.initiated"` — `details: { from: "overnightdesk-engine", to: "hermes-agent" }`
- `eventType: "engine.swap.completed"` — `details: { containerId: "hermes-agent-zero", healthCheckPassedAt: <ts> }`

**2.3 Verify in dashboard**
- `https://overnightdesk.com/dashboard` (Gary's view) → Agent Zero shows `running`, fleet events visible.

---

### Phase 3 — Validate and Document

**3.1 Informal soak**
- Gary observes Telegram heartbeats and issues a few commands over the next day.
- No formal gate — any anomaly triggers rollback evaluation.

**3.2 Scratch-tenant replay (AC-4.4)**
- Gary runs the deploy script with `TENANT_NAME=scratch-test`, a matching Phase.dev path pre-populated with the same secrets, and `DATA_DIR=/opt/scratch-test`.
- Confirm `hermes-scratch-test` and `hermes-scratch-test-dashboard` running and healthy within 2 minutes.
- Tear down: remove both containers, delete `/opt/scratch-test/`, delete Phase.dev scratch path.
- **Outcome:** If this succeeds unattended, the script is deemed reusable — it becomes the input to Feature 2's spec.

**3.3 Capture failure modes (AC-4.3, FR-10)**
- Append a "Failure Modes Observed" section to the deploy script's companion README: trigger, symptom, fix, whether the automated provisioner should handle it or escalate.

**3.4 Sign-off gate (AC-2.4)**
- Gary explicitly confirms: "Procedure is parameterised, self-contained, reusable. Feature 2 may begin specification."

**3.5 Legacy decommissioning (deferred)**
- **Not part of this feature's completion.** After a Gary-determined retention period (≥ 30 days per NFR-3), a separate operator action:
  - Remove Go daemon container.
  - Archive `/opt/overnightdesk/tenant-0/` to cold storage (retained 30 additional days).
  - Insert fleet event `eventType: "legacy.tenant0.decommissioned"` with actor = Gary's user ID.

---

## Data Model Changes

**None.** The `instance` table already has every required column (`containerId`, `claudeAuthStatus` enum with `connected`, `status` enum with `running`). The `fleet_event` table accepts any `eventType` string. **No migration needed.**

Row-level change only: one `UPDATE` on the Agent Zero `instance` row + two `INSERT`s into `fleet_event`.

---

## Testing & Verification

This feature modifies no platform source files — the test surface is operational:

| Check | Verification |
|-------|-------------|
| Phase.dev path populated | `phase secrets list --path /agent-zero` returns expected keys before swap |
| Secrets injected correctly | `/opt/agent-zero/.env` contains required keys, mode `600`, after script runs |
| Containers running | `docker ps` shows both `hermes-agent-zero` and `hermes-agent-zero-dashboard` as `Up` |
| Gateway health | HTTP 200 on health endpoint inside gateway container |
| Telegram connectivity | Gary receives a heartbeat in ♦️Diamonds within first cron window |
| Command response | Gary issues a command; Agent Zero replies (FR-4) |
| DB consistency | Instance row shows `hermes-agent-zero`, `running`, `connected` |
| Fleet events | Swap events present in `fleet_event` for Agent Zero's instance ID |
| Mitchel isolation | `hermes-mitchel` and its dashboard untouched; nginx config unchanged (AC-5.3) |
| Reusability | Scratch-tenant replay succeeds without script edits (AC-4.4) |
| Secret rotation | Update a Phase.dev value, restart gateway, verify new value loaded — proves NFR-6 |

**No new unit/integration tests** — no platform source files are modified. Existing tests for `updateInstanceStatus` and `isHermesTenant` cover the DB helpers being used.

---

## Rollback Procedure

Triggered by: health check failure, Telegram connectivity absent, secrets injection failure, or Gary's judgement.

1. Stop and remove both hermes containers.
2. `cd /opt/overnightdesk && docker compose start tenant-0` — volume is intact, Go daemon resumes.
3. Verify `overnightdesk-tenant-0` is `Up` and Telegram heartbeat resumes.
4. Revert `instance` row in platform DB to prior values.
5. Insert fleet event `eventType: "engine.swap.rolledback"` with failure details.
6. **Do not delete** `/opt/agent-zero/` — keep for forensic analysis before next attempt.
7. Gary posts rollback notice in ♦️Diamonds.

**Rollback SLA:** < 5 minutes from decision to Go daemon healthy.

---

## Constitutional Compliance

| Principle / Pillar | Requirement | Satisfied by |
|---|---|---|
| P1 Data Sacred | Tenant data not modified during swap | Go daemon volume untouched; fresh `/opt/agent-zero/` for hermes |
| P1 | 30-day retention on decommission | Legacy decommission deferred + NFR-3; separate explicit action |
| P2 Secrets never plaintext | All creds in Phase.dev | `/agent-zero/` path; `.env` on host `chmod 600`; nothing in DB or image |
| P2 | Rotation without redeploy | NFR-6 verified via Phase 3 rotation test |
| P3 | No autonomous decommissioning | All operator-gated; decommission deferred (FR-9) |
| P4 Simple | No new dependencies | Uses existing `phase` CLI, Docker, Drizzle |
| P6 Honesty | Dashboard reflects truth | `status = running` only after health check passes |
| P7 Owner's Time | Procedure becomes reusable template | FR-10, AC-4.4 — feeds Feature 2 |
| P8 Platform Quality | Status indicators truthful | Post-swap instance + fleet events accurately represent state |
| Pillar A | Drizzle ORM for DB | Phase 2.1 uses Drizzle `update` |
| Pillar C | `nousresearch/hermes-agent:latest` | Enforced as `IMAGE` parameter in script |
| Pillar C | Phase.dev injection | `phase secrets export` → `/opt/data/.env` — hermes's native contract |
| Pillar C | Container security baseline | Script applies cap-drop, seccomp, AppArmor, read-only rootfs |
| Pillar C | Fleet events on state changes | Phase 2.2 inserts both swap events |

**Exceptions:** None.

---

## Estimated Effort

| Phase | Wall clock | Active operator time |
|-------|-----------|----------------------|
| Phase 0 — Prep | 60–90 min | 60 min |
| Phase 1 — Swap | 15–30 min | 30 min |
| Phase 2 — DB update | 10 min | 10 min |
| Phase 3.1 — Soak | 24 h | ~10 min monitoring |
| Phase 3.2 — Scratch replay | 30 min | 30 min |
| Phase 3.3–3.4 — Docs + sign-off | 60 min | 60 min |
| **Total (excl. soak)** | **~3.5 h** | **~3.5 h** |

Legacy decommissioning scheduled separately, ≥ 30 days after Phase 3 sign-off.
