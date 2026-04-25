// Package governor implements the tenet0-governor-mcp tool handlers — a thin
// MCP adapter that tracks token-equivalent reasoning effort (NFR-7) and
// subagent spawn telemetry (OQ-5) per Director / department.
//
// NFR-7 invariant (CRITICAL): this package NEVER opens an outbound LLM HTTP
// client, NEVER calls a billing API, and accepts actual_cost_cents=0 as the
// normal path. Zero's OAuth subscription means the governor only measures
// token-equivalent effort for capacity planning. The cost column is retained
// for future per-API-key Directors. The package-level audit in
// governor_test.go enforces this by scanning for forbidden host literals and
// for any import of net/http in the package's non-test sources.
//
// Each method corresponds to one tool in
// .specify/specs/50-tenet0-director-runtime/contracts/mcp-tool-contracts.yaml
// (servers.tenet0-governor-mcp).
//
// This file contains the Phase 2 RED stubs. Every handler body panics with
// "not implemented (Task 2.10)". Task 2.10 replaces the bodies with working
// code and the unit tests in governor_test.go turn green.
package governor

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
)

// ---------------------------------------------------------------------------
// Typed error sentinels — one per contract errorCode for tenet0-governor-mcp.
// Handlers return these; toolErrorCode maps them to the wire code string.
// Wrap underlying errors with %w so errors.Is sees the sentinel.
// ---------------------------------------------------------------------------

var (
	// ErrGovernorUnauthorized: credential missing or revoked.
	ErrGovernorUnauthorized = errors.New("governor-mcp: unauthorized")

	// ErrGovernorDeptUnknown: the department slug is not registered in the
	// department registry (no budget row).
	ErrGovernorDeptUnknown = errors.New("governor-mcp: department unknown")

	// ErrGovernorReservationUnknown: record_spend called with a reservation_id
	// that does not exist in budget_reservations.
	ErrGovernorReservationUnknown = errors.New("governor-mcp: reservation unknown")

	// ErrGovernorReservationExpired: record_spend called after the reservation
	// TTL elapsed; caller must retry with a fresh reserve_tokens.
	ErrGovernorReservationExpired = errors.New("governor-mcp: reservation expired")

	// ErrGovernorInputInvalid: input failed validation (e.g. negative token
	// counts, invalid enum values). Not a wire-level contract code — handlers
	// surface this as a generic INTERNAL / validation error to the MCP layer.
	// Kept as a sentinel so tests assert the rejection path.
	ErrGovernorInputInvalid = errors.New("governor-mcp: input invalid")
)

// toolErrorCode maps a handler-returned sentinel to the wire `code` string
// declared in the contract's errorCodes list. Unknown errors map to
// "INTERNAL".
func toolErrorCode(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, ErrGovernorUnauthorized):
		return "GOVERNOR_UNAUTHORIZED"
	case errors.Is(err, ErrGovernorDeptUnknown):
		return "GOVERNOR_DEPT_UNKNOWN"
	case errors.Is(err, ErrGovernorReservationUnknown):
		return "GOVERNOR_RESERVATION_UNKNOWN"
	case errors.Is(err, ErrGovernorReservationExpired):
		return "GOVERNOR_RESERVATION_EXPIRED"
	default:
		return "INTERNAL"
	}
}

// ---------------------------------------------------------------------------
// Test seam: store is the abstract persistence surface the Handler needs.
// The real implementation (Task 2.10) is a thin wrapper around *pgxpool.Pool
// against the president schema (budget_reservations, governor_ledger,
// department_budgets). Tests provide a fakeStore that captures calls and
// returns canned data.
//
// Design notes (resolved contract ambiguities):
//
//   - Budget period: a department row carries period_start / period_end.
//     Rollover semantics are the store's concern, not the handler's. The
//     handler surfaces whatever the store returns.
//   - Reservation TTL: encoded inside the store (ReserveTokens returns a
//     reservation_id that becomes "expired" after some store-defined window;
//     default target ~60s per research.md). Handler relies on the store to
//     return ErrGovernorReservationExpired when appropriate.
//   - Warn threshold: the store encodes the policy (plan: 80% of budget).
//     The handler trusts `warn_threshold_hit` as returned; no re-derivation.
//   - Idempotency: (idempotency_key, department, model) scope. Same key +
//     same input → same reservation_id. Enforced in the store.
// ---------------------------------------------------------------------------

// store is the abstract governor dependency. Production implementation is
// satisfied by a pgx-backed struct (Task 2.10); tests use fakeStore.
type store interface {
	ReserveTokens(ctx context.Context, req ReserveTokensRequest) (ReserveTokensResponse, error)
	RecordSpend(ctx context.Context, req RecordSpendRequest) (RecordSpendResponse, error)
	BudgetRemaining(ctx context.Context, department string) (BudgetRemainingResponse, error)
	CheckBudget(ctx context.Context, department string, marginalCostCents int) (CheckBudgetResponse, error)
	RecordSpawnTelemetry(ctx context.Context, req RecordSpawnTelemetryRequest) (bool, error)
}

// ---------------------------------------------------------------------------
// Handler — one per governor-mcp process.
// ---------------------------------------------------------------------------

// Handler owns the store and logger. No Anthropic client. No HTTP client.
// The zero-external-LLM-calls property is a package-level NFR-7 invariant,
// enforced by the audit test in governor_test.go.
type Handler struct {
	store  store
	logger *slog.Logger

	// department is the calling Director's bound namespace. It is NOT used
	// as an authorization boundary against the `department` input field
	// (governor tools accept any department the caller is entitled to read);
	// it is captured for audit logging only.
	department string
}

// Config is the constructor input.
type Config struct {
	// PostgresURL is the libpq DSN for the president schema.
	PostgresURL string

	// Department is the bus-go credential department slug of the calling
	// Director. Recorded in audit lines only.
	Department string

	// Credential is the bearer token shared with the department registry.
	Credential string

	// Logger is required; nil returns an error from New.
	Logger *slog.Logger
}

// New + Close implementations live in governor.go (Task 2.10).

// ---------------------------------------------------------------------------
// Tool request / response structs — JSON shapes mirror the contract exactly.
// ---------------------------------------------------------------------------

// DeniedReason is the enum { budget_exceeded | department_paused |
// rate_limited } used by reserve_tokens and check_budget.
type DeniedReason string

const (
	DeniedReasonBudgetExceeded   DeniedReason = "budget_exceeded"
	DeniedReasonDepartmentPaused DeniedReason = "department_paused"
	DeniedReasonRateLimited      DeniedReason = "rate_limited"
)

// SpawnKind is the enum { cold | warm } for record_spawn_telemetry.
type SpawnKind string

const (
	SpawnKindCold SpawnKind = "cold"
	SpawnKindWarm SpawnKind = "warm"
)

// SpawnOutcome is the enum { success | spawn_failure | first_call_failure |
// timeout } for record_spawn_telemetry.
type SpawnOutcome string

const (
	SpawnOutcomeSuccess           SpawnOutcome = "success"
	SpawnOutcomeSpawnFailure      SpawnOutcome = "spawn_failure"
	SpawnOutcomeFirstCallFailure  SpawnOutcome = "first_call_failure"
	SpawnOutcomeTimeout           SpawnOutcome = "timeout"
)

// --- reserve_tokens --------------------------------------------------------

// ReserveTokensRequest mirrors inputSchema for tenet0-governor-mcp.reserve_tokens.
type ReserveTokensRequest struct {
	Department             string  `json:"department"`
	Model                  string  `json:"model"`
	EstimatedInputTokens   int     `json:"estimated_input_tokens"`
	EstimatedOutputTokens  int     `json:"estimated_output_tokens"`
	IdempotencyKey         *string `json:"idempotency_key,omitempty"`
}

// ReserveTokensResponse mirrors outputSchema. DeniedReason is a pointer so it
// serialises as JSON null when Allowed=true.
type ReserveTokensResponse struct {
	ReservationID string        `json:"reservation_id"`
	Allowed       bool          `json:"allowed"`
	DeniedReason  *DeniedReason `json:"denied_reason"`
}

// ReserveTokens implementation lives in governor.go (Task 2.10).

// --- record_spend ----------------------------------------------------------

// RecordSpendRequest mirrors inputSchema for tenet0-governor-mcp.record_spend.
// ActualCostCents defaults to 0 (NFR-7 normal path under OAuth).
type RecordSpendRequest struct {
	ReservationID      string  `json:"reservation_id"`
	ActualInputTokens  int     `json:"actual_input_tokens"`
	ActualOutputTokens int     `json:"actual_output_tokens"`
	ActualCostCents    int     `json:"actual_cost_cents"`
	IdempotencyKey     *string `json:"idempotency_key,omitempty"`
}

// RecordSpendResponse mirrors outputSchema.
type RecordSpendResponse struct {
	Committed         bool `json:"committed"`
	CurrentSpendCents int  `json:"current_spend_cents"`
	BudgetCents       int  `json:"budget_cents"`
	WarnThresholdHit  bool `json:"warn_threshold_hit"`
}

// RecordSpend implementation lives in governor.go (Task 2.10).

// --- budget_remaining ------------------------------------------------------

// BudgetRemainingRequest mirrors inputSchema for budget_remaining.
type BudgetRemainingRequest struct {
	Department string `json:"department"`
}

// BudgetRemainingResponse mirrors outputSchema. RemainingCents is a plain
// int (schema: `integer`, not `integer minimum: 0`) so overspend can be
// reported as a negative value.
type BudgetRemainingResponse struct {
	Department     string    `json:"department"`
	PeriodStart    time.Time `json:"period_start"`
	PeriodEnd      time.Time `json:"period_end"`
	BudgetCents    int       `json:"budget_cents"`
	SpentCents     int       `json:"spent_cents"`
	RemainingCents int       `json:"remaining_cents"`
}

// BudgetRemaining implementation lives in governor.go (Task 2.10).

// --- check_budget ----------------------------------------------------------

// CheckBudgetRequest mirrors inputSchema for check_budget.
type CheckBudgetRequest struct {
	Department                 string `json:"department"`
	EstimatedMarginalCostCents int    `json:"estimated_marginal_cost_cents,omitempty"`
}

// CheckBudgetResponse mirrors outputSchema.
type CheckBudgetResponse struct {
	Allowed      bool          `json:"allowed"`
	DeniedReason *DeniedReason `json:"denied_reason"`
}

// CheckBudget implementation lives in governor.go (Task 2.10).

// --- record_spawn_telemetry ------------------------------------------------

// RecordSpawnTelemetryRequest mirrors inputSchema for record_spawn_telemetry.
type RecordSpawnTelemetryRequest struct {
	Department     string       `json:"department"`
	Director       string       `json:"director"`
	SpawnKind      SpawnKind    `json:"spawn_kind"`
	WallClockMS    int          `json:"wall_clock_ms"`
	Outcome        SpawnOutcome `json:"outcome"`
	EventID        *string      `json:"event_id,omitempty"`
	IdempotencyKey *string      `json:"idempotency_key,omitempty"`
}

// RecordSpawnTelemetryResponse mirrors outputSchema.
type RecordSpawnTelemetryResponse struct {
	Recorded bool `json:"recorded"`
}

// RecordSpawnTelemetry implementation lives in governor.go (Task 2.10).

// ---------------------------------------------------------------------------
// MCP wiring — RegisterTools registers the five tools on a *mcp.Server.
// ---------------------------------------------------------------------------

// ToolNames is the canonical, ordered list of tools this handler exposes.
var ToolNames = []string{
	"reserve_tokens",
	"record_spend",
	"budget_remaining",
	"check_budget",
	"record_spawn_telemetry",
}

// schemas — JSON Schema fragments lifted verbatim from the contract.
var (
	reserveTokensInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["department", "model", "estimated_input_tokens", "estimated_output_tokens"],
		"additionalProperties": false,
		"properties": {
			"department":              {"type": "string", "pattern": "^[a-z][a-z0-9_]+$"},
			"model":                   {"type": "string"},
			"estimated_input_tokens":  {"type": "integer", "minimum": 0},
			"estimated_output_tokens": {"type": "integer", "minimum": 0},
			"idempotency_key":         {"type": "string", "pattern": "^[0-9a-fA-F-]{36}$|^[0-9A-HJKMNP-TV-Z]{26}$"}
		}
	}`)
	reserveTokensOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["reservation_id", "allowed"],
		"additionalProperties": false,
		"properties": {
			"reservation_id": {"type": "string", "format": "uuid"},
			"allowed":        {"type": "boolean"},
			"denied_reason":  {"type": ["string", "null"], "enum": [null, "budget_exceeded", "department_paused", "rate_limited"]}
		}
	}`)

	recordSpendInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["reservation_id", "actual_input_tokens", "actual_output_tokens"],
		"additionalProperties": false,
		"properties": {
			"reservation_id":       {"type": "string", "format": "uuid"},
			"actual_input_tokens":  {"type": "integer", "minimum": 0},
			"actual_output_tokens": {"type": "integer", "minimum": 0},
			"actual_cost_cents":    {"type": "integer", "minimum": 0},
			"idempotency_key":      {"type": "string", "pattern": "^[0-9a-fA-F-]{36}$|^[0-9A-HJKMNP-TV-Z]{26}$"}
		}
	}`)
	recordSpendOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["committed", "current_spend_cents", "budget_cents"],
		"additionalProperties": false,
		"properties": {
			"committed":           {"type": "boolean"},
			"current_spend_cents": {"type": "integer", "minimum": 0},
			"budget_cents":        {"type": "integer", "minimum": 0},
			"warn_threshold_hit":  {"type": "boolean"}
		}
	}`)

	budgetRemainingInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["department"],
		"additionalProperties": false,
		"properties": {
			"department": {"type": "string", "pattern": "^[a-z][a-z0-9_]+$"}
		}
	}`)
	budgetRemainingOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["department", "period_start", "period_end", "budget_cents", "spent_cents", "remaining_cents"],
		"additionalProperties": false,
		"properties": {
			"department":      {"type": "string"},
			"period_start":    {"type": "string", "format": "date-time"},
			"period_end":      {"type": "string", "format": "date-time"},
			"budget_cents":    {"type": "integer", "minimum": 0},
			"spent_cents":     {"type": "integer", "minimum": 0},
			"remaining_cents": {"type": "integer"}
		}
	}`)

	checkBudgetInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["department"],
		"additionalProperties": false,
		"properties": {
			"department":                    {"type": "string", "pattern": "^[a-z][a-z0-9_]+$"},
			"estimated_marginal_cost_cents": {"type": "integer", "minimum": 0, "default": 0}
		}
	}`)
	checkBudgetOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["allowed"],
		"additionalProperties": false,
		"properties": {
			"allowed":       {"type": "boolean"},
			"denied_reason": {"type": ["string", "null"], "enum": [null, "budget_exceeded", "department_paused", "rate_limited"]}
		}
	}`)

	recordSpawnTelemetryInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["department", "director", "spawn_kind", "wall_clock_ms", "outcome"],
		"additionalProperties": false,
		"properties": {
			"department":      {"type": "string", "pattern": "^[a-z][a-z0-9_]+$"},
			"director":        {"type": "string", "pattern": "^[a-z][a-z0-9_]+$"},
			"spawn_kind":      {"type": "string", "enum": ["cold", "warm"]},
			"wall_clock_ms":   {"type": "integer", "minimum": 0},
			"outcome":         {"type": "string", "enum": ["success", "spawn_failure", "first_call_failure", "timeout"]},
			"event_id":        {"type": ["string", "null"], "format": "uuid"},
			"idempotency_key": {"type": "string", "pattern": "^[0-9a-fA-F-]{36}$|^[0-9A-HJKMNP-TV-Z]{26}$"}
		}
	}`)
	recordSpawnTelemetryOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["recorded"],
		"additionalProperties": false,
		"properties": {
			"recorded": {"type": "boolean"}
		}
	}`)
)

// buildTools produces the tool slice registered with the MCP server. Extracted
// so unit tests can invoke each handler lambda directly.
func (h *Handler) buildTools() []mcp.Tool {
	return []mcp.Tool{
		{
			Name:         "reserve_tokens",
			Description:  "Pre-call reservation of token-equivalent budget",
			InputSchema:  reserveTokensInputSchema,
			OutputSchema: reserveTokensOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req ReserveTokensRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, err
				}
				return h.ReserveTokens(ctx, req)
			},
		},
		{
			Name:         "record_spend",
			Description:  "Post-call reconciliation of actual token usage",
			InputSchema:  recordSpendInputSchema,
			OutputSchema: recordSpendOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req RecordSpendRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, err
				}
				return h.RecordSpend(ctx, req)
			},
		},
		{
			Name:         "budget_remaining",
			Description:  "Return remaining budget for a department this period",
			InputSchema:  budgetRemainingInputSchema,
			OutputSchema: budgetRemainingOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req BudgetRemainingRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, err
				}
				return h.BudgetRemaining(ctx, req)
			},
		},
		{
			Name:         "check_budget",
			Description:  "Boolean gate used by daemons before triggering work",
			InputSchema:  checkBudgetInputSchema,
			OutputSchema: checkBudgetOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req CheckBudgetRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, err
				}
				return h.CheckBudget(ctx, req)
			},
		},
		{
			Name:         "record_spawn_telemetry",
			Description:  "Record subagent spawn timing (OQ-5)",
			InputSchema:  recordSpawnTelemetryInputSchema,
			OutputSchema: recordSpawnTelemetryOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req RecordSpawnTelemetryRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, err
				}
				return h.RecordSpawnTelemetry(ctx, req)
			},
		},
	}
}

// RegisterTools wires this Handler's five methods onto srv as MCP tools.
// Returns the first registration error.
func (h *Handler) RegisterTools(srv *mcp.Server) error {
	for _, t := range h.buildTools() {
		if err := srv.RegisterTool(t); err != nil {
			return err
		}
	}
	return nil
}
