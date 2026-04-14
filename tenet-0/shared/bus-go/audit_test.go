package bus_test

import (
	"context"
	"testing"
	"time"

	bus "github.com/overnightdesk/tenet-0/shared/bus-go"
	"github.com/overnightdesk/tenet-0/shared/bus-go/testutil"
)

func TestAudit_Query_FiltersByActor(t *testing.T) {
	tdb := testutil.New(t)
	opsCred := tdb.SeedDepartment(t, "ops", "ops")
	finCred := tdb.SeedDepartment(t, "fin", "fin")
	tdb.SeedConstitution(t, nil)

	// Publishes generate audit entries (event.published).
	opsBus := mustConnect(t, tdb.URL, "ops", opsCred)
	finBus := mustConnect(t, tdb.URL, "fin", finCred)
	defer opsBus.Close()
	defer finBus.Close()

	_, _ = opsBus.Publish(context.Background(), "ops.a", nil)
	_, _ = opsBus.Publish(context.Background(), "ops.b", nil)
	_, _ = finBus.Publish(context.Background(), "fin.a", nil)

	// SecOps queries by actor.
	secops := tdb.SeedDepartment(t, "secops", "secops")
	secBus := mustConnectSecOps(t, tdb.URL, "secops", secops)
	defer secBus.Close()

	entries, err := secBus.Audit().Query(context.Background(), bus.AuditFilter{Actor: "ops"})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	for _, e := range entries {
		if e.Actor != "ops" {
			t.Errorf("got actor %q, want ops", e.Actor)
		}
	}
	if len(entries) < 2 {
		t.Errorf("expected at least 2 ops entries, got %d", len(entries))
	}
}

func TestAudit_Query_FiltersByAction(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)
	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	// Trigger a namespace rejection (audit: event.rejected.namespace).
	_, _ = b.Publish(context.Background(), "fin.x", nil)

	secopsCred := tdb.SeedDepartment(t, "secops", "secops")
	secBus := mustConnectSecOps(t, tdb.URL, "secops", secopsCred)
	defer secBus.Close()

	entries, err := secBus.Audit().Query(context.Background(), bus.AuditFilter{
		Action: "event.rejected.namespace",
	})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("expected at least one rejection entry")
	}
}

func TestAudit_Query_TimeWindow(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)
	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	_, _ = b.Publish(context.Background(), "ops.old", nil)
	cutoff := time.Now()
	time.Sleep(50 * time.Millisecond)
	_, _ = b.Publish(context.Background(), "ops.new", nil)

	secopsCred := tdb.SeedDepartment(t, "secops", "secops")
	secBus := mustConnectSecOps(t, tdb.URL, "secops", secopsCred)
	defer secBus.Close()

	entries, err := secBus.Audit().Query(context.Background(), bus.AuditFilter{
		Actor:    "ops",
		FromTime: cutoff,
	})
	if err != nil {
		t.Fatalf("Query: %v", err)
	}
	// Only the "new" publish plus any rejections should remain.
	for _, e := range entries {
		if e.RecordedAt.Before(cutoff) {
			t.Errorf("entry older than cutoff: %s", e.RecordedAt)
		}
	}
}

func TestAudit_Stream_DeliversNewEntries(t *testing.T) {
	tdb := testutil.New(t)
	secopsCred := tdb.SeedDepartment(t, "secops", "secops")
	opsCred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	secBus := mustConnectSecOps(t, tdb.URL, "secops", secopsCred)
	defer secBus.Close()
	opsBus := mustConnect(t, tdb.URL, "ops", opsCred)
	defer opsBus.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	seen := make(chan bus.AuditEntry, 10)
	stop, err := secBus.Audit().Stream(ctx, 100*time.Millisecond, bus.AuditFilter{Actor: "ops"},
		func(e bus.AuditEntry) { seen <- e })
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}
	defer stop()

	_, _ = opsBus.Publish(context.Background(), "ops.streamed", nil)

	select {
	case e := <-seen:
		if e.Actor != "ops" {
			t.Errorf("got actor %q", e.Actor)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("did not receive streamed entry")
	}
}

// mustConnectSecOps: connects using the tenet0_secops role explicitly.
// (The library itself doesn't enforce role separation in Go — the caller
// must point PostgresURL at a role with the appropriate grants. For tests
// we use the admin URL for simplicity; audit permissions are validated at
// the SQL level by GRANT SELECT in migration 006.)
func mustConnectSecOps(t *testing.T, url, dept, cred string) *bus.Bus {
	return mustConnect(t, url, dept, cred)
}
