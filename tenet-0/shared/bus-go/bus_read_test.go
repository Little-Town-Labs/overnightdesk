package bus_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	bus "github.com/overnightdesk/tenet-0/shared/bus-go"
	"github.com/overnightdesk/tenet-0/shared/bus-go/testutil"
)

// Tests in this file exercise the Read API added Task 2.2 (QueryEvents,
// GetEvent, WalkCausality, ListUnprocessedEvents). They require a live
// PostgreSQL; PG_TEST_ADMIN_URL must be set or the tests skip (same pattern
// as bus_test.go).

// ---------------------------------------------------------------------------
// QueryEvents
// ---------------------------------------------------------------------------

func TestQueryEvents_NoFiltersReturnsAll(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		if _, err := b.Publish(ctx, fmt.Sprintf("ops.job.%d", i), json.RawMessage(`{}`)); err != nil {
			t.Fatalf("seed publish: %v", err)
		}
	}

	res, err := b.QueryEvents(ctx, bus.QueryFilter{})
	if err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}
	if len(res.Events) != 3 {
		t.Errorf("events = %d, want 3", len(res.Events))
	}
	if res.NextCursor != "" {
		t.Errorf("NextCursor should be empty when result < limit")
	}
}

func TestQueryEvents_PatternFilter(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	_, _ = b.Publish(ctx, "ops.job.started", json.RawMessage(`{}`))
	_, _ = b.Publish(ctx, "ops.job.completed", json.RawMessage(`{}`))
	_, _ = b.Publish(ctx, "ops.task.done", json.RawMessage(`{}`))

	res, err := b.QueryEvents(ctx, bus.QueryFilter{EventTypePattern: "ops.job.*"})
	if err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}
	// Prefix "ops.job." matches both job.started and job.completed.
	if len(res.Events) != 2 {
		t.Errorf("events = %d, want 2", len(res.Events))
	}
}

func TestQueryEvents_SourceDepartmentFilter(t *testing.T) {
	tdb := testutil.New(t)
	opsCred := tdb.SeedDepartment(t, "ops", "ops")
	finCred := tdb.SeedDepartment(t, "fin", "fin")
	tdb.SeedConstitution(t, nil)

	ops := mustConnect(t, tdb.URL, "ops", opsCred)
	defer ops.Close()
	fin := mustConnect(t, tdb.URL, "fin", finCred)
	defer fin.Close()
	ctx := context.Background()

	_, _ = ops.Publish(ctx, "ops.a.b", json.RawMessage(`{}`))
	_, _ = fin.Publish(ctx, "fin.a.b", json.RawMessage(`{}`))

	res, err := ops.QueryEvents(ctx, bus.QueryFilter{SourceDepartment: "fin"})
	if err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}
	if len(res.Events) != 1 || res.Events[0].Source != "fin" {
		t.Errorf("want 1 fin event, got %+v", res.Events)
	}
}

func TestQueryEvents_TimeRange(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	before := time.Now()
	_, _ = b.Publish(ctx, "ops.a.b", json.RawMessage(`{}`))
	after := time.Now().Add(time.Second)

	res, err := b.QueryEvents(ctx, bus.QueryFilter{StartTime: &before, EndTime: &after})
	if err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}
	if len(res.Events) != 1 {
		t.Errorf("events = %d, want 1", len(res.Events))
	}
}

func TestQueryEvents_InvalidTimeRange(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	end := time.Now()
	start := end.Add(time.Hour)
	_, err := b.QueryEvents(context.Background(), bus.QueryFilter{StartTime: &start, EndTime: &end})
	if !errors.Is(err, bus.ErrQueryInvalid) {
		t.Fatalf("err = %v, want ErrQueryInvalid", err)
	}
}

func TestQueryEvents_Pagination(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		if _, err := b.Publish(ctx, fmt.Sprintf("ops.a.n%d", i), json.RawMessage(`{}`)); err != nil {
			t.Fatalf("publish: %v", err)
		}
	}

	page1, err := b.QueryEvents(ctx, bus.QueryFilter{Limit: 2})
	if err != nil {
		t.Fatalf("QueryEvents page1: %v", err)
	}
	if len(page1.Events) != 2 || page1.NextCursor == "" {
		t.Fatalf("page1 = %+v", page1)
	}

	page2, err := b.QueryEvents(ctx, bus.QueryFilter{Limit: 2, Cursor: page1.NextCursor})
	if err != nil {
		t.Fatalf("QueryEvents page2: %v", err)
	}
	if len(page2.Events) != 2 {
		t.Errorf("page2 events = %d, want 2", len(page2.Events))
	}
	// IDs should not overlap.
	seen := map[string]bool{}
	for _, e := range append(page1.Events, page2.Events...) {
		if seen[e.ID] {
			t.Errorf("duplicate event across pages: %s", e.ID)
		}
		seen[e.ID] = true
	}
}

// ---------------------------------------------------------------------------
// GetEvent
// ---------------------------------------------------------------------------

func TestGetEvent_Happy(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	id, err := b.Publish(ctx, "ops.a.b", json.RawMessage(`{"x":1}`))
	if err != nil {
		t.Fatalf("publish: %v", err)
	}

	got, err := b.GetEvent(ctx, id)
	if err != nil {
		t.Fatalf("GetEvent: %v", err)
	}
	if got.ID != id || got.Type != "ops.a.b" {
		t.Errorf("got %+v", got)
	}
}

func TestGetEvent_NotFound(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	_, err := b.GetEvent(context.Background(), "00000000-0000-0000-0000-000000000000")
	if !errors.Is(err, bus.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

// ---------------------------------------------------------------------------
// WalkCausality
// ---------------------------------------------------------------------------

func TestWalkCausality_Ancestors(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	root, _ := b.Publish(ctx, "ops.a.0", json.RawMessage(`{}`))
	mid, _ := b.Publish(ctx, "ops.a.1", json.RawMessage(`{}`), bus.WithParent(root))
	leaf, _ := b.Publish(ctx, "ops.a.2", json.RawMessage(`{}`), bus.WithParent(mid))

	res, err := b.WalkCausality(ctx, leaf, bus.WalkOptions{Direction: bus.WalkAncestors})
	if err != nil {
		t.Fatalf("WalkCausality: %v", err)
	}
	if res.TerminatedReason != bus.WalkReachedRoot {
		t.Errorf("terminated = %v, want reached_root", res.TerminatedReason)
	}
	if len(res.Chain) != 3 {
		t.Errorf("chain len = %d, want 3", len(res.Chain))
	}
	if res.Chain[0].ID != leaf || res.Chain[2].ID != root {
		t.Errorf("chain order unexpected: %+v", res.Chain)
	}
}

func TestWalkCausality_MaxDepth(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	cur, _ := b.Publish(ctx, "ops.a.0", json.RawMessage(`{}`))
	for i := 1; i <= 4; i++ {
		next, err := b.Publish(ctx, fmt.Sprintf("ops.a.%d", i), json.RawMessage(`{}`), bus.WithParent(cur))
		if err != nil {
			t.Fatalf("chain %d: %v", i, err)
		}
		cur = next
	}

	res, err := b.WalkCausality(ctx, cur, bus.WalkOptions{MaxDepth: 2, Direction: bus.WalkAncestors})
	if err != nil {
		t.Fatalf("WalkCausality: %v", err)
	}
	if res.TerminatedReason != bus.WalkMaxDepth {
		t.Errorf("terminated = %v, want max_depth", res.TerminatedReason)
	}
}

func TestWalkCausality_Descendants(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	root, _ := b.Publish(ctx, "ops.tree.root", json.RawMessage(`{}`))
	_, _ = b.Publish(ctx, "ops.tree.left", json.RawMessage(`{}`), bus.WithParent(root))
	_, _ = b.Publish(ctx, "ops.tree.right", json.RawMessage(`{}`), bus.WithParent(root))

	res, err := b.WalkCausality(ctx, root, bus.WalkOptions{Direction: bus.WalkDescendants})
	if err != nil {
		t.Fatalf("WalkCausality: %v", err)
	}
	if len(res.Chain) != 3 { // root + 2 children
		t.Errorf("chain = %d, want 3", len(res.Chain))
	}
}

func TestWalkCausality_NotFound(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	_, err := b.WalkCausality(context.Background(),
		"ffffffff-ffff-ffff-ffff-ffffffffffff", bus.WalkOptions{})
	if !errors.Is(err, bus.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

// ---------------------------------------------------------------------------
// ListUnprocessedEvents
// ---------------------------------------------------------------------------

func TestListUnprocessedEvents_ColdStart(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		_, _ = b.Publish(ctx, fmt.Sprintf("ops.x.n%d", i), json.RawMessage(`{}`))
	}

	res, err := b.ListUnprocessedEvents(ctx, bus.ListUnprocessedRequest{})
	if err != nil {
		t.Fatalf("ListUnprocessedEvents: %v", err)
	}
	if len(res.Events) != 3 || res.HighWaterMark == "" {
		t.Errorf("res = %+v", res)
	}
}

func TestListUnprocessedEvents_WithCursor(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()
	ctx := context.Background()

	var ids []string
	for i := 0; i < 4; i++ {
		id, _ := b.Publish(ctx, fmt.Sprintf("ops.y.n%d", i), json.RawMessage(`{}`))
		ids = append(ids, id)
	}

	// Poll starting after the second event.
	res, err := b.ListUnprocessedEvents(ctx, bus.ListUnprocessedRequest{SinceEventID: ids[1]})
	if err != nil {
		t.Fatalf("ListUnprocessedEvents: %v", err)
	}
	if len(res.Events) != 2 {
		t.Errorf("events = %d, want 2", len(res.Events))
	}
}

func TestListUnprocessedEvents_Empty(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	res, err := b.ListUnprocessedEvents(context.Background(), bus.ListUnprocessedRequest{})
	if err != nil {
		t.Fatalf("ListUnprocessedEvents: %v", err)
	}
	if len(res.Events) != 0 || res.HighWaterMark != "" {
		t.Errorf("res = %+v, want empty", res)
	}
}
