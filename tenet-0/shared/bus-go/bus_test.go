package bus_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	bus "github.com/overnightdesk/tenet-0/shared/bus-go"
	"github.com/overnightdesk/tenet-0/shared/bus-go/testutil"
)

// Tests in this file require a live PostgreSQL. Set PG_TEST_ADMIN_URL to run.

func TestConnect_ValidCredential(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	b, err := bus.Connect(ctx, bus.Config{
		PostgresURL: tdb.URL,
		Department:  "ops",
		Credential:  cred,
	})
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer b.Close()
}

func TestConnect_InvalidCredential(t *testing.T) {
	tdb := testutil.New(t)
	tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := bus.Connect(ctx, bus.Config{
		PostgresURL: tdb.URL,
		Department:  "ops",
		Credential:  "wrong-credential-value",
	})
	if !errors.Is(err, bus.ErrUnauthenticated) {
		t.Fatalf("expected ErrUnauthenticated, got %v", err)
	}
}

func TestPublish_HappyPath(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	ctx := context.Background()
	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	id, err := b.Publish(ctx, "ops.job.completed", json.RawMessage(`{"job_id":"j1"}`))
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}
	if id == "" {
		t.Fatal("expected non-empty event ID")
	}
}

func TestPublish_NamespaceViolation(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	_, err := b.Publish(context.Background(), "fin.payment.outbound", json.RawMessage(`{}`))
	if !errors.Is(err, bus.ErrNamespaceViolation) {
		t.Fatalf("expected ErrNamespaceViolation, got %v", err)
	}
}

func TestPublish_ConstitutionRejected(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "fin", "fin")
	tdb.SeedConstitution(t, []testutil.RuleSpec{
		{ID: "fin-payout", Pattern: "fin.payment.outbound", ApprovalMode: "per_action"},
	})

	b := mustConnect(t, tdb.URL, "fin", cred)
	defer b.Close()

	_, err := b.Publish(context.Background(), "fin.payment.outbound", json.RawMessage(`{"amount":100}`))
	if !errors.Is(err, bus.ErrConstitutionRejected) {
		t.Fatalf("expected ErrConstitutionRejected, got %v", err)
	}
}

func TestPublish_WithParent(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	parent, err := b.Publish(ctx, "ops.job.started", json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("Publish parent: %v", err)
	}
	child, err := b.Publish(ctx, "ops.job.completed", json.RawMessage(`{}`), bus.WithParent(parent))
	if err != nil {
		t.Fatalf("Publish child: %v", err)
	}
	if parent == child {
		t.Fatal("parent and child should differ")
	}
}

func TestPublish_CausalityLoop(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	// Build a chain of 10 valid events (ops.chain.0 through ops.chain.9).
	// The SP rejects when the parent's ancestor count reaches 10, so the
	// 11th event (ops.chain.10) must fail.
	parent, err := b.Publish(ctx, "ops.chain.0", json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("initial: %v", err)
	}
	for i := 1; i <= 9; i++ {
		next, err := b.Publish(ctx, fmt.Sprintf("ops.chain.%d", i), json.RawMessage(`{}`), bus.WithParent(parent))
		if err != nil {
			t.Fatalf("chain %d: %v", i, err)
		}
		parent = next
	}
	_, err = b.Publish(ctx, "ops.chain.10", json.RawMessage(`{}`), bus.WithParent(parent))
	if !errors.Is(err, bus.ErrCausalityLoop) {
		t.Fatalf("expected ErrCausalityLoop on 11th level, got %v", err)
	}
}

func TestSubscribe_ReceivesNewEvents(t *testing.T) {
	tdb := testutil.New(t)
	opsCred := tdb.SeedDepartment(t, "ops", "ops")
	techCred := tdb.SeedDepartment(t, "tech", "tech")
	tdb.SeedConstitution(t, nil)

	publisher := mustConnect(t, tdb.URL, "ops", opsCred)
	defer publisher.Close()
	subscriber := mustConnect(t, tdb.URL, "tech", techCred)
	defer subscriber.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	received := make(chan bus.Event, 5)
	sub, err := subscriber.Subscribe(ctx, "tech.main", "ops.*", func(ctx context.Context, e bus.Event) error {
		received <- e
		return nil
	})
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	defer sub.Close()

	// Give the subscription a beat to register its LISTEN.
	time.Sleep(200 * time.Millisecond)

	id, err := publisher.Publish(ctx, "ops.job.completed", json.RawMessage(`{"job_id":"j1"}`))
	if err != nil {
		t.Fatalf("Publish: %v", err)
	}

	select {
	case e := <-received:
		if e.ID != id {
			t.Errorf("got event %s, want %s", e.ID, id)
		}
		if e.Type != "ops.job.completed" {
			t.Errorf("got type %s, want ops.job.completed", e.Type)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for event")
	}
}

func TestSubscribe_ReplaysMissedEvents(t *testing.T) {
	tdb := testutil.New(t)
	opsCred := tdb.SeedDepartment(t, "ops", "ops")
	techCred := tdb.SeedDepartment(t, "tech", "tech")
	tdb.SeedConstitution(t, nil)

	publisher := mustConnect(t, tdb.URL, "ops", opsCred)
	defer publisher.Close()
	subscriber := mustConnect(t, tdb.URL, "tech", techCred)
	defer subscriber.Close()

	ctx := context.Background()

	// Publish 3 events before subscribing.
	var priorIDs []string
	for i := 0; i < 3; i++ {
		id, err := publisher.Publish(ctx, fmt.Sprintf("ops.event.%d", i), json.RawMessage(`{}`))
		if err != nil {
			t.Fatalf("publish %d: %v", i, err)
		}
		priorIDs = append(priorIDs, id)
	}

	// Subscribe — should replay all three prior events.
	var mu sync.Mutex
	var got []string
	subCtx, subCancel := context.WithTimeout(ctx, 10*time.Second)
	defer subCancel()

	done := make(chan struct{})
	sub, err := subscriber.Subscribe(subCtx, "tech.main", "ops.*", func(_ context.Context, e bus.Event) error {
		mu.Lock()
		got = append(got, e.ID)
		if len(got) >= 3 {
			close(done)
		}
		mu.Unlock()
		return nil
	})
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	defer sub.Close()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		mu.Lock()
		t.Fatalf("expected 3 replayed events, got %d", len(got))
	}

	mu.Lock()
	defer mu.Unlock()
	if len(got) != 3 {
		t.Errorf("got %d events, want 3", len(got))
	}
}

// --- helpers ---

func mustConnect(t *testing.T, url, dept, cred string) *bus.Bus {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	b, err := bus.Connect(ctx, bus.Config{
		PostgresURL: url,
		Department:  dept,
		Credential:  cred,
	})
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	return b
}
