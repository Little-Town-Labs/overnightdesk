# Technology Research — Feature 7: Customer Dashboard

## Decision 1: Dashboard Layout Pattern

**Context:** Feature 7 adds 6 new sections (overview, heartbeat, jobs, activity, logs, settings). Need a navigation pattern.

**Options Considered:**
1. **Tab navigation** — Horizontal tabs within the dashboard page, each tab loads a section
2. **Nested routes** — `/dashboard`, `/dashboard/heartbeat`, `/dashboard/jobs`, `/dashboard/settings`, etc.
3. **Single scrollable page** — All sections stacked vertically

**Chosen:** Nested routes with sidebar/tab navigation
**Rationale:**
- Each section is independent and benefits from its own URL (bookmarkable, shareable)
- Server components can fetch data per-route instead of loading everything at once
- Settings page in particular should be separate (destructive actions isolated from daily-use sections)
- Aligns with Next.js App Router patterns — each route is a server component
**Tradeoffs:** More files, but each is focused and under 400 lines. Navigation component needed.

---

## Decision 2: Engine API Proxy Pattern

**Context:** Dashboard needs to call 8+ engine endpoints. Engine uses bearer token auth. Client components cannot call engine directly (token must not be exposed).

**Options Considered:**
1. **Extend engine-client.ts** — Add more functions to existing module, call from server components
2. **API proxy routes** — Create `/api/engine/*` routes that proxy to engine, call from client components
3. **Server actions** — Use Next.js server actions for mutations, server components for reads

**Chosen:** Hybrid — server components for reads + API routes for client-side mutations
**Rationale:**
- Server components (page.tsx files) can call engine-client.ts directly for initial data load — no API route needed
- Client-side mutations (save heartbeat, create job, restart instance) need API routes since they require bearer token
- Server actions could work but API routes are more testable and align with existing patterns (auth-status, terminal-ticket)
- Constitution says "no client-side data fetching libraries" — server components for reads avoids this entirely
**Tradeoffs:** More API routes, but each is small and follows established pattern.

---

## Decision 3: Account Management Approach

**Context:** Need email change, password change, and account deletion. Better Auth already handles auth.

**Options Considered:**
1. **Better Auth built-in methods** — Use auth.api.changeEmail(), auth.api.changePassword(), etc.
2. **Custom API routes** — Build account management from scratch
3. **Hybrid** — Use Better Auth where available, custom for deletion

**Chosen:** Better Auth built-in methods + custom deletion
**Rationale:**
- Better Auth provides `changeEmail` and `changePassword` client APIs — battle-tested, handles edge cases
- Account deletion needs custom logic: cancel Stripe subscription, trigger deprovisioning, then delete user
- Using the auth library's own methods ensures session/token consistency
**Tradeoffs:** Coupled to Better Auth API, but we're already fully committed to it.

---

## Decision 4: Instance Restart Mechanism

**Context:** Need to restart a tenant's Docker container from the dashboard.

**Options Considered:**
1. **Engine API restart endpoint** — Call engine's control API to restart itself
2. **Provisioner restart** — Call Oracle Cloud provisioner to restart the container
3. **Engine process restart** — Engine restarts its own process (systemd, supervisor)

**Chosen:** Provisioner restart
**Rationale:**
- The engine runs inside the container — it can't restart its own container
- The provisioner already manages container lifecycle (provision, deprovision)
- Adding a restart endpoint to the provisioner is the natural extension
- The platform sends POST to provisioner with action: "restart" + tenantId
**Tradeoffs:** Requires provisioner to support restart action (new endpoint). Restart takes longer than process-level restart. But it's the only approach that actually restarts the container.

---

## Decision 5: Rate Limiting Strategy

**Context:** Restart and job creation need rate limiting.

**Options Considered:**
1. **In-memory rate limiter** — Simple Map-based tracker in API route
2. **Database-backed** — Track in NeonDB
3. **Vercel KV / Upstash Redis** — Distributed rate limiting

**Chosen:** In-memory rate limiter (Map)
**Rationale:**
- Vercel serverless functions are ephemeral, so in-memory isn't persistent across cold starts
- However, at current scale (< 100 users), this is sufficient — a determined user could bypass on cold start, but the 5-minute restart cooldown is a UX guard, not a security boundary
- No need for Redis/KV cost when a simple timestamp check covers the 99% case
- If needed later, can upgrade to Upstash without changing the API surface
**Tradeoffs:** Not perfectly persistent across serverless instances. Acceptable at this scale.
