package bus_test

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/overnightdesk/tenet-0/shared/bus-go/testutil"
)

func TestConstitution_Load(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	ver := tdb.SeedConstitution(t, []testutil.RuleSpec{
		{ID: "fin-payout", Pattern: "fin.payment.outbound", ApprovalMode: "per_action"},
	})

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	c, err := b.Constitution().Load(context.Background())
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.VersionID != ver {
		t.Errorf("version = %d, want %d", c.VersionID, ver)
	}
	if c.ProseText == "" {
		t.Error("expected non-empty prose")
	}
	if len(c.Rules) != 1 {
		t.Fatalf("got %d rules, want 1", len(c.Rules))
	}
	if c.Rules[0].RuleID != "fin-payout" {
		t.Errorf("rule id = %q", c.Rules[0].RuleID)
	}
}

func TestConstitution_CurrentVersion(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	ver := tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	got, err := b.Constitution().CurrentVersion(context.Background())
	if err != nil {
		t.Fatalf("CurrentVersion: %v", err)
	}
	if got != ver {
		t.Errorf("version = %d, want %d", got, ver)
	}
}

func TestConstitution_Watch_FiresOnBump(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	var callbacks int64
	stop, err := b.Constitution().Watch(ctx, 200*time.Millisecond, func(newVersion int64) {
		atomic.AddInt64(&callbacks, 1)
	})
	if err != nil {
		t.Fatalf("Watch: %v", err)
	}
	defer stop()

	// Deactivate current and activate a new version (simulates bump-constitution).
	_, err = tdb.Pool.Exec(context.Background(),
		`UPDATE constitution_versions SET is_active = false;
		 INSERT INTO constitution_versions (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by, is_active)
		 VALUES ('v2-prose', 'v2-rules', 'updated prose', 'version: 2', 'test', true)`)
	if err != nil {
		t.Fatalf("bump: %v", err)
	}

	deadline := time.After(3 * time.Second)
	for {
		if atomic.LoadInt64(&callbacks) > 0 {
			return
		}
		select {
		case <-deadline:
			t.Fatalf("Watch did not fire within 3s (callbacks=%d)", atomic.LoadInt64(&callbacks))
		case <-time.After(100 * time.Millisecond):
		}
	}
}

func TestConstitution_Watch_NoFireWhenStable(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	var callbacks int64
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	stop, err := b.Constitution().Watch(ctx, 100*time.Millisecond, func(int64) {
		atomic.AddInt64(&callbacks, 1)
	})
	if err != nil {
		t.Fatalf("Watch: %v", err)
	}
	defer stop()

	<-ctx.Done()

	if n := atomic.LoadInt64(&callbacks); n != 0 {
		t.Errorf("got %d callbacks, want 0 when version stable", n)
	}
}

// Used by next tests
var _ = fmt.Sprintf
