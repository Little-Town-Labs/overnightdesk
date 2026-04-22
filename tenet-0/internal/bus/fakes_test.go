package bus

import (
	"context"
	"encoding/json"
	"sync"

	busgo "github.com/overnightdesk/tenet-0/shared/bus-go"
)

// publishCall captures one Publish invocation so tests can assert the
// arguments handed to bus-go (e.g. that parent_event_id propagates).
type publishCall struct {
	EventType string
	Payload   json.RawMessage
	Opts      []busgo.PublishOption
}

// fakeBus is a busClient implementation for tests. Each tool's behaviour
// is controllable via a function field; nil falls back to a sensible
// happy-path default. Captured calls are read off the slices for assertions.
type fakeBus struct {
	mu sync.Mutex

	PublishCalls         []publishCall
	QueryCalls           []QueryEventsRequest
	GetCalls             []string
	WalkCalls            []WalkCausalityRequest
	ListCalls            []ListUnprocessedEventsRequest

	PublishFn func(ctx context.Context, eventType string, payload json.RawMessage, opts ...busgo.PublishOption) (string, error)
	QueryFn   func(ctx context.Context, q QueryEventsRequest) ([]Event, string, error)
	GetFn     func(ctx context.Context, eventID string) (Event, error)
	WalkFn    func(ctx context.Context, req WalkCausalityRequest) ([]Event, string, error)
	ListFn    func(ctx context.Context, req ListUnprocessedEventsRequest) ([]Event, *string, error)

	closed bool
}

func (f *fakeBus) Publish(ctx context.Context, eventType string, payload json.RawMessage, opts ...busgo.PublishOption) (string, error) {
	f.mu.Lock()
	f.PublishCalls = append(f.PublishCalls, publishCall{EventType: eventType, Payload: payload, Opts: opts})
	fn := f.PublishFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, eventType, payload, opts...)
	}
	return "00000000-0000-0000-0000-000000000001", nil
}

func (f *fakeBus) QueryEvents(ctx context.Context, q QueryEventsRequest) ([]Event, string, error) {
	f.mu.Lock()
	f.QueryCalls = append(f.QueryCalls, q)
	fn := f.QueryFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, q)
	}
	return []Event{}, "", nil
}

func (f *fakeBus) GetEvent(ctx context.Context, eventID string) (Event, error) {
	f.mu.Lock()
	f.GetCalls = append(f.GetCalls, eventID)
	fn := f.GetFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, eventID)
	}
	return Event{ID: eventID, Type: "ops.thing.happened", Source: "ops", Payload: json.RawMessage(`{}`)}, nil
}

func (f *fakeBus) WalkCausality(ctx context.Context, req WalkCausalityRequest) ([]Event, string, error) {
	f.mu.Lock()
	f.WalkCalls = append(f.WalkCalls, req)
	fn := f.WalkFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return []Event{}, "reached_root", nil
}

func (f *fakeBus) ListUnprocessedEvents(ctx context.Context, req ListUnprocessedEventsRequest) ([]Event, *string, error) {
	f.mu.Lock()
	f.ListCalls = append(f.ListCalls, req)
	fn := f.ListFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return []Event{}, nil, nil
}

func (f *fakeBus) Close() {
	f.mu.Lock()
	f.closed = true
	f.mu.Unlock()
}

// newTestHandler constructs a Handler wired to the supplied fakeBus,
// bypassing the real New() (which would try to connect to Postgres).
// Tests use this to drive handler methods directly.
func newTestHandler(fb *fakeBus, department string) *Handler {
	return &Handler{
		bus:        fb,
		department: department,
	}
}
