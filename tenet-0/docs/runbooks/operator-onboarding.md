# Operator Onboarding — Ed25519 Decision Signing

**Audience:** Gary (sole operator at MVP; future operators if added).
**Purpose:** generate the Ed25519 keypair the President uses to verify operator approval decisions per spec FR-25 + research §RES-8.
**Time:** ~10 minutes.
**Pre-requisites:** Phase.dev CLI installed; `~/.ssh/ssh-key-2026-03-15` for aegis-prod access.

## Why this matters

Operator decisions on pending approvals (e.g., "approve $5,000 outbound payment") flow through comm-module's Telegram bridge to Zero's session. **Without a signature on the operator's device, comm-module is the trust root** — a compromised comm-module could forge approvals. With device-signed decisions, comm-module is reduced to untrusted transport (security threat T4 mitigated).

## Procedure

### Option A — `age-keygen` on a trusted laptop (recommended for MVP)

```bash
# 1. Generate keypair
age-keygen -o ~/.config/tenet0/operator-decision.key
# Output:
#   Public key: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p

# 2. Extract just the pubkey
PUBKEY=$(grep "Public key:" ~/.config/tenet0/operator-decision.key | cut -d' ' -f4)
echo "$PUBKEY"

# 3. Register pubkey in Phase.dev
phase secrets create \
  --app overnightdesk --env production \
  --path /tenet-0/operator/ \
  -- decision-pubkey="$PUBKEY"

# 4. Lock down the private key
chmod 400 ~/.config/tenet0/operator-decision.key
```

**Backup:** copy `operator-decision.key` to a paper backup or hardware security key. **Never store in cloud sync** (Dropbox / iCloud / GDrive).

### Option B — `signal-cli` / mobile keystore (operationally lighter once set up)

For full mobile-first signing (matches the Telegram-on-phone use case), use a mobile crypto app that exposes Ed25519 signing via a URL scheme or QR-code flow. Document chosen tool here once selected.

Until the mobile flow is set up, **Option A is the MVP path** — sign decisions from your laptop via the comm-module's `/operator/sign` web helper (bridges browser-side `age` signing to Telegram replies).

## Verification — first-decision smoke test

After registration, before relying on real approvals:

```bash
# 1. SSH to aegis-prod
ssh -i ~/.ssh/ssh-key-2026-03-15 ubuntu@147.224.183.55

# 2. Trigger a synthetic approval request
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
  INSERT INTO bus.events (id, event_type, source, payload, timestamp) VALUES
    (gen_random_uuid(), 'fin.approval.requested', 'fin',
     '{\"target_event_type\":\"fin.test.smoke\",\"context\":\"onboarding test\"}'::jsonb, now());
  NOTIFY event_bus, 'fin.approval.requested';
"

# 3. Wait for Telegram notification (~10 seconds via comm-module)
# 4. Reply with signed decision per the procedure in your operator app
# 5. Verify outcome event published:
docker exec tenet0-postgres psql -U bus -d tenet0 -c "
  SELECT event_type, payload->>'reason' FROM bus.events
  WHERE event_type = 'president.approved'
  ORDER BY timestamp DESC LIMIT 1;
"
# Expected: one row with your reason text.
```

## Rotation

Rotate the keypair every 12 months OR immediately after any device loss/compromise:

```bash
# 1. Generate new key (Option A or B)
# 2. Register new pubkey under a versioned path:
phase secrets create --app overnightdesk --env production \
  --path /tenet-0/operator/ \
  -- decision-pubkey-v2="$NEW_PUBKEY"

# 3. Update bus-watcher env to accept BOTH keys during grace window:
# (env: OPERATOR_DECISION_PUBKEY_V1, OPERATOR_DECISION_PUBKEY_V2 — bus-watcher tries each)

# 4. After 24h grace, revoke v1:
phase secrets delete --app overnightdesk --env production \
  --path /tenet-0/operator/ \
  --key decision-pubkey-v1
```

Mirrors Feature 49 EC-1b grace-window pattern.

## Fallback (deferred hardening)

If Ed25519 onboarding cannot be completed for any reason, ship MVP with `OPERATOR_AUTH=comm-module-signed` env flag set on bus-watcher. This downgrades trust to "comm-module signs decisions on operator's behalf" — **comm-module compromise becomes a forgery risk** (security T4 unmitigated).

This fallback is **explicitly inferior** and should be removed within 30 days of first deploy. Document it in `/mnt/f/deploys.log` if invoked.

## References

- Spec: `.specify/specs/50-tenet0-director-runtime/spec.md` FR-25, NFR-9
- Research: `.specify/specs/50-tenet0-director-runtime/research.md` §RES-8 + §Decision: Operator Decision Authentication
- Plan: `.specify/specs/50-tenet0-director-runtime/plan.md` §Security Strategy
- Phase 49 EC-1b: credential rotation grace pattern
