# Feature 21: Cost Governance

**Status:** Draft
**Priority:** P1
**Complexity:** Medium
**Repos:** `overnightdesk-engine`

---

## Overview

Enforce spending limits and provide cost visibility. After each execution run, calculate the cost from token usage, update the agent's monthly spend, and enforce budget policies. When an agent exceeds its budget, pause it automatically. Provide cost aggregation APIs for the dashboard.

The building blocks exist: agents have `budget_monthly_cents`/`spent_monthly_cents`, runs track `input_tokens`/`output_tokens`/`cost_cents`. This feature connects them — cost calculation after execution, spend accumulation, budget enforcement, and analytics queries.

### Business Value

- Customers control how much each agent can spend per month
- Automatic pause prevents runaway costs
- Cost breakdowns by agent and project enable informed decisions
- Warning thresholds give early alerts before limits are hit

---

## User Stories

### User Story 1: Cost Calculated Per Run

**As a** system tracking expenses
**I want** each run's cost calculated from token usage
**So that** spending is tracked accurately

**Acceptance Criteria:**
- [ ] After each run, cost_cents is calculated from input_tokens and output_tokens
- [ ] Cost uses a configurable rate (default: $3/MTok input, $15/MTok output for Claude Sonnet)
- [ ] Cost is stored on the run record
- [ ] If token counts are 0 (unknown), cost is 0

**Priority:** High

### User Story 2: Agent Spend Accumulation

**As a** system enforcing budgets
**I want** each agent's monthly spend updated after every run
**So that** budget enforcement has accurate data

**Acceptance Criteria:**
- [ ] After each run, the agent's `spent_monthly_cents` is incremented by the run's cost
- [ ] Spend is cumulative across all runs in the current month
- [ ] Monthly reset (Feature 17) zeroes the counter at month boundary

**Priority:** High

### User Story 3: Budget Enforcement

**As a** customer who set a monthly budget
**I want** my agent paused when it exceeds its budget
**So that** I don't get surprised by large bills

**Acceptance Criteria:**
- [ ] After each run, if `spent_monthly_cents >= budget_monthly_cents` (and budget > 0), the agent is paused with reason "budget"
- [ ] A budget incident record is created when budget is breached
- [ ] A budget incident record is created when spend crosses 80% threshold
- [ ] Budget of 0 means unlimited — no enforcement
- [ ] Paused agents do not accept new work

**Priority:** High

### User Story 4: Cost Aggregation API

**As a** customer viewing costs
**I want** to query cost breakdowns by agent and project
**So that** I can see where money is going

**Acceptance Criteria:**
- [ ] API returns total cost for a date range
- [ ] API returns cost broken down by agent
- [ ] API returns cost broken down by project
- [ ] Costs are derived from the runs table (source of truth)

**Priority:** Medium

### User Story 5: Budget Policies

**As a** customer configuring spending rules
**I want** to set budget policies with warning thresholds
**So that** I get notified before limits are hit

**Acceptance Criteria:**
- [ ] Budget policies can be created per agent or instance-wide
- [ ] Each policy has a monthly limit and a warning threshold percentage (default 80%)
- [ ] Policies can specify action: warn or pause
- [ ] Budget incidents reference the triggering policy

**Priority:** Medium

---

## Functional Requirements

### FR-1: Cost Calculation
After each run completes:
- Calculate cost: `cost_cents = (input_tokens * input_rate + output_tokens * output_rate) / 1_000_000 * 100`
- Default rates: input $3/MTok, output $15/MTok (Claude Sonnet pricing)
- Store on the run record via `UpdateRunCost(runID, costCents)`
- Rates configurable via engine config (not per-agent for simplicity)

### FR-2: Spend Accumulation
After cost is calculated:
- Increment agent's `spent_monthly_cents` atomically
- New query: `IncrementAgentSpend(agentID, cents)`

### FR-3: Budget Enforcement
After spend is updated:
- Check if `spent_monthly_cents >= budget_monthly_cents` (and budget > 0)
- If exceeded: pause agent with reason "budget", create breach incident
- Check if spend crossed 80% of budget (warn threshold)
- If crossed: create warning incident (agent keeps running)

### FR-4: Budget Policies Table
Store policies with:
- Unique identifier
- Agent reference (nullable — null means instance-wide default)
- Monthly limit in cents
- Warning threshold percentage (default 80)
- Action: warn, pause
- Creation and update timestamps

### FR-5: Budget Incidents Table
Store incidents with:
- Unique identifier
- Policy reference (nullable — null for direct agent budget enforcement)
- Agent reference
- Type: warning, breach
- Spent cents at time of incident
- Limit cents at time of incident
- Creation timestamp

### FR-6: Cost Aggregation Queries
- `GetCostSummary(startDate, endDate)` — total cost across all runs
- `GetCostByAgent(startDate, endDate)` — cost grouped by agent
- `GetCostByProject(startDate, endDate)` — cost grouped by project
- Date range filters on `runs.created_at`

### FR-7: Cost API Endpoints
- `GET /api/costs?start=&end=` — summary with agent and project breakdowns
- `GET /api/costs/agents` — per-agent cost detail
- `GET /api/costs/projects` — per-project cost detail
- `GET /api/budget-policies` — list policies
- `POST /api/budget-policies` — create policy
- `DELETE /api/budget-policies/:id` — delete policy
- `GET /api/budget-incidents` — list incidents

---

## Non-Functional Requirements

- Cost calculation adds < 5ms to execution path
- Cost aggregation queries return in < 200ms for up to 10,000 runs
- Budget enforcement is atomic (no race between spend check and pause)

---

## Edge Cases

### EC-1: Zero Budget
Budget of 0 = unlimited. No enforcement, no incidents.

### EC-2: Cost Exceeds Budget in Single Run
Agent at $0 spent, budget $5, single run costs $8. Agent paused after run — the run completes first, then enforcement kicks in.

### EC-3: No Token Data
If tokens are 0, cost is 0. No spend increment, no enforcement triggered.

---

## Out of Scope
- Per-model pricing (all runs use same rate)
- Real-time cost streaming
- Dashboard UI for costs (Feature 26)
- Notification/alerting on budget events (could integrate with bridges later)
