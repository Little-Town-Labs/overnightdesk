# QG-1 Security Review — Tenet-0 Event Bus

**Date:** 2026-04-15
**Scope:** Feature 49 Phases 1-7
**Reviewer:** security-reviewer agent
**Outcome:** APPROVE WITH CHANGES — 2 of 3 critical findings fixed; 1 deferred with tracked mitigation

## Summary

Solid foundation — bcrypt-hashed credentials, parameterized SQL,
atomic approval consumption, INSERT-only audit log grants, causality
cycle detection — but the default Postgres `PUBLIC` grant on newly
created functions undermined the role model. Fixed in migration
`010_security_hardening.sql`.

## Findings

### 🔴 C1: Implicit PUBLIC EXECUTE on admin SPs — FIXED

`rotate_credential` and `activate_constitution` received an implicit
`PUBLIC` grant when created. Any caller holding `tenet0_app` (or any
role at all) could invoke them and escalate privilege end-to-end.

**Fix applied (migration 010):**
- `REVOKE ALL ... FROM PUBLIC` on both admin SPs + all four internal
  `_*` helpers.
- `GRANT EXECUTE ... TO tenet0_admin` on admin SPs only.
- `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON
  FUNCTIONS FROM PUBLIC` so future migrations inherit the posture.
- Column-scoped `SELECT` on `departments` — `tenet0_app` loses
  `credential_hash` / `previous_credential_hash` visibility.

**Verification on live aegis-prod:**
```
                proname              |            proacl             
  activate_constitution | {tenet0_admin=X/tenet0_admin}
  rotate_credential     | {tenet0_admin=X/tenet0_admin}

  grantee   | privilege_type |            cols            
  tenet0_app | SELECT         | id,status,namespace_prefix
```

### 🔴 C2: `tenet0_app` has direct SELECT on `events` — DEFERRED (tracked)

A compromised `tenet0_app` database password plus Postgres network
reachability lets an attacker bypass the SP layer and run
`SELECT * FROM events` directly, reading every department's payloads
including approval events.

**Proper fix** requires:
1. `REVOKE SELECT ON events FROM tenet0_app`.
2. New SECURITY DEFINER SPs `read_event(p_credential, p_id)` and
   `replay_events(p_credential, p_subscription_key, p_limit)` enforcing
   subscriber-side namespace/pattern boundaries.
3. Bus-go `Subscription.replayMissed` and `Subscription.deliverById`
   rewritten to use those SPs instead of raw SELECT.
4. Bus-ts counterparts.
5. Contract tests to prove parity.

**Interim mitigation:** protect the `tenet0_app` DB password at the
same level as department bearer tokens — it is now effectively a
second authentication layer. The docker-compose.yml already stores it
in `secrets/tenet0.env` (0600, gitignored).

**Follow-up tracked** as part of the Phase 2/3 rework backlog.

### 🔴 C3: SQL injection via migration filename — FIXED

`01_migrate.sh` interpolated `basename "$m"` into SQL: a filename
containing `'` would have been executable. Fixed by passing the
filename through `psql -v fname=... :'fname'` so psql quotes it.

### 🟡 I1: bcrypt timing oracle with small `departments` table

Accepted as-is while department count stays small (≤8). Revisit if it
grows. Documented in migration 010 header comments.

### 🟡 I2: `_causality_depth` loop bound of 12 vs check of 10

Cosmetic — rejects deep cycles with the wrong reason string but the
event is still rejected. Documented; not addressed in this migration.

### 🟡 I3: Client-supplied token counts trusted verbatim

`record_token_usage` trusts caller-supplied token totals. A malicious
department can report zero usage and never hit its budget. Real risk
requires compromising the agent's Bus client (same trust boundary as
the department credential). Documented; a future bound-check can be
added without API change.

### 🟡 I4: `Audit` queries interpolated `LIMIT` — FIXED

Changed `fmt.Sprintf("... LIMIT %d")` / template literal `LIMIT
${limit}` to parameterized `LIMIT $N` in both bus-go `audit.go` and
bus-ts `audit.ts`. Values are numeric-validated but the pattern was a
footgun.

### 🟡 I5: Constitution polling self-DoS

At 24 QPS (8 depts × 3 watchers × 1Hz) this is manageable today.
`LISTEN constitution_changed` migration is a clean follow-up —
tracked.

### 🔵 Minor

Documented in the full review: smoke-test.sh credential in shell
history, gen-secrets.sh entropy stripping, bus-go pattern matching
treating `*.foo` loosely, env_file tradeoff. All acknowledged; none
block QG-1.

## Regression after migration 010

All three test suites green with the hardening applied:

| Suite | Result |
|---|---|
| bus-go | pass (go test -race) |
| bus-ts | 30/30 |
| contract-tests | 4/4 |

## Decision

**QG-1 signed off.** Tenet-0 is cleared for agent traffic. C2 remains
the highest-priority item on the hardening backlog; the pragmatic
mitigation (protect the DB password) is documented and in place.
