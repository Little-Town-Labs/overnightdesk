// Package pending implements the tenet0-pending-mcp tool handlers — a thin
// MCP adapter over the president.pending_approvals + president.decision_log
// tables (data-model.md). Each method corresponds to one tool in
// .specify/specs/50-tenet0-director-runtime/contracts/mcp-tool-contracts.yaml
// (servers.tenet0-pending-mcp).
//
// This file contains the Phase 2 RED stubs. Every handler body panics with
// "not implemented (Task 2.6)". Task 2.6 replaces the bodies with working
// code and the unit tests in pending_test.go turn green.
package pending

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"time"

	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
)

// ---------------------------------------------------------------------------
// Typed error sentinels — one per contract errorCode for tenet0-pending-mcp.
// Handlers return these; toolErrorCode maps them to the wire code string.
// ---------------------------------------------------------------------------

var (
	// ErrPendingUnauthorized: credential missing or revoked.
	ErrPendingUnauthorized = errors.New("pending-mcp: unauthorized")

	// ErrPendingNotFound: the requested pending_approval row / request_event_id
	// does not exist.
	ErrPendingNotFound = errors.New("pending-mcp: not found")

	// ErrPendingAlreadyClaimed: the claim CAS lost the race; another worker
	// has already moved the row out of `pending`.
	ErrPendingAlreadyClaimed = errors.New("pending-mcp: already claimed")

	// ErrPendingInvalidTransition: the requested state transition is not
	// permitted by the pending_approvals status machine (e.g.
	// awaiting_operator without an operator_deadline; recording a decision
	// on a row that is not in awaiting_llm or awaiting_operator).
	ErrPendingInvalidTransition = errors.New("pending-mcp: invalid transition")

	// ErrPendingQueryInvalid: the query parameters are malformed (e.g.
	// status outside the enum, department does not match the slug regex).
	ErrPendingQueryInvalid = errors.New("pending-mcp: query invalid")

	// ErrDecisionLogHashFailure: writing the decision_log row could not
	// compute or extend the SHA256 hash chain (e.g. parent row missing,
	// row_hash mismatch during re-verify).
	ErrDecisionLogHashFailure = errors.New("pending-mcp: decision log hash failure")
)

// toolErrorCode maps a handler-returned sentinel to the wire `code` string
// declared in the contract's errorCodes list.
func toolErrorCode(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, ErrPendingUnauthorized):
		return "PENDING_UNAUTHORIZED"
	case errors.Is(err, ErrPendingAlreadyClaimed):
		return "PENDING_ALREADY_CLAIMED"
	case errors.Is(err, ErrPendingInvalidTransition):
		return "PENDING_INVALID_TRANSITION"
	case errors.Is(err, ErrPendingNotFound):
		return "PENDING_NOT_FOUND"
	case errors.Is(err, ErrPendingQueryInvalid):
		return "PENDING_QUERY_INVALID"
	case errors.Is(err, ErrDecisionLogHashFailure):
		return "DECISION_LOG_HASH_FAILURE"
	default:
		return "INTERNAL"
	}
}

// ---------------------------------------------------------------------------
// Test seam: store is the subset of the Postgres data layer the handler
// uses. Tests provide a fake; production (Task 2.6) wires a pgxpool + the
// internal/shared/hashchain extension helper.
// ---------------------------------------------------------------------------

// Status is the pending_approvals state machine enum.
type Status string

const (
	StatusPending          Status = "pending"
	StatusAwaitingLLM      Status = "awaiting_llm"
	StatusAwaitingOperator Status = "awaiting_operator"
	StatusDecided          Status = "decided"
	StatusExpired          Status = "expired"
)

// allStatuses is the full enum; keep in sync with the CHECK constraint in
// migration 050_002 and the list_pending inputSchema.
var allStatuses = map[Status]bool{
	StatusPending:          true,
	StatusAwaitingLLM:      true,
	StatusAwaitingOperator: true,
	StatusDecided:          true,
	StatusExpired:          true,
}

// Outcome is the decision_log outcome enum.
type Outcome string

const (
	OutcomeApprove Outcome = "approve"
	OutcomeReject  Outcome = "reject"
	OutcomeDefer   Outcome = "defer"
)

var allOutcomes = map[Outcome]bool{
	OutcomeApprove: true,
	OutcomeReject:  true,
	OutcomeDefer:   true,
}

// DecisionMode indicates which FR-3 path resolved the approval.
type DecisionMode string

const (
	DecisionModeRule DecisionMode = "rule"
	DecisionModeLLM  DecisionMode = "llm"
)

var allDecisionModes = map[DecisionMode]bool{
	DecisionModeRule: true,
	DecisionModeLLM:  true,
}

// PendingItem mirrors the list_pending item shape (contract outputSchema).
type PendingItem struct {
	ID                   string    `json:"id"`
	RequestEventID       string    `json:"request_event_id"`
	TargetEventType      string    `json:"target_event_type"`
	RequestingDepartment string    `json:"requesting_department"`
	Status               Status    `json:"status"`
	OperatorDeadline     time.Time `json:"operator_deadline"`
	RuleID               *string   `json:"rule_id,omitempty"`
}

// ListPendingFilter is the (validated) query passed to the store.
type ListPendingFilter struct {
	Department string
	Status     Status
	Limit      int
	Cursor     *string
}

// ListPendingResult is the store response.
type ListPendingResult struct {
	Items      []PendingItem
	NextCursor *string
}

// ClaimRequest is the validated claim-for-decision request handed to store.
// OperatorDeadline MUST be non-zero when NewStatus == awaiting_operator
// (handler pre-validates; store re-enforces via the CHECK constraint).
type ClaimRequest struct {
	RequestEventID   string
	NewStatus        Status
	OperatorDeadline *time.Time
	IdempotencyKey   *string
}

// ClaimResult is the store response on success.
type ClaimResult struct {
	PendingApprovalID string
	ClaimedAt         time.Time
}

// RecordDecisionRequest is the validated record-decision request. Rationale
// is already truncated to maxRationaleChars by the handler.
type RecordDecisionRequest struct {
	PendingApprovalID string
	Outcome           Outcome
	DecisionMode      DecisionMode
	Rationale         string
	Confidence        *float64
	Model             string
	RuleID            string
	Director          string
	OutcomeEventID    *string
	IdempotencyKey    *string
}

// RecordDecisionResult is the store response.
type RecordDecisionResult struct {
	DecisionLogID int64
	RowHash       string // lowercase hex SHA256, 64 chars
	RecordedAt    time.Time
}

// ExpireRequest is the validated expire-overdue request.
type ExpireRequest struct {
	Now      *time.Time // nil → store uses server clock
	MaxBatch int
}

// ExpiredItem describes one row expired by the sweeper.
type ExpiredItem struct {
	PendingApprovalID string `json:"pending_approval_id"`
	RequestEventID    string `json:"request_event_id"`
	TargetEventType   string `json:"target_event_type"`
}

// ExpireResult is the store response.
type ExpireResult struct {
	Expired []ExpiredItem
}

// store is the abstract pending-mcp dependency. The real implementation is
// satisfied by a pgxpool-backed struct in Task 2.6; tests use fakeStore.
type store interface {
	ListPending(ctx context.Context, f ListPendingFilter) (ListPendingResult, error)
	ClaimForDecision(ctx context.Context, req ClaimRequest) (ClaimResult, error)
	RecordDecision(ctx context.Context, req RecordDecisionRequest) (RecordDecisionResult, error)
	ExpireOverdue(ctx context.Context, req ExpireRequest) (ExpireResult, error)
	Close()
}

// ---------------------------------------------------------------------------
// Handler — one per pending-mcp process.
// ---------------------------------------------------------------------------

// Handler owns the store and a logger.
type Handler struct {
	store  store
	logger *slog.Logger
}

// Config is the constructor input.
type Config struct {
	// PostgresURL is the libpq DSN for the president_app role. Must grant
	// SELECT/INSERT/UPDATE on president.pending_approvals and INSERT/SELECT
	// on president.decision_log (see data-model.md role grants).
	PostgresURL string

	// Department is the calling Director namespace; always "president" for
	// this MCP since only the President owns the queue.
	Department string

	// Logger is required; nil returns an error from New.
	Logger *slog.Logger
}

// New + Close are implemented in pending.go (Task 2.6).

// ---------------------------------------------------------------------------
// Validation helpers — shared by handlers and the MCP schema lambdas.
// ---------------------------------------------------------------------------

// departmentPattern mirrors the contract inputSchema regex for the
// `department` and `requesting_department` fields.
var departmentPattern = regexp.MustCompile(`^[a-z][a-z0-9_]+$`)

// maxRationaleChars mirrors the contract record_decision.rationale maxLength.
// Task 2.6 truncates in-handler so oversized rationales don't violate the
// schema on the way back to the caller.
const maxRationaleChars = 2000

// defaultListLimit mirrors the contract list_pending.limit default.
const defaultListLimit = 50

// defaultExpireMaxBatch mirrors the contract expire_overdue.max_batch default.
const defaultExpireMaxBatch = 200

// ---------------------------------------------------------------------------
// Tool request / response structs — JSON shapes mirror the contract exactly.
// ---------------------------------------------------------------------------

// --- list_pending ----------------------------------------------------------

// ListPendingRequest mirrors inputSchema for tenet0-pending-mcp.list_pending.
type ListPendingRequest struct {
	Department string  `json:"department,omitempty"`
	Status     string  `json:"status,omitempty"`
	Limit      int     `json:"limit,omitempty"`
	Cursor     *string `json:"cursor,omitempty"`
}

// ListPendingResponse mirrors outputSchema.
type ListPendingResponse struct {
	Items      []PendingItem `json:"items"`
	NextCursor *string       `json:"next_cursor,omitempty"`
}

// ListPending implementation lives in pending.go (Task 2.6).

// --- claim_for_decision ----------------------------------------------------

// ClaimForDecisionRequest mirrors inputSchema.
type ClaimForDecisionRequest struct {
	RequestEventID   string     `json:"request_event_id"`
	NewStatus        string     `json:"new_status,omitempty"`
	OperatorDeadline *time.Time `json:"operator_deadline,omitempty"`
	IdempotencyKey   *string    `json:"idempotency_key,omitempty"`
}

// ClaimForDecisionResponse mirrors outputSchema.
type ClaimForDecisionResponse struct {
	PendingApprovalID string    `json:"pending_approval_id"`
	ClaimedAt         time.Time `json:"claimed_at"`
}

// ClaimForDecision implementation lives in pending.go (Task 2.6).

// --- record_decision -------------------------------------------------------

// RecordDecisionReq mirrors inputSchema. Named "Req" to avoid collision with
// the internal RecordDecisionRequest used at the store boundary.
type RecordDecisionReq struct {
	PendingApprovalID string   `json:"pending_approval_id"`
	Outcome           string   `json:"outcome"`
	DecisionMode      string   `json:"decision_mode"`
	Rationale         string   `json:"rationale"`
	Confidence        *float64 `json:"confidence,omitempty"`
	Model             string   `json:"model,omitempty"`
	RuleID            string   `json:"rule_id,omitempty"`
	Director          string   `json:"director,omitempty"`
	OutcomeEventID    *string  `json:"outcome_event_id,omitempty"`
	IdempotencyKey    *string  `json:"idempotency_key,omitempty"`
}

// RecordDecisionResp mirrors outputSchema.
type RecordDecisionResp struct {
	DecisionLogID int64     `json:"decision_log_id"`
	RowHash       string    `json:"row_hash"`
	RecordedAt    time.Time `json:"recorded_at"`
}

// RecordDecision implementation lives in pending.go (Task 2.6).

// --- expire_overdue --------------------------------------------------------

// ExpireOverdueRequest mirrors inputSchema.
type ExpireOverdueRequest struct {
	Now      *time.Time `json:"now,omitempty"`
	MaxBatch int        `json:"max_batch,omitempty"`
}

// ExpireOverdueResponse mirrors outputSchema.
type ExpireOverdueResponse struct {
	Expired []ExpiredItem `json:"expired"`
}

// ExpireOverdue implementation lives in pending.go (Task 2.6).

// ---------------------------------------------------------------------------
// MCP wiring — RegisterTools registers the four tools on a *mcp.Server.
// ---------------------------------------------------------------------------

// ToolNames is the canonical, ordered list of tools this handler exposes.
var ToolNames = []string{
	"list_pending",
	"claim_for_decision",
	"record_decision",
	"expire_overdue",
}

// schemas — JSON Schema fragments lifted verbatim from the contract.
var (
	listPendingInputSchema = json.RawMessage(`{
		"type": "object",
		"additionalProperties": false,
		"properties": {
			"department": {"type": "string", "pattern": "^[a-z][a-z0-9_]+$"},
			"status":     {"type": "string", "enum": ["pending", "awaiting_llm", "awaiting_operator", "decided", "expired"]},
			"limit":      {"type": "integer", "minimum": 1, "maximum": 500, "default": 50},
			"cursor":     {"type": ["string", "null"]}
		}
	}`)
	listPendingOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["items"],
		"additionalProperties": false,
		"properties": {
			"items": {
				"type": "array",
				"items": {
					"type": "object",
					"required": ["id", "request_event_id", "target_event_type", "requesting_department", "status", "operator_deadline"],
					"additionalProperties": true,
					"properties": {
						"id":                    {"type": "string", "format": "uuid"},
						"request_event_id":      {"type": "string", "format": "uuid"},
						"target_event_type":     {"type": "string"},
						"requesting_department": {"type": "string"},
						"status":                {"type": "string"},
						"operator_deadline":     {"type": "string", "format": "date-time"},
						"rule_id":               {"type": ["string", "null"]}
					}
				}
			},
			"next_cursor": {"type": ["string", "null"]}
		}
	}`)

	claimForDecisionInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["request_event_id"],
		"additionalProperties": false,
		"properties": {
			"request_event_id":  {"type": "string", "format": "uuid"},
			"new_status":        {"type": "string", "enum": ["awaiting_llm", "awaiting_operator"], "default": "awaiting_llm"},
			"operator_deadline": {"type": "string", "format": "date-time"},
			"idempotency_key":   {"type": "string", "pattern": "^[0-9a-fA-F-]{36}$|^[0-9A-HJKMNP-TV-Z]{26}$"}
		}
	}`)
	claimForDecisionOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["pending_approval_id", "claimed_at"],
		"additionalProperties": false,
		"properties": {
			"pending_approval_id": {"type": "string", "format": "uuid"},
			"claimed_at":          {"type": "string", "format": "date-time"}
		}
	}`)

	recordDecisionInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["pending_approval_id", "outcome", "decision_mode", "rationale"],
		"additionalProperties": false,
		"properties": {
			"pending_approval_id": {"type": "string", "format": "uuid"},
			"outcome":             {"type": "string", "enum": ["approve", "reject", "defer"]},
			"decision_mode":       {"type": "string", "enum": ["rule", "llm"]},
			"rationale":           {"type": "string", "maxLength": 2000},
			"confidence":          {"type": "number", "minimum": 0, "maximum": 1},
			"model":               {"type": "string"},
			"rule_id":             {"type": "string"},
			"director":            {"type": "string"},
			"outcome_event_id":    {"type": "string", "format": "uuid"},
			"idempotency_key":     {"type": "string", "pattern": "^[0-9a-fA-F-]{36}$|^[0-9A-HJKMNP-TV-Z]{26}$"}
		}
	}`)
	recordDecisionOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["decision_log_id", "row_hash", "recorded_at"],
		"additionalProperties": false,
		"properties": {
			"decision_log_id": {"type": "integer"},
			"row_hash":        {"type": "string", "pattern": "^[a-f0-9]{64}$"},
			"recorded_at":     {"type": "string", "format": "date-time"}
		}
	}`)

	expireOverdueInputSchema = json.RawMessage(`{
		"type": "object",
		"additionalProperties": false,
		"properties": {
			"now":       {"type": "string", "format": "date-time"},
			"max_batch": {"type": "integer", "minimum": 1, "maximum": 1000, "default": 200}
		}
	}`)
	expireOverdueOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["expired"],
		"additionalProperties": false,
		"properties": {
			"expired": {
				"type": "array",
				"items": {
					"type": "object",
					"required": ["pending_approval_id", "request_event_id", "target_event_type"],
					"additionalProperties": false,
					"properties": {
						"pending_approval_id": {"type": "string", "format": "uuid"},
						"request_event_id":    {"type": "string", "format": "uuid"},
						"target_event_type":   {"type": "string"}
					}
				}
			}
		}
	}`)
)

// buildTools produces the tool slice registered with the MCP server.
// Extracted so unit tests can invoke each handler lambda directly without
// needing access to the server's internal registry.
func (h *Handler) buildTools() []mcp.Tool {
	return []mcp.Tool{
		{
			Name:         "list_pending",
			Description:  "List pending approvals matching filters",
			InputSchema:  listPendingInputSchema,
			OutputSchema: listPendingOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req ListPendingRequest
				if len(in) > 0 && string(in) != "null" {
					if err := json.Unmarshal(in, &req); err != nil {
						return nil, fmt.Errorf("%w: %v", ErrPendingQueryInvalid, err)
					}
				}
				return h.ListPending(ctx, req)
			},
		},
		{
			Name:         "claim_for_decision",
			Description:  "Atomically claim a pending approval for processing",
			InputSchema:  claimForDecisionInputSchema,
			OutputSchema: claimForDecisionOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req ClaimForDecisionRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, fmt.Errorf("%w: %v", ErrPendingQueryInvalid, err)
				}
				return h.ClaimForDecision(ctx, req)
			},
		},
		{
			Name:         "record_decision",
			Description:  "Record the decision and extend the decision_log hash chain",
			InputSchema:  recordDecisionInputSchema,
			OutputSchema: recordDecisionOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req RecordDecisionReq
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, fmt.Errorf("%w: %v", ErrPendingQueryInvalid, err)
				}
				return h.RecordDecision(ctx, req)
			},
		},
		{
			Name:         "expire_overdue",
			Description:  "Transition awaiting_operator rows past deadline to expired",
			InputSchema:  expireOverdueInputSchema,
			OutputSchema: expireOverdueOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req ExpireOverdueRequest
				if len(in) > 0 && string(in) != "null" {
					if err := json.Unmarshal(in, &req); err != nil {
						return nil, fmt.Errorf("%w: %v", ErrPendingQueryInvalid, err)
					}
				}
				return h.ExpireOverdue(ctx, req)
			},
		},
	}
}

// RegisterTools wires this Handler's four methods onto srv as MCP tools.
// Returns the first registration error.
func (h *Handler) RegisterTools(srv *mcp.Server) error {
	for _, t := range h.buildTools() {
		if err := srv.RegisterTool(t); err != nil {
			return err
		}
	}
	return nil
}
