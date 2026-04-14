package bus_test

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	bus "github.com/overnightdesk/tenet-0/shared/bus-go"
	"github.com/overnightdesk/tenet-0/shared/bus-go/testutil"
)

func TestMetrics_Snapshot_Empty(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	snap, err := b.Metrics().Snapshot(context.Background())
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if snap.GeneratedAt.IsZero() {
		t.Error("expected GeneratedAt set")
	}
	// Empty database — fields are present but zero.
	if snap.AuditLogWriteRatePerMinute < 0 {
		t.Errorf("write rate negative: %d", snap.AuditLogWriteRatePerMinute)
	}
}

func TestMetrics_Snapshot_AfterPublishes(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)
	tdb.SeedBudget(t, "ops", 1000)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	for i := 0; i < 3; i++ {
		if _, err := b.Publish(context.Background(), "ops.x", nil); err != nil {
			t.Fatalf("publish %d: %v", i, err)
		}
	}

	snap, err := b.Metrics().Snapshot(context.Background())
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}

	// EventsPerMinute should report ops with at least 3.
	got := 0
	for _, e := range snap.EventsPerMinute {
		if e.Department == "ops" {
			got = e.EventsPerMinute
		}
	}
	if got < 3 {
		t.Errorf("ops events_per_minute = %d, want >= 3", got)
	}

	// BudgetUtilization should include ops for current month.
	foundBudget := false
	for _, b := range snap.BudgetUtilization {
		if b.Department == "ops" {
			foundBudget = true
			if b.LimitCents != 1000 {
				t.Errorf("limit = %d, want 1000", b.LimitCents)
			}
		}
	}
	if !foundBudget {
		t.Error("expected ops budget in snapshot")
	}
}

func TestMetrics_Stream_FiresOnInterval(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var ticks int64
	stop, err := b.Metrics().Stream(ctx, 200*time.Millisecond, func(_ bus.MetricsSnapshot) {
		atomic.AddInt64(&ticks, 1)
	})
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}
	defer stop()

	<-ctx.Done()

	if n := atomic.LoadInt64(&ticks); n < 3 {
		t.Errorf("got %d ticks in 2s @ 200ms, want >= 3", n)
	}
}
