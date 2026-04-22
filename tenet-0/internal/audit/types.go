// Package audit implements the tenet0-audit-mcp tool handlers — the
// READ-ONLY audit surface over president.decision_log (FR-9, FR-21). Each
// method corresponds to one tool in
// .specify/specs/50-tenet0-director-runtime/contracts/mcp-tool-contracts.yaml
// (servers.tenet0-audit-mcp).
//
// Security invariant (WORM): this package exposes NO mutation tools. The
// contract declares exactly three tools — verify_chain, query_decisions,
// find_gaps — all read-only. Chain extension happens exclusively via
// tenet0-pending-mcp.record_decision inside a write transaction that locks
// president.decision_log_chain_state. Any method on Handler whose name begins
// with Write/Record/Update/Delete/Insert/Set is a contract violation; a
// reflection-based unit test in audit_test.go enforces this at build time.
//
// This file is the Phase 2 RED stub. Every handler body panics with
// "not implemented (Task 2.8)". Task 2.8 replaces the bodies with working
// code and the unit tests in audit_test.go turn green.
package audit

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/overnightdesk/tenet-0/internal/shared/hashchain"
	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
)

// ---------------------------------------------------------------------------
// Typed error sentinels — one per contract errorCode for tenet0-audit-mcp.
// Handlers return these; toolErrorCode maps them to the wire code string.
// Wrap underlying errors with %w so errors.Is sees the sentinel.
// ---------------------------------------------------------------------------

var (
	// ErrAuditUnauthorized: credential missing or revoked.
	ErrAuditUnauthorized = errors.New("audit-mcp: unauthorized")

	// ErrAuditQueryInvalid: filter parameters are mutually inconsistent
	// (e.g. end_time before start_time, sample_size out of range,
	// full_range mode without start_row_id/end_row_id, unknown enum value).
	ErrAuditQueryInvalid = errors.New("audit-mcp: query invalid")
)

// toolErrorCode maps a handler-returned sentinel to the wire `code` string
// declared in the contract's errorCodes list. Unknown errors map to
// "INTERNAL".
func toolErrorCode(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, ErrAuditUnauthorized):
		return "AUDIT_UNAUTHORIZED"
	case errors.Is(err, ErrAuditQueryInvalid):
		return "AUDIT_QUERY_INVALID"
	default:
		return "INTERNAL"
	}
}

// ---------------------------------------------------------------------------
// Test seams. The handler depends on two narrow interfaces so unit tests can
// run without Postgres and without re-implementing the hash-chain verifier.
//
//   store         wraps the Postgres read-side queries against
//                 president.decision_log (and companion bus.events filter for
//                 find_gaps). Tests use fakeStore.
//   chainVerifier wraps internal/shared/hashchain.VerifyChain so a test can
//                 inject a known-corrupt or known-good result without having
//                 to synthesize actual hash-chained rows. Tests use
//                 fakeVerifier. Production wiring lives in audit.go (Task 2.8)
//                 and simply delegates to hashchain.VerifyChain.
// ---------------------------------------------------------------------------

// VerifyMode mirrors the contract enum { random_sample | full_range }.
type VerifyMode string

const (
	VerifyModeRandomSample VerifyMode = "random_sample"
	VerifyModeFullRange    VerifyMode = "full_range"
)

// DecisionOutcome mirrors the contract enum { approve | reject | defer }
// on the query_decisions outcome filter. Note: decision_log.outcome_event_type
// is the bus event type string (e.g. "president.approved"); the contract
// maps the three enum values to prefix matches on that column.
type DecisionOutcome string

const (
	OutcomeApprove DecisionOutcome = "approve"
	OutcomeReject  DecisionOutcome = "reject"
	OutcomeDefer   DecisionOutcome = "defer"
)

// DecisionMode mirrors the contract enum { rule | llm } on decision_log.
type DecisionMode string

const (
	DecisionModeRule DecisionMode = "rule"
	DecisionModeLLM  DecisionMode = "llm"
)

// GapKind mirrors the contract enum on find_gaps output.
type GapKind string

const (
	GapMissingDecisionLogRow GapKind = "missing_decision_log_row"
	GapMissingOutcome        GapKind = "missing_outcome"
	GapMultipleOutcomes      GapKind = "multiple_outcomes"
)

// ChainRow is the test-seam shape the verifier consumes. It is a thin alias
// of hashchain.Row so the production store can return rows straight from
// president.decision_log without a second conversion.
type ChainRow = hashchain.Row

// QueryDecisionsFilter is the typed filter handed to the store; the handler
// translates QueryDecisionsRequest → QueryDecisionsFilter after validation so
// the store contract is strongly typed (no JSON).
type QueryDecisionsFilter struct {
	OutcomeEventID *string
	Department     string
	Outcome        DecisionOutcome
	DecisionMode   DecisionMode
	StartTime      *time.Time
	EndTime        *time.Time
	Limit          int
	Cursor         *string
}

// QueryDecisionsResult is what the store hands back.
type QueryDecisionsResult struct {
	Items      []DecisionRow
	NextCursor *string
}

// DecisionRow is the contract-shaped decision_log row returned by
// query_decisions. Marshals to `type: object, additionalProperties: true` per
// contract so future fields flow through without handler changes.
type DecisionRow struct {
	ID                   string          `json:"id"`
	OutcomeEventID       string          `json:"outcome_event_id"`
	OutcomeEventType     string          `json:"outcome_event_type"`
	CausalityRootEventID *string         `json:"causality_root_event_id,omitempty"`
	DecisionMode         string          `json:"decision_mode"`
	RuleIDUsed           *string         `json:"rule_id_used,omitempty"`
	ModelID              *string         `json:"model_id,omitempty"`
	Department           string          `json:"department,omitempty"`
	Rationale            string          `json:"rationale,omitempty"`
	CreatedAt            time.Time       `json:"created_at"`
	RowHashHex           string          `json:"row_hash,omitempty"` // lowercase hex, 64 chars
	Extras               json.RawMessage `json:"extras,omitempty"`
}

// FindGapsRequest is the store-level shape for find_gaps; identical to the
// wire request but expressed with real time.Time values after the handler
// parses the RFC3339 strings.
type FindGapsRequest struct {
	WindowStart  time.Time
	WindowEnd    time.Time
	IncludeKinds []GapKind
}

// FindGapsResult is what the store hands back.
type FindGapsResult struct {
	Gaps []Gap
}

// Gap is one element of the find_gaps output array.
type Gap struct {
	Kind       GapKind  `json:"kind"`
	EventID    string   `json:"event_id"`
	RelatedIDs []string `json:"related_ids,omitempty"`
}

// store is the narrow dependency the Handler uses for every read. Tests
// satisfy this with fakeStore; production wiring in audit.go (Task 2.8)
// satisfies it with a thin *pgxpool.Pool adapter.
type store interface {
	// QueryDecisions returns decision_log rows matching filter, honoring
	// Limit+Cursor. Must return an empty slice (never nil) on no match so
	// handler output is always a proper JSON array.
	QueryDecisions(ctx context.Context, filter QueryDecisionsFilter) (QueryDecisionsResult, error)

	// FetchRowsForVerify returns hash-chain rows for the verifier. For
	// random_sample, sampleSize is the cap; startID/endID are nil. For
	// full_range, sampleSize is zero and startID/endID are both non-nil.
	// Rows must be ordered by decision_log.id ASC so the verifier can walk
	// them linearly.
	FetchRowsForVerify(ctx context.Context, mode VerifyMode, sampleSize int, startID, endID *int64) ([]ChainRow, error)

	// FindGaps runs the FR-21 audit self-check against the supplied window.
	// The store owns the SQL because the three gap kinds require joins across
	// bus.events and decision_log that would be expensive to replicate in Go.
	FindGaps(ctx context.Context, req FindGapsRequest) (FindGapsResult, error)
}

// chainVerifier wraps internal/shared/hashchain.VerifyChain. Returning
// firstBadIdx lets the handler map back to the row ID in the []ChainRow
// slice; err is nil on a clean chain. firstBadIdx is -1 on success. For an
// empty slice, the implementation must return (-1, nil) — matching
// hashchain.VerifyChain's contract.
type chainVerifier interface {
	Verify(rows []ChainRow) (firstBadIdx int, err error)
}

// ---------------------------------------------------------------------------
// Handler — one per audit-mcp process.
//
// SECURITY INVARIANT: no methods with Write/Record/Update/Delete/Insert/Set
// name prefixes. See TestHandler_NoMutationMethods in audit_test.go.
// ---------------------------------------------------------------------------

// Handler owns the read-only store, the chain verifier, and a logger.
type Handler struct {
	store    store
	verifier chainVerifier
	logger   *slog.Logger
}

// Config is the constructor input.
type Config struct {
	// PostgresURL is the libpq DSN pointing at the tenet-0 Postgres. The
	// handler MUST connect with a role that has SELECT-only grants on
	// president.decision_log and bus.events (the audit role in
	// migration 050_001_schema_grants.sql).
	PostgresURL string

	// Logger is required; nil returns an error from New.
	Logger *slog.Logger
}

// New + Close implementations live in audit.go (Task 2.8).

// ---------------------------------------------------------------------------
// Tool request / response structs — JSON shapes mirror the contract exactly.
// ---------------------------------------------------------------------------

// --- verify_chain ----------------------------------------------------------

// VerifyChainRequest mirrors inputSchema.
type VerifyChainRequest struct {
	Mode       VerifyMode `json:"mode,omitempty"`
	SampleSize int        `json:"sample_size,omitempty"`
	StartRowID *int64     `json:"start_row_id,omitempty"`
	EndRowID   *int64     `json:"end_row_id,omitempty"`
}

// VerifyChainResponse mirrors outputSchema. All "on failure" pointers are
// nil on a valid chain so they serialize as JSON null per contract's
// type: ["integer","null"] / ["string","null"].
type VerifyChainResponse struct {
	Valid          bool    `json:"valid"`
	RowsChecked    int     `json:"rows_checked"`
	FirstBadRowID  *int64  `json:"first_bad_row_id"`
	LastBadRowID   *int64  `json:"last_bad_row_id"`
	ExpectedHash   *string `json:"expected_hash"` // lowercase hex SHA256
	ActualHash     *string `json:"actual_hash"`   // lowercase hex SHA256
}

// VerifyChain implementation lives in audit.go (Task 2.8).

// maxSampleSize mirrors the contract inputSchema sample_size.maximum.
const maxSampleSize = 100000

// defaultSampleSize mirrors the contract inputSchema sample_size.default.
const defaultSampleSize = 1000

// --- query_decisions -------------------------------------------------------

// QueryDecisionsRequest mirrors inputSchema.
type QueryDecisionsRequest struct {
	OutcomeEventID *string    `json:"outcome_event_id,omitempty"`
	Department     string     `json:"department,omitempty"`
	Outcome        string     `json:"outcome,omitempty"`
	DecisionMode   string     `json:"decision_mode,omitempty"`
	StartTime      *time.Time `json:"start_time,omitempty"`
	EndTime        *time.Time `json:"end_time,omitempty"`
	Limit          int        `json:"limit,omitempty"`
	Cursor         *string    `json:"cursor,omitempty"`
}

// QueryDecisionsResponse mirrors outputSchema.
type QueryDecisionsResponse struct {
	Items      []DecisionRow `json:"items"`
	NextCursor *string       `json:"next_cursor"`
}

// QueryDecisions implementation lives in audit.go (Task 2.8).

// defaultQueryLimit mirrors the contract inputSchema limit.default.
const defaultQueryLimit = 100

// maxQueryLimit mirrors the contract inputSchema limit.maximum.
const maxQueryLimit = 1000

// --- find_gaps -------------------------------------------------------------

// FindGapsRequestWire mirrors inputSchema (wire type — string dates). The
// handler parses the RFC3339 strings into FindGapsRequest before hitting the
// store.
type FindGapsRequestWire struct {
	WindowStart  time.Time `json:"window_start"`
	WindowEnd    time.Time `json:"window_end"`
	IncludeKinds []string  `json:"include_kinds,omitempty"`
}

// FindGapsResponse mirrors outputSchema.
type FindGapsResponse struct {
	Gaps []Gap `json:"gaps"`
}

// FindGaps implementation lives in audit.go (Task 2.8).

// defaultGapKinds mirrors the contract inputSchema include_kinds.default.
var defaultGapKinds = []GapKind{
	GapMissingDecisionLogRow,
	GapMissingOutcome,
	GapMultipleOutcomes,
}

// ---------------------------------------------------------------------------
// MCP wiring — RegisterTools registers the three tools on a *mcp.Server.
// ---------------------------------------------------------------------------

// ToolNames is the canonical, ordered list of tools this handler exposes.
// Asserted in TestRegisterTools_NamesMatchContract + TestToolNames_NoMutators.
var ToolNames = []string{
	"verify_chain",
	"query_decisions",
	"find_gaps",
}

// schemas — JSON Schema fragments lifted verbatim from the contract. Kept in
// one place so tests can introspect them and the Task 2.8 implementer does
// not have to re-transcribe.
var (
	verifyChainInputSchema = json.RawMessage(`{
		"type": "object",
		"additionalProperties": false,
		"properties": {
			"mode":         {"type": "string", "enum": ["random_sample", "full_range"], "default": "random_sample"},
			"sample_size":  {"type": "integer", "minimum": 1, "maximum": 100000, "default": 1000},
			"start_row_id": {"type": "integer"},
			"end_row_id":   {"type": "integer"}
		}
	}`)
	verifyChainOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["valid", "rows_checked"],
		"additionalProperties": false,
		"properties": {
			"valid":            {"type": "boolean"},
			"rows_checked":     {"type": "integer", "minimum": 0},
			"first_bad_row_id": {"type": ["integer", "null"]},
			"last_bad_row_id":  {"type": ["integer", "null"]},
			"expected_hash":    {"type": ["string", "null"], "pattern": "^[a-f0-9]{64}$"},
			"actual_hash":      {"type": ["string", "null"], "pattern": "^[a-f0-9]{64}$"}
		}
	}`)

	queryDecisionsInputSchema = json.RawMessage(`{
		"type": "object",
		"additionalProperties": false,
		"properties": {
			"outcome_event_id": {"type": "string", "format": "uuid"},
			"department":       {"type": "string", "pattern": "^[a-z][a-z0-9_]+$"},
			"outcome":          {"type": "string", "enum": ["approve", "reject", "defer"]},
			"decision_mode":    {"type": "string", "enum": ["rule", "llm"]},
			"start_time":       {"type": "string", "format": "date-time"},
			"end_time":         {"type": "string", "format": "date-time"},
			"limit":            {"type": "integer", "minimum": 1, "maximum": 1000, "default": 100},
			"cursor":           {"type": ["string", "null"]}
		}
	}`)
	queryDecisionsOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["items"],
		"additionalProperties": false,
		"properties": {
			"items":       {"type": "array", "items": {"type": "object", "additionalProperties": true}},
			"next_cursor": {"type": ["string", "null"]}
		}
	}`)

	findGapsInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["window_start", "window_end"],
		"additionalProperties": false,
		"properties": {
			"window_start": {"type": "string", "format": "date-time"},
			"window_end":   {"type": "string", "format": "date-time"},
			"include_kinds": {
				"type": "array",
				"items": {"type": "string", "enum": ["missing_decision_log_row", "missing_outcome", "multiple_outcomes"]},
				"default": ["missing_decision_log_row", "missing_outcome", "multiple_outcomes"]
			}
		}
	}`)
	findGapsOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["gaps"],
		"additionalProperties": false,
		"properties": {
			"gaps": {
				"type": "array",
				"items": {
					"type": "object",
					"required": ["kind", "event_id"],
					"additionalProperties": false,
					"properties": {
						"kind":        {"type": "string", "enum": ["missing_decision_log_row", "missing_outcome", "multiple_outcomes"]},
						"event_id":    {"type": "string", "format": "uuid"},
						"related_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}}
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
			Name:         "verify_chain",
			Description:  "Validate the decision_log SHA256 hash chain (random sample or full range). READ-ONLY.",
			InputSchema:  verifyChainInputSchema,
			OutputSchema: verifyChainOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req VerifyChainRequest
				if len(in) > 0 && string(in) != "null" {
					if err := json.Unmarshal(in, &req); err != nil {
						return nil, err
					}
				}
				return h.VerifyChain(ctx, req)
			},
		},
		{
			Name:         "query_decisions",
			Description:  "Read decision_log rows with filters. Append-only; no mutation tools exist.",
			InputSchema:  queryDecisionsInputSchema,
			OutputSchema: queryDecisionsOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req QueryDecisionsRequest
				if len(in) > 0 && string(in) != "null" {
					if err := json.Unmarshal(in, &req); err != nil {
						return nil, err
					}
				}
				return h.QueryDecisions(ctx, req)
			},
		},
		{
			Name:         "find_gaps",
			Description:  "FR-21 audit self-check: find orphaned approval requests, missing decision_log rows, duplicate outcomes.",
			InputSchema:  findGapsInputSchema,
			OutputSchema: findGapsOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req FindGapsRequestWire
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, err
				}
				return h.FindGaps(ctx, req)
			},
		},
	}
}

// RegisterTools wires this Handler's three methods onto srv as MCP tools.
// Returns the first registration error.
func (h *Handler) RegisterTools(srv *mcp.Server) error {
	for _, t := range h.buildTools() {
		if err := srv.RegisterTool(t); err != nil {
			return err
		}
	}
	return nil
}
