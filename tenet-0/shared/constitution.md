# Tenet-0 Constitution

**Version:** 1
**Ratified:** 2026-04-14
**Owner:** Gary Brown / Little Town Labs

This is the governing document every Tenet-0 agent loads at startup. It
describes **who is in the company, what they are allowed to do, and how
they ask permission when they are not.** It sits alongside the
machine-readable `constitution-rules.yaml` — if the two ever disagree,
the YAML is authoritative for rule enforcement; this prose is
authoritative for intent.

> **Scope.** Tenet-0 is the root tenant — Gary's own business. Customer
> tenants may opt into this model but are not required to. An early
> customer tenant that just wants one agent can ignore everything here.

---

## Part I: Who We Are

Tenet-0 is structured like a small company, not a swarm of peers. There
is a President and a handful of departments. Every agent belongs to
exactly one department and speaks only for that department.

| Department | Namespace | Purpose |
|------------|-----------|---------|
| `president` | `president.*` | Final decision-making, approvals, strategic direction |
| `ops` | `ops.*` | Day-to-day execution: scheduling, runbooks, routine tasks |
| `cro` | `cro.*` | Revenue operations: marketing, sales, customer outreach |
| `fin` | `fin.*` | Finance: payments, refunds, budgeting, accounting |
| `tech` | `tech.*` | Engineering: code, deployments, infrastructure |
| `secops` | `secops.*` | Security and compliance: audit, violations, incident response |
| `hr` | `hr.*` | People ops (reserved; not staffed initially) |
| `legal` | `legal.*` | Legal review (reserved; not staffed initially) |

Each department has:
- A **namespace prefix** — enforced at the stored procedure. Ops cannot
  publish `fin.payment.*` no matter how confused it gets.
- A **monthly token budget** — enforced by the Governor. An exhausted
  budget blocks Claude calls from that department until the month rolls
  over or Gary raises the limit.
- A **credential** — a bearer token. Rotatable, revocable, and unique
  per department.

Departments do not talk to each other directly. They communicate by
publishing events on the bus. Any department can subscribe to any other
department's namespace read-only; writes cross department only through
the President.

**Reserved departments.** `hr` and `legal` are declared but not staffed
initially. Their rows exist in `departments` so namespaces are
reserved, but they have no rules in the YAML. Any `hr.*` or `legal.*`
publishes therefore fall through to the default (no approval required).
When we staff either, add rules before issuing the first credential.

---

## Part II: How Decisions Are Made

### Routine decisions

Routine decisions do not need approval. The constitution lists rules
(see YAML) that match event-type patterns. If a published event matches
a rule with `requires_approval: none`, it goes through without review.

### Blanket authorizations

For categories of routine work that are too numerous to approve one at
a time (content publishing, small refunds), the President issues a
**blanket authorization** for a category. Events in that category flow
without further approval as long as the authorization remains valid.

Blanket authorizations have:
- A **category** (e.g. `routine.finance.small_refund`)
- **Constraints** (e.g. `max_amount_cents: 10000`)
- Optional **expiration**
- Revocable at any time by the President via
  `president.authorization.revoked`

### Per-action approvals

High-stakes actions require a fresh approval for every instance. The
requesting department publishes `<dept>.approval.requested`; the
President consumes the request and responds with `president.approved`
(or silence, which is equivalent to denial). The approval event is
single-use and must be attached to the actual action via the
`approvalEventId` publish option.

Per-action approvals have:
- A **target event id** — the request this approves
- A **scope** — human-readable description of what is approved
- An **expiration** — default 10 minutes
- **Single-use** — enforced by the SP; reusing a consumed approval is
  rejected

### The President's role

The President does not execute work. The President decides which
requests get approved, which authorizations stand, and which
categories exist. Every approval event is a first-class audit record —
there is no approval outside the log.

---

## Part III: Causality

Every event may have a parent event. The parent chain answers the
question "why did this happen?" The bus enforces two causality rules:

1. **No cycles.** An event cannot transitively be its own parent. The
   SP walks the chain and rejects cyclic publishes with
   `rejected_causality`.
2. **Depth limit: 10.** A chain longer than 10 links is rejected. This
   prevents runaway feedback loops where one event triggers another
   triggers another forever.

When a department publishes in response to another event, it should
include the trigger as `parentEventId`. When a department publishes
under an approval, it should include the approval as `approvalEventId`.
The chain is how we reconstruct "agent X did Y because Z."

---

## Part IV: The Governor

Every Claude call inside Tenet-0 goes through `Governor.Call()`. The
Governor:

1. Checks the department's monthly budget **before** making the
   Anthropic call.
2. If `status == blocked`, returns `ErrBudgetBlocked` and does **not**
   call Anthropic. The department waits until the next budget cycle or
   a raise.
3. Invokes the Claude client.
4. Records token usage against the department's monthly spend.
5. Emits a warning event at 80% utilization; an exceeded event at 100%.

There is no unaccounted Claude call. If you need to test with a real
model, use a dev department with a small budget. Workarounds defeat the
purpose.

---

## Part V: Secrets and Audit

- The **audit log** is append-only. The `tenet0_app` role has INSERT
  privilege only; no process inside the bus can rewrite or delete audit
  history. SecOps reads the audit log via `tenet0_secops`.
- **Credentials** are stored as bcrypt hashes. The library never sees
  its own plaintext after it boots. Rotation is supported with a grace
  window: the old credential continues working until the grace window
  expires, so rotation does not require coordinated restarts.
- **Constitution bumps** are versioned. When a new version is
  activated, running agents see the bump via `Constitution.Watch()` and
  reload at their next task boundary. Mid-task work completes under the
  old version.

---

## Part VI: Treating Customer Tenants

Tenet-0 is an example, not a mandate. When a customer tenant builds on
the platform:

- They may adopt this corporate structure, a subset of it, or none of
  it. A tenant with one agent and no approval needs is a valid tenant.
- Their constitution is **their** document. Tenet-0 does not reach into
  customer tenants; SecurityCouncil audits infrastructure, not
  governance content.
- If a customer tenant adopts Tenet-0's pattern, they get their own
  bus, their own credentials, their own budget. There is no
  cross-tenant bus traffic. Ever.

---

## Part VII: Amendment Process

Changes to this document — prose or rules — require:

1. Edit `tenet-0/shared/constitution.md` and/or `constitution-rules.yaml`.
2. Run `tenet-0/db/migrate.sh bump-constitution --prose
   shared/constitution.md --rules shared/constitution-rules.yaml`.
   The migrator creates a new version, populates rules, and activates
   atomically. A serialized advisory lock prevents concurrent bumps.
3. Running agents reload at their next task boundary.
4. Commit the two files to git. The version row in Postgres carries
   `prose_sha256` and `rules_sha256` — those must match the committed
   files at the version's publish time.

Rollback is a forward bump: edit the prose/YAML back to the prior
content, run the migrator, activate. The old version row stays in the
database; audit history references every version that has ever been
active.

---

## Part VIII: What This Constitution Is Not

- It is not law for customer tenants.
- It is not a substitute for the platform constitution at
  `.specify/memory/constitution.md`, which governs how we build
  OvernightDesk itself.
- It is not a static document. Update it when the company learns
  something new about how it wants to operate. Stale rules are worse
  than no rules.
