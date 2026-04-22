package audit

import (
	"context"
	"sync"
)

// fakeStore is a store implementation for tests. Each method is controllable
// via a function field; nil falls back to a canned empty value.
type fakeStore struct {
	mu sync.Mutex

	QueryDecisionsCalls     []QueryDecisionsFilter
	FetchRowsForVerifyCalls []fetchCall
	FindGapsCalls           []FindGapsRequest

	QueryDecisionsFn     func(ctx context.Context, filter QueryDecisionsFilter) (QueryDecisionsResult, error)
	FetchRowsForVerifyFn func(ctx context.Context, mode VerifyMode, sampleSize int, startID, endID *int64) ([]ChainRow, error)
	FindGapsFn           func(ctx context.Context, req FindGapsRequest) (FindGapsResult, error)
}

type fetchCall struct {
	Mode       VerifyMode
	SampleSize int
	StartID    *int64
	EndID      *int64
}

func (f *fakeStore) QueryDecisions(ctx context.Context, filter QueryDecisionsFilter) (QueryDecisionsResult, error) {
	f.mu.Lock()
	f.QueryDecisionsCalls = append(f.QueryDecisionsCalls, filter)
	fn := f.QueryDecisionsFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, filter)
	}
	return QueryDecisionsResult{Items: []DecisionRow{}}, nil
}

func (f *fakeStore) FetchRowsForVerify(ctx context.Context, mode VerifyMode, sampleSize int, startID, endID *int64) ([]ChainRow, error) {
	f.mu.Lock()
	f.FetchRowsForVerifyCalls = append(f.FetchRowsForVerifyCalls, fetchCall{
		Mode: mode, SampleSize: sampleSize, StartID: startID, EndID: endID,
	})
	fn := f.FetchRowsForVerifyFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, mode, sampleSize, startID, endID)
	}
	return nil, nil
}

func (f *fakeStore) FindGaps(ctx context.Context, req FindGapsRequest) (FindGapsResult, error) {
	f.mu.Lock()
	f.FindGapsCalls = append(f.FindGapsCalls, req)
	fn := f.FindGapsFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return FindGapsResult{Gaps: []Gap{}}, nil
}

// fakeVerifier is a chainVerifier implementation for tests.
//   - Err nil + FirstBadIdx -1 → clean chain (default)
//   - Err non-nil + FirstBadIdx >= 0 → corruption at that index
type fakeVerifier struct {
	mu sync.Mutex

	VerifyCalls int

	VerifyFn     func(rows []ChainRow) (int, error)
	FirstBadIdx  int
	Err          error
}

func (f *fakeVerifier) Verify(rows []ChainRow) (int, error) {
	f.mu.Lock()
	f.VerifyCalls++
	fn := f.VerifyFn
	idx := f.FirstBadIdx
	err := f.Err
	f.mu.Unlock()
	if fn != nil {
		return fn(rows)
	}
	if err != nil {
		return idx, err
	}
	return -1, nil
}

// newTestHandler wires a Handler to the supplied fakes, bypassing the real
// New() (which would open a pgx pool).
func newTestHandler(s store, v chainVerifier) *Handler {
	if v == nil {
		v = &fakeVerifier{FirstBadIdx: -1}
	}
	return &Handler{
		store:    s,
		verifier: v,
	}
}

// int64Ptr / strPtr are tiny helpers to compact the call sites in tests.
func int64Ptr(v int64) *int64 { return &v }
func strPtr(s string) *string { return &s }
