import type { Bus } from "./bus.js";

export interface EventsPerMinuteRow {
  department: string;
  eventsPerMinute: number;
}

export interface RejectionRow {
  actor: string;
  action: string;
  rejections: number;
}

export interface SubscriptionLagRow {
  department: string;
  subscriptionKey: string;
  lagEvents: number;
}

export interface BudgetUtilizationRow {
  department: string;
  budgetMonth: Date;
  spentCents: number;
  limitCents: number;
  pctUtilized: number;
  status: string;
}

export interface MetricsSnapshot {
  generatedAt: Date;
  eventsPerMinute: EventsPerMinuteRow[];
  rejectionRatePerHour: RejectionRow[];
  subscriptionLag: SubscriptionLagRow[];
  budgetUtilization: BudgetUtilizationRow[];
  auditLogWriteRatePerMinute: number;
}

// Metrics aggregates live operational counters for the President dashboard
// and SecOps. Read-only; safe to call from multiple callers.
export class Metrics {
  private readonly bus: Bus;

  constructor(bus: Bus) {
    this.bus = bus;
  }

  // snapshot reads all five views and returns a combined snapshot. The
  // generatedAt timestamp is stamped after all queries complete, so it
  // reflects when the snapshot is consistent.
  async snapshot(): Promise<MetricsSnapshot> {
    const [epm, rej, lag, budget, writeRate] = await Promise.all([
      this.bus.pool.query(
        `SELECT source_department_id, events_per_minute FROM v_events_per_minute`,
      ),
      this.bus.pool.query(
        `SELECT actor_id, action, rejections FROM v_rejection_rate_per_hour`,
      ),
      this.bus.pool.query(
        `SELECT department_id, subscription_key, lag_events FROM v_subscription_lag`,
      ),
      this.bus.pool.query(
        `SELECT department_id, budget_month, spent_cents, limit_cents, pct_utilized, status
           FROM v_budget_utilization`,
      ),
      this.bus.pool.query(
        `SELECT writes_per_minute FROM v_audit_log_write_rate`,
      ),
    ]);

    return {
      eventsPerMinute: epm.rows.map((r) => ({
        department: String(r.source_department_id),
        eventsPerMinute: Number(r.events_per_minute),
      })),
      rejectionRatePerHour: rej.rows.map((r) => ({
        actor: String(r.actor_id),
        action: String(r.action),
        rejections: Number(r.rejections),
      })),
      subscriptionLag: lag.rows.map((r) => ({
        department: String(r.department_id),
        subscriptionKey: String(r.subscription_key),
        lagEvents: Number(r.lag_events),
      })),
      budgetUtilization: budget.rows.map((r) => ({
        department: String(r.department_id),
        budgetMonth: r.budget_month as Date,
        spentCents: Number(r.spent_cents),
        limitCents: Number(r.limit_cents),
        pctUtilized: Number(r.pct_utilized),
        status: String(r.status),
      })),
      auditLogWriteRatePerMinute: Number(
        writeRate.rows[0]?.writes_per_minute ?? 0,
      ),
      generatedAt: new Date(),
    };
  }

  // stream invokes onSnapshot at the given interval. Returns a stop() function.
  // Slow callbacks delay the next tick (skipped if prior is still running).
  async stream(
    intervalMs: number,
    onSnapshot: (s: MetricsSnapshot) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    if (intervalMs <= 0) {
      throw new Error("metrics: stream interval must be positive");
    }
    let stopped = false;
    let pending: Promise<void> | null = null;

    const tick = async (): Promise<void> => {
      if (stopped) return;
      try {
        const snap = await this.snapshot();
        await onSnapshot(snap);
      } catch (err) {
        if (!stopped) console.warn("metrics: stream snapshot failed:", err);
      }
    };

    const timer = setInterval(() => {
      if (pending) return;
      pending = tick().finally(() => {
        pending = null;
      });
    }, intervalMs);

    return async () => {
      stopped = true;
      clearInterval(timer);
      if (pending) await pending;
    };
  }
}
