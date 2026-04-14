package bus

import (
	"context"
	"fmt"
	"time"
)

// Metrics returns the metrics view of this Bus. Backed by Postgres views
// defined in migration 009.
func (b *Bus) Metrics() *Metrics {
	return &Metrics{bus: b}
}

// Metrics aggregates live operational counters for the President dashboard
// and SecOps. Read-only; safe to call from multiple goroutines.
type Metrics struct {
	bus *Bus
}

// MetricsSnapshot is one polling result.
type MetricsSnapshot struct {
	GeneratedAt                time.Time
	EventsPerMinute            []EventsPerMinuteRow
	RejectionRatePerHour       []RejectionRow
	SubscriptionLag            []SubscriptionLagRow
	BudgetUtilization          []BudgetUtilizationRow
	AuditLogWriteRatePerMinute int
}

type EventsPerMinuteRow struct {
	Department      string
	EventsPerMinute int
}

type RejectionRow struct {
	Actor      string
	Action     string
	Rejections int
}

type SubscriptionLagRow struct {
	Department      string
	SubscriptionKey string
	LagEvents       int
}

type BudgetUtilizationRow struct {
	Department   string
	BudgetMonth  time.Time
	SpentCents   int
	LimitCents   int
	PctUtilized  float64
	Status       string
}

// Snapshot reads all metric views and returns a single combined snapshot.
// GeneratedAt is stamped after all queries complete, so it reflects when
// the snapshot is consistent — useful when one view is briefly slow.
func (m *Metrics) Snapshot(ctx context.Context) (MetricsSnapshot, error) {
	var snap MetricsSnapshot

	if err := m.scanEventsPerMinute(ctx, &snap); err != nil {
		return snap, err
	}
	if err := m.scanRejections(ctx, &snap); err != nil {
		return snap, err
	}
	if err := m.scanSubscriptionLag(ctx, &snap); err != nil {
		return snap, err
	}
	if err := m.scanBudgetUtilization(ctx, &snap); err != nil {
		return snap, err
	}
	if err := m.bus.pool.QueryRow(ctx,
		`SELECT writes_per_minute FROM v_audit_log_write_rate`,
	).Scan(&snap.AuditLogWriteRatePerMinute); err != nil {
		return snap, fmt.Errorf("metrics: write rate: %w", err)
	}

	snap.GeneratedAt = time.Now().UTC()
	return snap, nil
}

// Stream invokes onSnapshot at the given interval until the context is done
// or stop is called.
//
// onSnapshot runs synchronously inside the polling goroutine; a slow
// callback blocks the next tick (Go's ticker coalesces missed ticks).
// Offload to a goroutine if needed.
func (m *Metrics) Stream(ctx context.Context, interval time.Duration, onSnapshot func(MetricsSnapshot)) (stop func(), err error) {
	if interval <= 0 {
		return nil, fmt.Errorf("metrics: stream interval must be positive")
	}

	streamCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})

	go func() {
		defer close(done)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-streamCtx.Done():
				return
			case <-ticker.C:
				snap, err := m.Snapshot(streamCtx)
				if err != nil {
					if streamCtx.Err() != nil {
						return
					}
					m.bus.logger.Warn("metrics: stream snapshot failed", "error", err)
					continue
				}
				onSnapshot(snap)
			}
		}
	}()

	return func() { cancel(); <-done }, nil
}

func (m *Metrics) scanEventsPerMinute(ctx context.Context, snap *MetricsSnapshot) error {
	rows, err := m.bus.pool.Query(ctx,
		`SELECT source_department_id, events_per_minute FROM v_events_per_minute`)
	if err != nil {
		return fmt.Errorf("metrics: events_per_minute: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var r EventsPerMinuteRow
		if err := rows.Scan(&r.Department, &r.EventsPerMinute); err != nil {
			return err
		}
		snap.EventsPerMinute = append(snap.EventsPerMinute, r)
	}
	return rows.Err()
}

func (m *Metrics) scanRejections(ctx context.Context, snap *MetricsSnapshot) error {
	rows, err := m.bus.pool.Query(ctx,
		`SELECT actor_id, action, rejections FROM v_rejection_rate_per_hour`)
	if err != nil {
		return fmt.Errorf("metrics: rejections: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var r RejectionRow
		if err := rows.Scan(&r.Actor, &r.Action, &r.Rejections); err != nil {
			return err
		}
		snap.RejectionRatePerHour = append(snap.RejectionRatePerHour, r)
	}
	return rows.Err()
}

func (m *Metrics) scanSubscriptionLag(ctx context.Context, snap *MetricsSnapshot) error {
	rows, err := m.bus.pool.Query(ctx,
		`SELECT department_id, subscription_key, lag_events FROM v_subscription_lag`)
	if err != nil {
		return fmt.Errorf("metrics: subscription_lag: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var r SubscriptionLagRow
		if err := rows.Scan(&r.Department, &r.SubscriptionKey, &r.LagEvents); err != nil {
			return err
		}
		snap.SubscriptionLag = append(snap.SubscriptionLag, r)
	}
	return rows.Err()
}

func (m *Metrics) scanBudgetUtilization(ctx context.Context, snap *MetricsSnapshot) error {
	rows, err := m.bus.pool.Query(ctx,
		`SELECT department_id, budget_month, spent_cents, limit_cents, pct_utilized, status
		   FROM v_budget_utilization`)
	if err != nil {
		return fmt.Errorf("metrics: budget_utilization: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var r BudgetUtilizationRow
		if err := rows.Scan(&r.Department, &r.BudgetMonth, &r.SpentCents, &r.LimitCents, &r.PctUtilized, &r.Status); err != nil {
			return err
		}
		snap.BudgetUtilization = append(snap.BudgetUtilization, r)
	}
	return rows.Err()
}
