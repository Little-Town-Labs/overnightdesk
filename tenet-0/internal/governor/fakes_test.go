package governor

import (
	"context"
	"log/slog"
	"sync"
)

// fakeStore is a `store` implementation for tests. Each method is controllable
// via a function field; nil falls back to a canned value.
type fakeStore struct {
	mu sync.Mutex

	ReserveCalls      []ReserveTokensRequest
	RecordSpendCalls  []RecordSpendRequest
	BudgetCalls       []string // captured department arg
	CheckCalls        []checkArgs
	SpawnCalls        []RecordSpawnTelemetryRequest

	ReserveFn      func(ctx context.Context, req ReserveTokensRequest) (ReserveTokensResponse, error)
	RecordSpendFn  func(ctx context.Context, req RecordSpendRequest) (RecordSpendResponse, error)
	BudgetFn       func(ctx context.Context, department string) (BudgetRemainingResponse, error)
	CheckFn        func(ctx context.Context, department string, marginal int) (CheckBudgetResponse, error)
	SpawnFn        func(ctx context.Context, req RecordSpawnTelemetryRequest) (bool, error)
}

type checkArgs struct {
	Department string
	Marginal   int
}

func (f *fakeStore) ReserveTokens(ctx context.Context, req ReserveTokensRequest) (ReserveTokensResponse, error) {
	f.mu.Lock()
	f.ReserveCalls = append(f.ReserveCalls, req)
	fn := f.ReserveFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return ReserveTokensResponse{
		ReservationID: "00000000-0000-0000-0000-000000000001",
		Allowed:       true,
	}, nil
}

func (f *fakeStore) RecordSpend(ctx context.Context, req RecordSpendRequest) (RecordSpendResponse, error) {
	f.mu.Lock()
	f.RecordSpendCalls = append(f.RecordSpendCalls, req)
	fn := f.RecordSpendFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return RecordSpendResponse{
		Committed:         true,
		CurrentSpendCents: 0,
		BudgetCents:       100000,
		WarnThresholdHit:  false,
	}, nil
}

func (f *fakeStore) BudgetRemaining(ctx context.Context, department string) (BudgetRemainingResponse, error) {
	f.mu.Lock()
	f.BudgetCalls = append(f.BudgetCalls, department)
	fn := f.BudgetFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, department)
	}
	return BudgetRemainingResponse{
		Department:     department,
		BudgetCents:    100000,
		SpentCents:     0,
		RemainingCents: 100000,
	}, nil
}

func (f *fakeStore) CheckBudget(ctx context.Context, department string, marginal int) (CheckBudgetResponse, error) {
	f.mu.Lock()
	f.CheckCalls = append(f.CheckCalls, checkArgs{Department: department, Marginal: marginal})
	fn := f.CheckFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, department, marginal)
	}
	return CheckBudgetResponse{Allowed: true}, nil
}

func (f *fakeStore) RecordSpawnTelemetry(ctx context.Context, req RecordSpawnTelemetryRequest) (bool, error) {
	f.mu.Lock()
	f.SpawnCalls = append(f.SpawnCalls, req)
	fn := f.SpawnFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return true, nil
}

// newTestHandler constructs a Handler wired to the supplied fake, bypassing
// the real New() (which would open pgx pools).
func newTestHandler(s store, logger *slog.Logger) *Handler {
	return &Handler{
		store:      s,
		logger:     logger,
		department: "president",
	}
}

// compile-time assertion the fake satisfies the interface.
var _ store = (*fakeStore)(nil)
