// Task 2.6 implementation: replaces the RED stubs in types.go with real
// behavior. The four MCP tool handlers plus New() / Close() live here. The
// Postgres-backed store implementation lives in store_pg.go.
package pending

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
)

// ---------------------------------------------------------------------------
// New / Close
// ---------------------------------------------------------------------------

// New validates cfg, opens the Postgres-backed store, and returns a Handler.
// Tests construct Handlers directly via newTestHandler; New is only used
// from cmd/pending-mcp/main.go.
func New(cfg Config) (*Handler, error) {
	if cfg.Logger == nil {
		return nil, errors.New("pending.New: Logger is required")
	}
	if cfg.PostgresURL == "" {
		return nil, errors.New("pending.New: PostgresURL is required")
	}
	if !strings.HasPrefix(cfg.PostgresURL, "postgres://") &&
		!strings.HasPrefix(cfg.PostgresURL, "postgresql://") {
		return nil, errors.New("pending.New: PostgresURL must use postgres:// or postgresql:// scheme")
	}
	if cfg.Department == "" {
		cfg.Department = "president"
	}

	st, err := newPgStore(cfg.PostgresURL)
	if err != nil {
		return nil, fmt.Errorf("pending.New: store: %w", err)
	}
	return &Handler{
		store:  st,
		logger: cfg.Logger,
	}, nil
}

// NewWithStore wires a pre-built store (used by cmd/pending-mcp/main.go
// after it has opened its own pool for crash-recovery bookkeeping).
func NewWithStore(cfg Config, st store) (*Handler, error) {
	if cfg.Logger == nil {
		return nil, errors.New("pending.NewWithStore: Logger is required")
	}
	if st == nil {
		return nil, errors.New("pending.NewWithStore: store is required")
	}
	return &Handler{store: st, logger: cfg.Logger}, nil
}

// Close releases the underlying store.
func (h *Handler) Close() {
	if h == nil || h.store == nil {
		return
	}
	h.store.Close()
}

// logger returns h.logger or a discard-equivalent default-tagged logger when
// the Handler was constructed via the test seam (which leaves logger nil).
func (h *Handler) log() *slog.Logger {
	if h.logger == nil {
		return slog.Default()
	}
	return h.logger
}

// ---------------------------------------------------------------------------
// list_pending
// ---------------------------------------------------------------------------

func (h *Handler) ListPending(ctx context.Context, req ListPendingRequest) (ListPendingResponse, error) {
	if req.Department != "" && !departmentPattern.MatchString(req.Department) {
		return ListPendingResponse{}, fmt.Errorf("%w: department %q does not match ^[a-z][a-z0-9_]+$", ErrPendingQueryInvalid, req.Department)
	}
	var status Status
	if req.Status != "" {
		status = Status(req.Status)
		if !allStatuses[status] {
			return ListPendingResponse{}, fmt.Errorf("%w: status %q is not a valid enum value", ErrPendingQueryInvalid, req.Status)
		}
	}
	limit := req.Limit
	if limit <= 0 {
		limit = defaultListLimit
	}
	if limit > 500 {
		limit = 500
	}
	filter := ListPendingFilter{
		Department: req.Department,
		Status:     status,
		Limit:      limit,
		Cursor:     req.Cursor,
	}
	res, err := h.store.ListPending(ctx, filter)
	if err != nil {
		return ListPendingResponse{}, err
	}
	items := res.Items
	if items == nil {
		items = []PendingItem{}
	}
	return ListPendingResponse{Items: items, NextCursor: res.NextCursor}, nil
}

// ---------------------------------------------------------------------------
// claim_for_decision
// ---------------------------------------------------------------------------

func (h *Handler) ClaimForDecision(ctx context.Context, req ClaimForDecisionRequest) (ClaimForDecisionResponse, error) {
	if req.RequestEventID == "" {
		return ClaimForDecisionResponse{}, fmt.Errorf("%w: request_event_id is required", ErrPendingQueryInvalid)
	}
	newStatus := Status(req.NewStatus)
	if req.NewStatus == "" {
		newStatus = StatusAwaitingLLM
	}
	switch newStatus {
	case StatusAwaitingLLM, StatusAwaitingOperator:
		// ok
	default:
		return ClaimForDecisionResponse{}, fmt.Errorf("%w: new_status %q not in {awaiting_llm, awaiting_operator}", ErrPendingQueryInvalid, req.NewStatus)
	}
	if newStatus == StatusAwaitingOperator && (req.OperatorDeadline == nil || req.OperatorDeadline.IsZero()) {
		return ClaimForDecisionResponse{}, fmt.Errorf("%w: operator_deadline is required when new_status=awaiting_operator", ErrPendingInvalidTransition)
	}

	claim := ClaimRequest{
		RequestEventID:   req.RequestEventID,
		NewStatus:        newStatus,
		OperatorDeadline: req.OperatorDeadline,
		IdempotencyKey:   req.IdempotencyKey,
	}
	res, err := h.store.ClaimForDecision(ctx, claim)
	if err != nil {
		return ClaimForDecisionResponse{}, err
	}
	return ClaimForDecisionResponse{
		PendingApprovalID: res.PendingApprovalID,
		ClaimedAt:         res.ClaimedAt,
	}, nil
}

// ---------------------------------------------------------------------------
// record_decision
// ---------------------------------------------------------------------------

func (h *Handler) RecordDecision(ctx context.Context, req RecordDecisionReq) (RecordDecisionResp, error) {
	if req.PendingApprovalID == "" {
		return RecordDecisionResp{}, fmt.Errorf("%w: pending_approval_id is required", ErrPendingQueryInvalid)
	}
	outcome := Outcome(req.Outcome)
	if !allOutcomes[outcome] {
		return RecordDecisionResp{}, fmt.Errorf("%w: outcome %q not in {approve, reject, defer}", ErrPendingQueryInvalid, req.Outcome)
	}
	mode := DecisionMode(req.DecisionMode)
	if !allDecisionModes[mode] {
		return RecordDecisionResp{}, fmt.Errorf("%w: decision_mode %q not in {rule, llm}", ErrPendingQueryInvalid, req.DecisionMode)
	}
	// Field exclusivity: rule→rule_id required; llm→model + confidence required.
	switch mode {
	case DecisionModeRule:
		if req.RuleID == "" {
			return RecordDecisionResp{}, fmt.Errorf("%w: decision_mode=rule requires rule_id", ErrPendingQueryInvalid)
		}
	case DecisionModeLLM:
		if req.Model == "" {
			return RecordDecisionResp{}, fmt.Errorf("%w: decision_mode=llm requires model", ErrPendingQueryInvalid)
		}
		if req.Confidence == nil {
			return RecordDecisionResp{}, fmt.Errorf("%w: decision_mode=llm requires confidence", ErrPendingQueryInvalid)
		}
	}

	rationale := req.Rationale
	if len(rationale) > maxRationaleChars {
		rationale = rationale[:maxRationaleChars]
	}

	storeReq := RecordDecisionRequest{
		PendingApprovalID: req.PendingApprovalID,
		Outcome:           outcome,
		DecisionMode:      mode,
		Rationale:         rationale,
		Confidence:        req.Confidence,
		Model:             req.Model,
		RuleID:            req.RuleID,
		Director:          req.Director,
		OutcomeEventID:    req.OutcomeEventID,
		IdempotencyKey:    req.IdempotencyKey,
	}
	res, err := h.store.RecordDecision(ctx, storeReq)
	if err != nil {
		return RecordDecisionResp{}, err
	}
	return RecordDecisionResp{
		DecisionLogID: res.DecisionLogID,
		RowHash:       res.RowHash,
		RecordedAt:    res.RecordedAt,
	}, nil
}

// ---------------------------------------------------------------------------
// expire_overdue
// ---------------------------------------------------------------------------

func (h *Handler) ExpireOverdue(ctx context.Context, req ExpireOverdueRequest) (ExpireOverdueResponse, error) {
	maxBatch := req.MaxBatch
	if maxBatch <= 0 {
		maxBatch = defaultExpireMaxBatch
	}
	if maxBatch > 1000 {
		maxBatch = 1000
	}
	storeReq := ExpireRequest{
		Now:      req.Now,
		MaxBatch: maxBatch,
	}
	res, err := h.store.ExpireOverdue(ctx, storeReq)
	if err != nil {
		return ExpireOverdueResponse{}, err
	}
	expired := res.Expired
	if expired == nil {
		expired = []ExpiredItem{}
	}
	return ExpireOverdueResponse{Expired: expired}, nil
}
