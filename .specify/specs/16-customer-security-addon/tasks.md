# Feature 16: Task Breakdown

---

## Story 1: SecurityTeam Multi-Token Auth

### Task 1.1: Multi-token auth tests (RED)
**Status:** 🟡 Ready
**Repo:** overnightdesk-securityteam

Test that server accepts multiple comma-separated tokens.

### Task 1.2: Multi-token auth implementation (GREEN)
**Status:** 🔴 Blocked by 1.1
**Repo:** overnightdesk-securityteam

Change auth hook to validate against array of token buffers.

---

## Story 2: Provisioning Security Tokens

### Task 2.1: Instance schema + token generation tests (RED)
**Status:** 🟡 Ready
**Repo:** overnightdesk

### Task 2.2: Instance schema + token generation (GREEN)
**Status:** 🔴 Blocked by 2.1
**Repo:** overnightdesk

Add securityToken field, generate for Pro plan instances.

### Task 2.3: Provisioner params extension
**Status:** 🔴 Blocked by 2.2
**Repo:** overnightdesk

Pass SECURITY_URL + SECURITY_TOKEN to provisioner for Pro plans.

---

## Story 3: Dashboard Plan Gating

### Task 3.1: Plan-based security tab + API routes
**Status:** 🟡 Ready
**Repo:** overnightdesk

- requireProOrAdmin() helper
- Security tab visible for Pro + admin
- API routes gated by plan
- 403 with upgrade message for Starter

### Task 3.2: Customer vs admin security page
**Status:** 🔴 Blocked by 3.1
**Repo:** overnightdesk

Hide audit triggers for non-admin Pro users. Show only their own data.

---

## Story 4: Pricing Page + Upgrade/Downgrade

### Task 4.1: Pricing page update
**Status:** 🟡 Ready
**Repo:** overnightdesk

Add security features to Pro plan list.

### Task 4.2: Upgrade/downgrade webhook handling
**Status:** 🔴 Blocked by 2.2
**Repo:** overnightdesk

Handle plan changes in Stripe webhook: generate/revoke security tokens.

---

## Summary: 8 tasks, Medium complexity
