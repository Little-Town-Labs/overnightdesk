package pending

import (
	"context"
	"sync"
)

// fakeStore is a store implementation for tests. Each method is controllable
// via a function field; nil falls back to a canned happy-path value.
// Captured calls are read off the slices for assertions.
type fakeStore struct {
	mu sync.Mutex

	ListCalls   []ListPendingFilter
	ClaimCalls  []ClaimRequest
	RecordCalls []RecordDecisionRequest
	ExpireCalls []ExpireRequest

	ListFn   func(ctx context.Context, f ListPendingFilter) (ListPendingResult, error)
	ClaimFn  func(ctx context.Context, req ClaimRequest) (ClaimResult, error)
	RecordFn func(ctx context.Context, req RecordDecisionRequest) (RecordDecisionResult, error)
	ExpireFn func(ctx context.Context, req ExpireRequest) (ExpireResult, error)

	closed bool
}

func (f *fakeStore) ListPending(ctx context.Context, filter ListPendingFilter) (ListPendingResult, error) {
	f.mu.Lock()
	f.ListCalls = append(f.ListCalls, filter)
	fn := f.ListFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, filter)
	}
	return ListPendingResult{Items: []PendingItem{}}, nil
}

func (f *fakeStore) ClaimForDecision(ctx context.Context, req ClaimRequest) (ClaimResult, error) {
	f.mu.Lock()
	f.ClaimCalls = append(f.ClaimCalls, req)
	fn := f.ClaimFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return ClaimResult{}, nil
}

func (f *fakeStore) RecordDecision(ctx context.Context, req RecordDecisionRequest) (RecordDecisionResult, error) {
	f.mu.Lock()
	f.RecordCalls = append(f.RecordCalls, req)
	fn := f.RecordFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return RecordDecisionResult{}, nil
}

func (f *fakeStore) ExpireOverdue(ctx context.Context, req ExpireRequest) (ExpireResult, error) {
	f.mu.Lock()
	f.ExpireCalls = append(f.ExpireCalls, req)
	fn := f.ExpireFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return ExpireResult{Expired: []ExpiredItem{}}, nil
}

func (f *fakeStore) Close() {
	f.mu.Lock()
	f.closed = true
	f.mu.Unlock()
}

// newTestHandler constructs a Handler wired to the supplied fake, bypassing
// the real New() (which would open a pgx pool).
func newTestHandler(s store) *Handler {
	return &Handler{store: s}
}

// compile-time assertion the fake satisfies the interface.
var _ store = (*fakeStore)(nil)
