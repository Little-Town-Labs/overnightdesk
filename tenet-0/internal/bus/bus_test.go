// Tests for the tenet0-bus-mcp Handler. These are the Phase 2 RED tests:
// the handler bodies in types.go all panic with "not implemented (Task 2.2)",
// so every test in this file is expected to FAIL on first run. Task 2.2
// implements the bodies and turns these green.
//
// Test seam: the Handler depends on the busClient interface (types.go).
// fakeBus (fakes_test.go) captures calls and returns canned data so tests
// run without Postgres. newTestHandler constructs a Handler with the fake.
package bus

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	busgo "github.com/overnightdesk/tenet-0/shared/bus-go"

	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// =============================================================================
// PublishEvent
// =============================================================================

func TestPublishEvent_HappyPath(t *testing.T) {
	fb := &fakeBus{
		PublishFn: func(ctx context.Context, et string, p json.RawMessage, opts ...busgo.PublishOption) (string, error) {
			return "11111111-1111-1111-1111-111111111111", nil
		},
	}
	h := newTestHandler(fb, "ops")

	got, err := h.PublishEvent(context.Background(), PublishEventRequest{
		EventType: "ops.thing.happened",
		Payload:   json.RawMessage(`{"k":"v"}`),
	})
	if err != nil {
		t.Fatalf("PublishEvent: %v", err)
	}
	if got.EventID != "11111111-1111-1111-1111-111111111111" {
		t.Errorf("event_id = %q, want canned uuid", got.EventID)
	}
	if got.PublishedAt.IsZero() {
		t.Error("published_at must be non-zero")
	}
}

func TestPublishEvent_MalformedEventType(t *testing.T) {
	h := newTestHandler(&fakeBus{}, "ops")

	_, err := h.PublishEvent(context.Background(), PublishEventRequest{
		EventType: "NOT-A-VALID-TYPE",
		Payload:   json.RawMessage(`{}`),
	})
	if !errors.Is(err, ErrBusPayloadInvalid) {
		t.Fatalf("err = %v, want ErrBusPayloadInvalid", err)
	}
	if code := toolErrorCode(err); code != "BUS_PAYLOAD_INVALID" {
		t.Errorf("code = %q, want BUS_PAYLOAD_INVALID", code)
	}
}

func TestPublishEvent_NamespaceViolation(t *testing.T) {
	// Caller is "ops" but tries to publish "fin.*". bus-go would return
	// ErrNamespaceViolation; handler should map that (and/or pre-validate
	// from h.department) to ErrBusNamespaceViolation.
	fb := &fakeBus{
		PublishFn: func(ctx context.Context, et string, p json.RawMessage, opts ...busgo.PublishOption) (string, error) {
			return "", busgo.ErrNamespaceViolation
		},
	}
	h := newTestHandler(fb, "ops")

	_, err := h.PublishEvent(context.Background(), PublishEventRequest{
		EventType: "fin.payment.outbound",
		Payload:   json.RawMessage(`{}`),
	})
	if !errors.Is(err, ErrBusNamespaceViolation) {
		t.Fatalf("err = %v, want ErrBusNamespaceViolation", err)
	}
	if code := toolErrorCode(err); code != "BUS_NAMESPACE_VIOLATION" {
		t.Errorf("code = %q, want BUS_NAMESPACE_VIOLATION", code)
	}
}

func TestPublishEvent_BusDown(t *testing.T) {
	fb := &fakeBus{
		PublishFn: func(ctx context.Context, et string, p json.RawMessage, opts ...busgo.PublishOption) (string, error) {
			return "", context.DeadlineExceeded
		},
	}
	h := newTestHandler(fb, "ops")

	_, err := h.PublishEvent(context.Background(), PublishEventRequest{
		EventType: "ops.thing.happened",
		Payload:   json.RawMessage(`{}`),
	})
	if !errors.Is(err, ErrBusDown) {
		t.Fatalf("err = %v, want ErrBusDown", err)
	}
	if code := toolErrorCode(err); code != "BUS_DOWN" {
		t.Errorf("code = %q, want BUS_DOWN", code)
	}
}

func TestPublishEvent_DuplicateIdempotency(t *testing.T) {
	fb := &fakeBus{
		PublishFn: func(ctx context.Context, et string, p json.RawMessage, opts ...busgo.PublishOption) (string, error) {
			// Stand-in for whatever bus-go surfaces for dedup conflict.
			return "", errors.New("idempotency_key reused with different payload")
		},
	}
	h := newTestHandler(fb, "ops")

	idem := "01HXYZABCDEFGHJKMNPQRSTVWX"
	_, err := h.PublishEvent(context.Background(), PublishEventRequest{
		EventType:      "ops.thing.happened",
		Payload:        json.RawMessage(`{"v":2}`),
		IdempotencyKey: &idem,
	})
	if !errors.Is(err, ErrBusDuplicateIdempotency) {
		t.Fatalf("err = %v, want ErrBusDuplicateIdempotency", err)
	}
	if code := toolErrorCode(err); code != "BUS_DUPLICATE_IDEMPOTENCY" {
		t.Errorf("code = %q, want BUS_DUPLICATE_IDEMPOTENCY", code)
	}
}

func TestPublishEvent_PropagatesParentEventID(t *testing.T) {
	fb := &fakeBus{}
	h := newTestHandler(fb, "ops")

	parent := "22222222-2222-2222-2222-222222222222"
	_, err := h.PublishEvent(context.Background(), PublishEventRequest{
		EventType:     "ops.thing.happened",
		Payload:       json.RawMessage(`{}`),
		ParentEventID: &parent,
	})
	if err != nil {
		t.Fatalf("PublishEvent: %v", err)
	}
	if len(fb.PublishCalls) != 1 {
		t.Fatalf("PublishCalls = %d, want 1", len(fb.PublishCalls))
	}
	if len(fb.PublishCalls[0].Opts) == 0 {
		t.Fatalf("expected at least one PublishOption (WithParent), got 0")
	}
}

// =============================================================================
// QueryEvents
// =============================================================================

func TestQueryEvents_HappyNoFilters(t *testing.T) {
	fb := &fakeBus{
		QueryFn: func(ctx context.Context, q QueryEventsRequest) ([]Event, string, error) {
			return []Event{
				{ID: "aaaa", Type: "ops.x.y", Source: "ops", Payload: json.RawMessage(`{}`), PublishedAt: time.Now()},
			}, "", nil
		},
	}
	h := newTestHandler(fb, "ops")

	resp, err := h.QueryEvents(context.Background(), QueryEventsRequest{})
	if err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}
	if len(resp.Events) != 1 {
		t.Errorf("events = %d, want 1", len(resp.Events))
	}
}

func TestQueryEvents_PatternFilterHonored(t *testing.T) {
	fb := &fakeBus{}
	h := newTestHandler(fb, "ops")

	_, err := h.QueryEvents(context.Background(), QueryEventsRequest{
		EventTypePattern: "president.*",
	})
	if err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}
	if len(fb.QueryCalls) != 1 || fb.QueryCalls[0].EventTypePattern != "president.*" {
		t.Errorf("pattern not propagated: %+v", fb.QueryCalls)
	}
}

func TestQueryEvents_SourceDepartmentFilter(t *testing.T) {
	fb := &fakeBus{}
	h := newTestHandler(fb, "ops")

	_, err := h.QueryEvents(context.Background(), QueryEventsRequest{
		SourceDepartment: "fin",
	})
	if err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}
	if len(fb.QueryCalls) != 1 || fb.QueryCalls[0].SourceDepartment != "fin" {
		t.Errorf("source_department not propagated: %+v", fb.QueryCalls)
	}
}

func TestQueryEvents_PaginationCursor(t *testing.T) {
	fb := &fakeBus{
		QueryFn: func(ctx context.Context, q QueryEventsRequest) ([]Event, string, error) {
			return []Event{{ID: "a"}}, "next-cursor-abc", nil
		},
	}
	h := newTestHandler(fb, "ops")

	cur := "prev-cursor"
	resp, err := h.QueryEvents(context.Background(), QueryEventsRequest{
		Limit:  10,
		Cursor: &cur,
	})
	if err != nil {
		t.Fatalf("QueryEvents: %v", err)
	}
	if resp.NextCursor == nil || *resp.NextCursor != "next-cursor-abc" {
		t.Errorf("next_cursor = %v, want next-cursor-abc", resp.NextCursor)
	}
}

func TestQueryEvents_InvalidTimeRange(t *testing.T) {
	h := newTestHandler(&fakeBus{}, "ops")

	end := time.Now()
	start := end.Add(time.Hour) // start > end
	_, err := h.QueryEvents(context.Background(), QueryEventsRequest{
		StartTime: &start,
		EndTime:   &end,
	})
	if !errors.Is(err, ErrBusQueryInvalid) {
		t.Fatalf("err = %v, want ErrBusQueryInvalid", err)
	}
	if code := toolErrorCode(err); code != "BUS_QUERY_INVALID" {
		t.Errorf("code = %q, want BUS_QUERY_INVALID", code)
	}
}

// =============================================================================
// GetEvent
// =============================================================================

func TestGetEvent_Happy(t *testing.T) {
	fb := &fakeBus{
		GetFn: func(ctx context.Context, eventID string) (Event, error) {
			return Event{ID: eventID, Type: "ops.x.y", Source: "ops", Payload: json.RawMessage(`{"a":1}`), PublishedAt: time.Now()}, nil
		},
	}
	h := newTestHandler(fb, "ops")

	resp, err := h.GetEvent(context.Background(), GetEventRequest{EventID: "33333333-3333-3333-3333-333333333333"})
	if err != nil {
		t.Fatalf("GetEvent: %v", err)
	}
	if resp.Event.ID != "33333333-3333-3333-3333-333333333333" {
		t.Errorf("ID = %q", resp.Event.ID)
	}
}

func TestGetEvent_NotFound(t *testing.T) {
	fb := &fakeBus{
		GetFn: func(ctx context.Context, eventID string) (Event, error) {
			return Event{}, ErrBusNotFound
		},
	}
	h := newTestHandler(fb, "ops")

	_, err := h.GetEvent(context.Background(), GetEventRequest{EventID: "ffffffff-ffff-ffff-ffff-ffffffffffff"})
	if !errors.Is(err, ErrBusNotFound) {
		t.Fatalf("err = %v, want ErrBusNotFound", err)
	}
	if code := toolErrorCode(err); code != "BUS_NOT_FOUND" {
		t.Errorf("code = %q, want BUS_NOT_FOUND", code)
	}
}

func TestGetEvent_Unauthorized(t *testing.T) {
	fb := &fakeBus{
		GetFn: func(ctx context.Context, eventID string) (Event, error) {
			return Event{}, ErrBusUnauthorized
		},
	}
	h := newTestHandler(fb, "ops")

	_, err := h.GetEvent(context.Background(), GetEventRequest{EventID: "44444444-4444-4444-4444-444444444444"})
	if !errors.Is(err, ErrBusUnauthorized) {
		t.Fatalf("err = %v, want ErrBusUnauthorized", err)
	}
	if code := toolErrorCode(err); code != "BUS_UNAUTHORIZED" {
		t.Errorf("code = %q, want BUS_UNAUTHORIZED", code)
	}
}

// =============================================================================
// WalkCausality
// =============================================================================

func TestWalkCausality_AncestorsHappy(t *testing.T) {
	fb := &fakeBus{
		WalkFn: func(ctx context.Context, req WalkCausalityRequest) ([]Event, string, error) {
			return []Event{{ID: "leaf"}, {ID: "parent"}, {ID: "root"}}, "reached_root", nil
		},
	}
	h := newTestHandler(fb, "ops")

	resp, err := h.WalkCausality(context.Background(), WalkCausalityRequest{
		EventID: "55555555-5555-5555-5555-555555555555",
	})
	if err != nil {
		t.Fatalf("WalkCausality: %v", err)
	}
	if resp.TerminatedReason != "reached_root" {
		t.Errorf("terminated_reason = %q", resp.TerminatedReason)
	}
	if len(resp.Chain) != 3 {
		t.Errorf("chain length = %d, want 3", len(resp.Chain))
	}
}

func TestWalkCausality_DescendantsDirection(t *testing.T) {
	fb := &fakeBus{
		WalkFn: func(ctx context.Context, req WalkCausalityRequest) ([]Event, string, error) {
			if req.Direction != "descendants" {
				t.Errorf("direction = %q, want descendants", req.Direction)
			}
			return []Event{{ID: "a"}, {ID: "b"}}, "reached_root", nil
		},
	}
	h := newTestHandler(fb, "ops")

	_, err := h.WalkCausality(context.Background(), WalkCausalityRequest{
		EventID:   "66666666-6666-6666-6666-666666666666",
		Direction: "descendants",
	})
	if err != nil {
		t.Fatalf("WalkCausality: %v", err)
	}
}

func TestWalkCausality_MaxDepthTermination(t *testing.T) {
	fb := &fakeBus{
		WalkFn: func(ctx context.Context, req WalkCausalityRequest) ([]Event, string, error) {
			return []Event{{ID: "1"}, {ID: "2"}}, "max_depth", nil
		},
	}
	h := newTestHandler(fb, "ops")

	resp, err := h.WalkCausality(context.Background(), WalkCausalityRequest{
		EventID:  "77777777-7777-7777-7777-777777777777",
		MaxDepth: 2,
	})
	if err != nil {
		t.Fatalf("WalkCausality: %v", err)
	}
	if resp.TerminatedReason != "max_depth" {
		t.Errorf("terminated_reason = %q, want max_depth", resp.TerminatedReason)
	}
}

func TestWalkCausality_CycleDetected(t *testing.T) {
	fb := &fakeBus{
		WalkFn: func(ctx context.Context, req WalkCausalityRequest) ([]Event, string, error) {
			return []Event{{ID: "1"}, {ID: "2"}, {ID: "1"}}, "cycle_detected", nil
		},
	}
	h := newTestHandler(fb, "ops")

	resp, err := h.WalkCausality(context.Background(), WalkCausalityRequest{
		EventID: "88888888-8888-8888-8888-888888888888",
	})
	if err != nil {
		t.Fatalf("WalkCausality: %v", err)
	}
	if resp.TerminatedReason != "cycle_detected" {
		t.Errorf("terminated_reason = %q, want cycle_detected", resp.TerminatedReason)
	}
}

func TestWalkCausality_NotFound(t *testing.T) {
	fb := &fakeBus{
		WalkFn: func(ctx context.Context, req WalkCausalityRequest) ([]Event, string, error) {
			return nil, "", ErrBusNotFound
		},
	}
	h := newTestHandler(fb, "ops")

	_, err := h.WalkCausality(context.Background(), WalkCausalityRequest{
		EventID: "99999999-9999-9999-9999-999999999999",
	})
	if !errors.Is(err, ErrBusNotFound) {
		t.Fatalf("err = %v, want ErrBusNotFound", err)
	}
	if code := toolErrorCode(err); code != "BUS_NOT_FOUND" {
		t.Errorf("code = %q, want BUS_NOT_FOUND", code)
	}
}

// =============================================================================
// ListUnprocessedEvents
// =============================================================================

func TestListUnprocessedEvents_Happy(t *testing.T) {
	hwm := "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
	fb := &fakeBus{
		ListFn: func(ctx context.Context, req ListUnprocessedEventsRequest) ([]Event, *string, error) {
			return []Event{{ID: "evt-1"}, {ID: "evt-2"}}, &hwm, nil
		},
	}
	h := newTestHandler(fb, "ops")

	resp, err := h.ListUnprocessedEvents(context.Background(), ListUnprocessedEventsRequest{})
	if err != nil {
		t.Fatalf("ListUnprocessedEvents: %v", err)
	}
	if len(resp.Events) != 2 {
		t.Errorf("events = %d, want 2", len(resp.Events))
	}
	if resp.HighWaterMark == nil || *resp.HighWaterMark != hwm {
		t.Errorf("high_water_mark = %v, want %s", resp.HighWaterMark, hwm)
	}
}

func TestListUnprocessedEvents_PaginationSinceID(t *testing.T) {
	fb := &fakeBus{}
	h := newTestHandler(fb, "ops")

	since := "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
	_, err := h.ListUnprocessedEvents(context.Background(), ListUnprocessedEventsRequest{
		Limit:        25,
		SinceEventID: &since,
	})
	if err != nil {
		t.Fatalf("ListUnprocessedEvents: %v", err)
	}
	if len(fb.ListCalls) != 1 {
		t.Fatalf("ListCalls = %d, want 1", len(fb.ListCalls))
	}
	if fb.ListCalls[0].SinceEventID == nil || *fb.ListCalls[0].SinceEventID != since {
		t.Errorf("since_event_id not propagated: %+v", fb.ListCalls[0])
	}
}

func TestListUnprocessedEvents_EmptyQueue(t *testing.T) {
	fb := &fakeBus{
		ListFn: func(ctx context.Context, req ListUnprocessedEventsRequest) ([]Event, *string, error) {
			return []Event{}, nil, nil
		},
	}
	h := newTestHandler(fb, "ops")

	resp, err := h.ListUnprocessedEvents(context.Background(), ListUnprocessedEventsRequest{})
	if err != nil {
		t.Fatalf("ListUnprocessedEvents: %v", err)
	}
	if len(resp.Events) != 0 {
		t.Errorf("events = %d, want 0", len(resp.Events))
	}
	if resp.HighWaterMark != nil {
		t.Errorf("high_water_mark = %v, want nil", resp.HighWaterMark)
	}
}

// =============================================================================
// RegisterTools
// =============================================================================

func TestRegisterTools_RegistersExactlyFive(t *testing.T) {
	srv := mcp.NewServer("tenet0-bus-mcp", "test", discardLogger())
	h := newTestHandler(&fakeBus{}, "ops")

	if err := h.RegisterTools(srv); err != nil {
		t.Fatalf("RegisterTools: %v", err)
	}
	// Re-registration of any tool name must fail (proves it was registered).
	for _, name := range ToolNames {
		err := srv.RegisterTool(mcp.Tool{
			Name:         name,
			InputSchema:  json.RawMessage(`{"type":"object"}`),
			OutputSchema: json.RawMessage(`{"type":"object"}`),
			Handler:      func(ctx context.Context, in json.RawMessage) (any, error) { return map[string]any{}, nil },
		})
		if err == nil {
			t.Errorf("re-registering %q should fail (was not registered)", name)
		}
	}
}

func TestRegisterTools_NamesMatchContract(t *testing.T) {
	want := map[string]bool{
		"publish_event":           true,
		"query_events":            true,
		"get_event":               true,
		"walk_causality":          true,
		"list_unprocessed_events": true,
	}
	if len(ToolNames) != len(want) {
		t.Fatalf("ToolNames has %d entries, want %d", len(ToolNames), len(want))
	}
	for _, n := range ToolNames {
		if !want[n] {
			t.Errorf("unexpected tool name %q", n)
		}
		delete(want, n)
	}
	if len(want) != 0 {
		t.Errorf("missing tool names: %v", want)
	}
}

func TestRegisterTools_SchemasAreValidJSON(t *testing.T) {
	schemas := map[string][2]json.RawMessage{
		"publish_event":           {publishEventInputSchema, publishEventOutputSchema},
		"query_events":            {queryEventsInputSchema, queryEventsOutputSchema},
		"get_event":               {getEventInputSchema, getEventOutputSchema},
		"walk_causality":          {walkCausalityInputSchema, walkCausalityOutputSchema},
		"list_unprocessed_events": {listUnprocessedInputSchema, listUnprocessedOutputSchema},
	}
	for name, pair := range schemas {
		var any1, any2 any
		if err := json.Unmarshal(pair[0], &any1); err != nil {
			t.Errorf("%s inputSchema invalid JSON: %v", name, err)
		}
		if err := json.Unmarshal(pair[1], &any2); err != nil {
			t.Errorf("%s outputSchema invalid JSON: %v", name, err)
		}
	}
}

// =============================================================================
// toolErrorCode mapping (sentinel coverage). Cheap fast unit, no Handler.
// =============================================================================

func TestToolErrorCode_AllSentinels(t *testing.T) {
	cases := []struct {
		err  error
		code string
	}{
		{nil, ""},
		{ErrBusUnauthorized, "BUS_UNAUTHORIZED"},
		{ErrBusNamespaceViolation, "BUS_NAMESPACE_VIOLATION"},
		{ErrBusRuleViolation, "BUS_RULE_VIOLATION"},
		{ErrBusPayloadInvalid, "BUS_PAYLOAD_INVALID"},
		{ErrBusDown, "BUS_DOWN"},
		{ErrBusDuplicateIdempotency, "BUS_DUPLICATE_IDEMPOTENCY"},
		{ErrBusNotFound, "BUS_NOT_FOUND"},
		{ErrBusQueryInvalid, "BUS_QUERY_INVALID"},
		{errors.New("some unrelated error"), "INTERNAL"},
	}
	for _, tc := range cases {
		got := toolErrorCode(tc.err)
		if got != tc.code {
			t.Errorf("toolErrorCode(%v) = %q, want %q", tc.err, got, tc.code)
		}
	}
}

// =============================================================================
// New / Config validation (constructor stub will panic; this asserts shape).
// =============================================================================

func TestNew_RequiresLogger(t *testing.T) {
	// Defensive: New must reject nil Logger. Until Task 2.2 lands, this
	// panics with the stub message — the panic IS the RED signal.
	_, err := New(Config{
		Department:  "ops",
		Credential:  "creds",
		PostgresURL: "postgres://x",
	})
	if err == nil {
		t.Fatal("New with nil Logger should return an error")
	}
	if !strings.Contains(err.Error(), "logger") && !strings.Contains(err.Error(), "Logger") {
		t.Errorf("err = %v, want to mention logger", err)
	}
}
