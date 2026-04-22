package governor

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

// pgStore is the pgx-backed production store. Task 2.10's agent hit a rate
// limit before writing the SQL paths; the minimal skeleton below lets the
// package build so tests (which use fakeStore) pass. Full implementation is
// tracked as a Phase 2 follow-up; every method returns ErrNotWiredYet so a
// misconfigured production deploy surfaces loudly instead of silently
// misreporting budgets.
type pgStore struct {
	pool *pgxpool.Pool
}

// ErrNotWiredYet marks store methods whose SQL paths are pending. Production
// cmd/governor-mcp wiring must not go live until each is implemented.
var ErrNotWiredYet = errors.New("governor pg store: SQL path not yet implemented")

func newPgStore(pool *pgxpool.Pool) *pgStore {
	return &pgStore{pool: pool}
}

func (s *pgStore) ReserveTokens(context.Context, ReserveTokensRequest) (ReserveTokensResponse, error) {
	return ReserveTokensResponse{}, ErrNotWiredYet
}

func (s *pgStore) RecordSpend(context.Context, RecordSpendRequest) (RecordSpendResponse, error) {
	return RecordSpendResponse{}, ErrNotWiredYet
}

func (s *pgStore) BudgetRemaining(context.Context, string) (BudgetRemainingResponse, error) {
	return BudgetRemainingResponse{}, ErrNotWiredYet
}

func (s *pgStore) CheckBudget(context.Context, string, int) (CheckBudgetResponse, error) {
	return CheckBudgetResponse{}, ErrNotWiredYet
}

func (s *pgStore) RecordSpawnTelemetry(context.Context, RecordSpawnTelemetryRequest) (bool, error) {
	return false, ErrNotWiredYet
}
