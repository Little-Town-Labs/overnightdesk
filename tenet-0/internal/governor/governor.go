// Package governor — handler implementations (Task 2.10).
//
// types.go defines the stubs, error sentinels, request/response shapes, and
// MCP schema wiring. This file replaces the "not implemented (Task 2.10)"
// panics with working bodies.
//
// NFR-7 invariant: this file MUST NOT import net/http and MUST NOT contain
// any Anthropic host literal. Enforced by package-level tests in
// governor_test.go.
package governor

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/overnightdesk/tenet-0/internal/shared/pgxutil"
)

// departmentPattern mirrors the contract regex for department / director
// slugs. Kept in sync with 050_001 roles and spec inputSchemas.
var departmentPattern = regexp.MustCompile(`^[a-z][a-z0-9_]+$`)

// validDepartment returns nil when slug satisfies the contract pattern,
// else ErrGovernorInputInvalid wrapped with the bad value.
func validDepartment(slug string) error {
	if !departmentPattern.MatchString(slug) {
		return fmt.Errorf("%w: department %q does not match ^[a-z][a-z0-9_]+$", ErrGovernorInputInvalid, slug)
	}
	return nil
}

// validSpawnKind validates the { cold | warm } enum.
func validSpawnKind(k SpawnKind) bool {
	return k == SpawnKindCold || k == SpawnKindWarm
}

// validSpawnOutcome validates the { success | spawn_failure |
// first_call_failure | timeout } enum.
func validSpawnOutcome(o SpawnOutcome) bool {
	switch o {
	case SpawnOutcomeSuccess, SpawnOutcomeSpawnFailure, SpawnOutcomeFirstCallFailure, SpawnOutcomeTimeout:
		return true
	}
	return false
}

// -----------------------------------------------------------------------------
// Constructor / Close — production wires pgxpool. New is never called from
// unit tests; tests use newTestHandler (fakes_test.go).
// -----------------------------------------------------------------------------

// New constructs a Handler by opening a pgx pool and wrapping it in the real
// store implementation (store_pg.go).
func New(cfg Config) (*Handler, error) {
	if cfg.Logger == nil {
		return nil, errors.New("governor.New: Logger is required")
	}
	if cfg.Department == "" {
		return nil, errors.New("governor.New: Department is required")
	}
	if cfg.PostgresURL == "" {
		return nil, errors.New("governor.New: PostgresURL is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxutil.New(ctx, cfg.PostgresURL, "governor-mcp")
	if err != nil {
		return nil, fmt.Errorf("governor.New: pool: %w", err)
	}

	return &Handler{
		store:      newPgStore(pool),
		logger:     cfg.Logger,
		department: cfg.Department,
	}, nil
}

// -----------------------------------------------------------------------------
// Handler methods.
// -----------------------------------------------------------------------------

// ReserveTokens validates input, then delegates to the store. The store
// implements idempotency (same idempotency_key + department + model →
// same reservation_id).
func (h *Handler) ReserveTokens(ctx context.Context, req ReserveTokensRequest) (ReserveTokensResponse, error) {
	if err := validDepartment(req.Department); err != nil {
		return ReserveTokensResponse{}, err
	}
	if req.EstimatedInputTokens < 0 {
		return ReserveTokensResponse{}, fmt.Errorf("%w: estimated_input_tokens must be >=0", ErrGovernorInputInvalid)
	}
	if req.EstimatedOutputTokens < 0 {
		return ReserveTokensResponse{}, fmt.Errorf("%w: estimated_output_tokens must be >=0", ErrGovernorInputInvalid)
	}
	if req.Model == "" {
		return ReserveTokensResponse{}, fmt.Errorf("%w: model is required", ErrGovernorInputInvalid)
	}
	return h.store.ReserveTokens(ctx, req)
}

// RecordSpend validates input, then delegates. ActualCostCents=0 is the
// normal NFR-7 path and MUST NOT produce an error.
func (h *Handler) RecordSpend(ctx context.Context, req RecordSpendRequest) (RecordSpendResponse, error) {
	if req.ReservationID == "" {
		return RecordSpendResponse{}, fmt.Errorf("%w: reservation_id is required", ErrGovernorInputInvalid)
	}
	if req.ActualInputTokens < 0 {
		return RecordSpendResponse{}, fmt.Errorf("%w: actual_input_tokens must be >=0", ErrGovernorInputInvalid)
	}
	if req.ActualOutputTokens < 0 {
		return RecordSpendResponse{}, fmt.Errorf("%w: actual_output_tokens must be >=0", ErrGovernorInputInvalid)
	}
	if req.ActualCostCents < 0 {
		return RecordSpendResponse{}, fmt.Errorf("%w: actual_cost_cents must be >=0", ErrGovernorInputInvalid)
	}
	return h.store.RecordSpend(ctx, req)
}

// BudgetRemaining validates the department slug and delegates. remaining_cents
// is NOT clamped — the contract schema permits negative values for overspend.
func (h *Handler) BudgetRemaining(ctx context.Context, req BudgetRemainingRequest) (BudgetRemainingResponse, error) {
	if err := validDepartment(req.Department); err != nil {
		return BudgetRemainingResponse{}, err
	}
	return h.store.BudgetRemaining(ctx, req.Department)
}

// CheckBudget validates the department slug and delegates. Marginal defaults
// to 0 (already the Go zero value).
func (h *Handler) CheckBudget(ctx context.Context, req CheckBudgetRequest) (CheckBudgetResponse, error) {
	if err := validDepartment(req.Department); err != nil {
		return CheckBudgetResponse{}, err
	}
	if req.EstimatedMarginalCostCents < 0 {
		return CheckBudgetResponse{}, fmt.Errorf("%w: estimated_marginal_cost_cents must be >=0", ErrGovernorInputInvalid)
	}
	return h.store.CheckBudget(ctx, req.Department, req.EstimatedMarginalCostCents)
}

// RecordSpawnTelemetry validates regex + enum fields, then delegates.
func (h *Handler) RecordSpawnTelemetry(ctx context.Context, req RecordSpawnTelemetryRequest) (RecordSpawnTelemetryResponse, error) {
	if err := validDepartment(req.Department); err != nil {
		return RecordSpawnTelemetryResponse{}, err
	}
	if err := validDepartment(req.Director); err != nil {
		return RecordSpawnTelemetryResponse{}, fmt.Errorf("%w: director %q does not match ^[a-z][a-z0-9_]+$", ErrGovernorInputInvalid, req.Director)
	}
	if !validSpawnKind(req.SpawnKind) {
		return RecordSpawnTelemetryResponse{}, fmt.Errorf("%w: spawn_kind %q not in {cold,warm}", ErrGovernorInputInvalid, req.SpawnKind)
	}
	if !validSpawnOutcome(req.Outcome) {
		return RecordSpawnTelemetryResponse{}, fmt.Errorf("%w: outcome %q not in {success,spawn_failure,first_call_failure,timeout}", ErrGovernorInputInvalid, req.Outcome)
	}
	if req.WallClockMS < 0 {
		return RecordSpawnTelemetryResponse{}, fmt.Errorf("%w: wall_clock_ms must be >=0", ErrGovernorInputInvalid)
	}
	recorded, err := h.store.RecordSpawnTelemetry(ctx, req)
	if err != nil {
		return RecordSpawnTelemetryResponse{}, err
	}
	return RecordSpawnTelemetryResponse{Recorded: recorded}, nil
}
