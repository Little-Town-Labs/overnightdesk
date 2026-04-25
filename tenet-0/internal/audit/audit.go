package audit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"regexp"

	"github.com/overnightdesk/tenet-0/internal/shared/hashchain"
)

// departmentPattern mirrors the contract inputSchema regex.
var departmentPattern = regexp.MustCompile(`^[a-z][a-z0-9_]+$`)

// New constructs a production Handler. The pgx-backed store wiring is a
// Phase 2 follow-up (rate limit interrupted the original Task 2.8 agent);
// this stub surfaces loudly so a misconfigured deploy fails fast.
func New(cfg Config) (*Handler, error) {
	if cfg.Logger == nil {
		return nil, errors.New("audit.New: Logger is required")
	}
	if cfg.PostgresURL == "" {
		return nil, errors.New("audit.New: PostgresURL is required")
	}
	return nil, errors.New("audit.New: pg store wiring pending (Phase 2 follow-up)")
}

// Close releases the underlying store. Safe to call on a nil receiver.
func (h *Handler) Close() {
	if h == nil {
		return
	}
	// Real pool close arrives with pg store wiring.
}

// logger returns a non-nil slog.Logger even when Handler was constructed
// through the test seam without one.
func (h *Handler) log() *slog.Logger {
	if h.logger != nil {
		return h.logger
	}
	return slog.Default()
}

// =============================================================================
// verify_chain
// =============================================================================

// VerifyChain validates the decision_log SHA256 hash chain. Corruption is
// reported in the response body (Valid=false + hash fields) rather than as
// an error, per contract; transport errors surface as errors.
func (h *Handler) VerifyChain(ctx context.Context, req VerifyChainRequest) (VerifyChainResponse, error) {
	mode := req.Mode
	if mode == "" {
		mode = VerifyModeRandomSample
	}

	switch mode {
	case VerifyModeRandomSample:
		sampleSize := req.SampleSize
		if sampleSize == 0 {
			sampleSize = defaultSampleSize
		}
		if sampleSize < 1 || sampleSize > maxSampleSize {
			return VerifyChainResponse{}, fmt.Errorf("%w: sample_size must be 1..%d", ErrAuditQueryInvalid, maxSampleSize)
		}
		rows, err := h.store.FetchRowsForVerify(ctx, mode, sampleSize, nil, nil)
		if err != nil {
			return VerifyChainResponse{}, err
		}
		return h.verifyRows(rows), nil

	case VerifyModeFullRange:
		if req.StartRowID == nil || req.EndRowID == nil {
			return VerifyChainResponse{}, fmt.Errorf("%w: full_range mode requires both start_row_id and end_row_id", ErrAuditQueryInvalid)
		}
		rows, err := h.store.FetchRowsForVerify(ctx, mode, 0, req.StartRowID, req.EndRowID)
		if err != nil {
			return VerifyChainResponse{}, err
		}
		return h.verifyRows(rows), nil

	default:
		return VerifyChainResponse{}, fmt.Errorf("%w: unknown mode %q", ErrAuditQueryInvalid, mode)
	}
}

// verifyRows runs the injected chainVerifier and shapes the response.
// On a clean chain all "bad row" fields stay nil. On corruption the fields
// are populated and Valid=false, but no error is returned.
func (h *Handler) verifyRows(rows []ChainRow) VerifyChainResponse {
	firstBad, err := h.verifier.Verify(rows)
	if err == nil && firstBad < 0 {
		return VerifyChainResponse{Valid: true, RowsChecked: len(rows)}
	}
	// Corruption detected. Map firstBad to row index as int64; decision_log's
	// chain_seq_no column (data-model addendum from Task 2.7 decisions) gives
	// an integer ID per contract. For now we surface the slice index — the
	// pg store wiring (pending) will swap in real chain_seq_no values.
	idx := int64(firstBad)
	resp := VerifyChainResponse{
		Valid:         false,
		RowsChecked:   len(rows),
		FirstBadRowID: &idx,
		LastBadRowID:  &idx,
	}
	// Compute expected vs actual hashes for the corrupted row.
	if firstBad >= 0 && firstBad < len(rows) {
		current := rows[firstBad]
		actual := hex.EncodeToString(current.RowHash)
		resp.ActualHash = &actual

		// Expected = SHA256(prev.RowHash || current.CanonicalPayload)
		var prevHash []byte
		if firstBad > 0 {
			prevHash = rows[firstBad-1].RowHash
		} else {
			prevHash = current.PrevHash
		}
		sum := sha256.Sum256(append(append([]byte{}, prevHash...), current.CanonicalPayload...))
		expected := hex.EncodeToString(sum[:])
		resp.ExpectedHash = &expected
	}
	h.log().Warn("audit: chain corruption detected",
		slog.Int("first_bad_idx", firstBad),
		slog.Int("rows_checked", len(rows)),
		slog.Bool("is_hashchain_corrupt_err", errors.Is(err, hashchain.ErrCorrupt)),
	)
	return resp
}

// =============================================================================
// query_decisions
// =============================================================================

// QueryDecisions validates inputs and delegates to the store. Pagination
// and filter propagation are the store's responsibility.
func (h *Handler) QueryDecisions(ctx context.Context, req QueryDecisionsRequest) (QueryDecisionsResponse, error) {
	if req.Department != "" && !departmentPattern.MatchString(req.Department) {
		return QueryDecisionsResponse{}, fmt.Errorf("%w: invalid department", ErrAuditQueryInvalid)
	}
	var outcome DecisionOutcome
	if req.Outcome != "" {
		switch DecisionOutcome(req.Outcome) {
		case OutcomeApprove, OutcomeReject, OutcomeDefer:
			outcome = DecisionOutcome(req.Outcome)
		default:
			return QueryDecisionsResponse{}, fmt.Errorf("%w: invalid outcome %q", ErrAuditQueryInvalid, req.Outcome)
		}
	}
	var mode DecisionMode
	if req.DecisionMode != "" {
		switch DecisionMode(req.DecisionMode) {
		case DecisionModeRule, DecisionModeLLM:
			mode = DecisionMode(req.DecisionMode)
		default:
			return QueryDecisionsResponse{}, fmt.Errorf("%w: invalid decision_mode %q", ErrAuditQueryInvalid, req.DecisionMode)
		}
	}
	if req.StartTime != nil && req.EndTime != nil && req.EndTime.Before(*req.StartTime) {
		return QueryDecisionsResponse{}, fmt.Errorf("%w: end_time before start_time", ErrAuditQueryInvalid)
	}
	limit := req.Limit
	if limit == 0 {
		limit = defaultQueryLimit
	}
	if limit < 1 || limit > maxQueryLimit {
		return QueryDecisionsResponse{}, fmt.Errorf("%w: limit must be 1..%d", ErrAuditQueryInvalid, maxQueryLimit)
	}

	filter := QueryDecisionsFilter{
		OutcomeEventID: req.OutcomeEventID,
		Department:     req.Department,
		Outcome:        outcome,
		DecisionMode:   mode,
		StartTime:      req.StartTime,
		EndTime:        req.EndTime,
		Limit:          limit,
		Cursor:         req.Cursor,
	}
	res, err := h.store.QueryDecisions(ctx, filter)
	if err != nil {
		return QueryDecisionsResponse{}, err
	}
	items := res.Items
	if items == nil {
		items = []DecisionRow{}
	}
	return QueryDecisionsResponse{Items: items, NextCursor: res.NextCursor}, nil
}

// =============================================================================
// find_gaps
// =============================================================================

// FindGaps parses the wire request and delegates to the store. Default
// include_kinds is applied here so the store sees a concrete list.
func (h *Handler) FindGaps(ctx context.Context, req FindGapsRequestWire) (FindGapsResponse, error) {
	if req.WindowEnd.Before(req.WindowStart) {
		return FindGapsResponse{}, fmt.Errorf("%w: window_end before window_start", ErrAuditQueryInvalid)
	}

	kinds := make([]GapKind, 0, len(req.IncludeKinds))
	if len(req.IncludeKinds) == 0 {
		kinds = append(kinds, defaultGapKinds...)
	} else {
		for _, k := range req.IncludeKinds {
			switch GapKind(k) {
			case GapMissingDecisionLogRow, GapMissingOutcome, GapMultipleOutcomes:
				kinds = append(kinds, GapKind(k))
			default:
				return FindGapsResponse{}, fmt.Errorf("%w: invalid include_kinds entry %q", ErrAuditQueryInvalid, k)
			}
		}
	}

	res, err := h.store.FindGaps(ctx, FindGapsRequest{
		WindowStart:  req.WindowStart,
		WindowEnd:    req.WindowEnd,
		IncludeKinds: kinds,
	})
	if err != nil {
		return FindGapsResponse{}, err
	}
	gaps := res.Gaps
	if gaps == nil {
		gaps = []Gap{}
	}
	return FindGapsResponse{Gaps: gaps}, nil
}
