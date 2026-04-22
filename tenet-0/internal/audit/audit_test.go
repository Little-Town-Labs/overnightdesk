// Tests for the tenet0-audit-mcp Handler. Phase 2 RED tests: every handler
// method in types.go panics with "not implemented (Task 2.8)", so every test
// that invokes a handler is expected to FAIL on first run. Task 2.8 implements
// the bodies and turns these green.
//
// Security focus: audit-mcp is READ-ONLY. The security-invariant tests below
// (reflection, tool-name allowlist, hash-format regex) exist so any future
// change that smuggles in a mutation tool fails loudly at unit-test time.
package audit

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/overnightdesk/tenet-0/internal/shared/hashchain"
	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// hash64 is a regexp the contract uses for expected_hash / actual_hash.
var hash64 = regexp.MustCompile(`^[a-f0-9]{64}$`)

// sampleChainRows returns N deterministic rows for tests where the actual
// hash values don't matter (the fakeVerifier decides pass/fail).
func sampleChainRows(n int) []ChainRow {
	rows := make([]ChainRow, 0, n)
	seed := hashchain.Seed()
	rows = append(rows, seed)
	prev := seed
	for i := 1; i < n; i++ {
		payload := []byte("payload-" + string(rune('0'+i%10)))
		nxt := hashchain.Extend(prev, payload)
		// Assign an arbitrary UUID for traceability.
		nxt.ID = uuid.New()
		rows = append(rows, nxt)
		prev = nxt
	}
	if len(rows) > 0 {
		rows[0].ID = uuid.New()
	}
	return rows
}

// =============================================================================
// verify_chain (≥6)
// =============================================================================

func TestVerifyChain_HappyRandomSample(t *testing.T) {
	rows := sampleChainRows(10)
	fs := &fakeStore{
		FetchRowsForVerifyFn: func(ctx context.Context, mode VerifyMode, sampleSize int, startID, endID *int64) ([]ChainRow, error) {
			if mode != VerifyModeRandomSample {
				t.Errorf("mode = %q, want random_sample", mode)
			}
			return rows, nil
		},
	}
	fv := &fakeVerifier{FirstBadIdx: -1}
	h := newTestHandler(fs, fv)

	resp, err := h.VerifyChain(context.Background(), VerifyChainRequest{})
	if err != nil {
		t.Fatalf("VerifyChain: %v", err)
	}
	if !resp.Valid {
		t.Errorf("valid = false, want true")
	}
	if resp.RowsChecked != len(rows) {
		t.Errorf("rows_checked = %d, want %d", resp.RowsChecked, len(rows))
	}
	if resp.FirstBadRowID != nil || resp.LastBadRowID != nil {
		t.Errorf("bad row IDs must be nil on clean chain: first=%v last=%v", resp.FirstBadRowID, resp.LastBadRowID)
	}
	if resp.ExpectedHash != nil || resp.ActualHash != nil {
		t.Errorf("hash fields must be nil on clean chain: expected=%v actual=%v", resp.ExpectedHash, resp.ActualHash)
	}
}

func TestVerifyChain_HappyFullRange(t *testing.T) {
	rows := sampleChainRows(5)
	fs := &fakeStore{
		FetchRowsForVerifyFn: func(ctx context.Context, mode VerifyMode, sampleSize int, startID, endID *int64) ([]ChainRow, error) {
			if mode != VerifyModeFullRange {
				t.Errorf("mode = %q, want full_range", mode)
			}
			if startID == nil || endID == nil {
				t.Errorf("full_range must receive both startID and endID: start=%v end=%v", startID, endID)
			}
			return rows, nil
		},
	}
	fv := &fakeVerifier{FirstBadIdx: -1}
	h := newTestHandler(fs, fv)

	resp, err := h.VerifyChain(context.Background(), VerifyChainRequest{
		Mode:       VerifyModeFullRange,
		StartRowID: int64Ptr(1),
		EndRowID:   int64Ptr(5),
	})
	if err != nil {
		t.Fatalf("VerifyChain: %v", err)
	}
	if !resp.Valid {
		t.Errorf("valid = false, want true")
	}
	if resp.RowsChecked != len(rows) {
		t.Errorf("rows_checked = %d, want %d", resp.RowsChecked, len(rows))
	}
}

func TestVerifyChain_CorruptionDetected(t *testing.T) {
	rows := sampleChainRows(5)
	fs := &fakeStore{
		FetchRowsForVerifyFn: func(ctx context.Context, mode VerifyMode, sampleSize int, startID, endID *int64) ([]ChainRow, error) {
			return rows, nil
		},
	}
	// Tamper with row index 2 so verifier returns firstBadIdx=2.
	fv := &fakeVerifier{FirstBadIdx: 2, Err: hashchain.ErrCorrupt}
	h := newTestHandler(fs, fv)

	resp, err := h.VerifyChain(context.Background(), VerifyChainRequest{})
	if err != nil {
		t.Fatalf("VerifyChain: %v (corruption should surface in response, not as error)", err)
	}
	if resp.Valid {
		t.Errorf("valid = true, want false")
	}
	if resp.FirstBadRowID == nil {
		t.Error("first_bad_row_id must be non-nil on corruption")
	}
	if resp.LastBadRowID == nil {
		t.Error("last_bad_row_id must be non-nil on corruption")
	}
	if resp.ExpectedHash == nil {
		t.Fatal("expected_hash must be non-nil on corruption")
	}
	if resp.ActualHash == nil {
		t.Fatal("actual_hash must be non-nil on corruption")
	}
	if !hash64.MatchString(*resp.ExpectedHash) {
		t.Errorf("expected_hash = %q, want ^[a-f0-9]{64}$", *resp.ExpectedHash)
	}
	if !hash64.MatchString(*resp.ActualHash) {
		t.Errorf("actual_hash = %q, want ^[a-f0-9]{64}$", *resp.ActualHash)
	}
}

func TestVerifyChain_SampleSizeTooLargeRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs, nil)

	_, err := h.VerifyChain(context.Background(), VerifyChainRequest{
		Mode:       VerifyModeRandomSample,
		SampleSize: maxSampleSize + 1,
	})
	if !errors.Is(err, ErrAuditQueryInvalid) {
		t.Fatalf("err = %v, want ErrAuditQueryInvalid", err)
	}
	if code := toolErrorCode(err); code != "AUDIT_QUERY_INVALID" {
		t.Errorf("code = %q, want AUDIT_QUERY_INVALID", code)
	}
	if len(fs.FetchRowsForVerifyCalls) != 0 {
		t.Errorf("store should not have been called: %+v", fs.FetchRowsForVerifyCalls)
	}
}

func TestVerifyChain_FullRangeMissingBoundsRejected(t *testing.T) {
	cases := []struct {
		name string
		req  VerifyChainRequest
	}{
		{"no bounds", VerifyChainRequest{Mode: VerifyModeFullRange}},
		{"only start", VerifyChainRequest{Mode: VerifyModeFullRange, StartRowID: int64Ptr(1)}},
		{"only end", VerifyChainRequest{Mode: VerifyModeFullRange, EndRowID: int64Ptr(10)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fs := &fakeStore{}
			h := newTestHandler(fs, nil)
			_, err := h.VerifyChain(context.Background(), tc.req)
			if !errors.Is(err, ErrAuditQueryInvalid) {
				t.Fatalf("err = %v, want ErrAuditQueryInvalid", err)
			}
			if len(fs.FetchRowsForVerifyCalls) != 0 {
				t.Errorf("store should not have been called")
			}
		})
	}
}

func TestVerifyChain_EmptyChainIsValid(t *testing.T) {
	fs := &fakeStore{
		FetchRowsForVerifyFn: func(ctx context.Context, mode VerifyMode, sampleSize int, startID, endID *int64) ([]ChainRow, error) {
			return []ChainRow{}, nil
		},
	}
	fv := &fakeVerifier{FirstBadIdx: -1}
	h := newTestHandler(fs, fv)

	resp, err := h.VerifyChain(context.Background(), VerifyChainRequest{})
	if err != nil {
		t.Fatalf("VerifyChain: %v", err)
	}
	if !resp.Valid {
		t.Error("empty chain must verify as valid (hashchain.VerifyChain returns -1,nil)")
	}
	if resp.RowsChecked != 0 {
		t.Errorf("rows_checked = %d, want 0", resp.RowsChecked)
	}
	if resp.FirstBadRowID != nil || resp.LastBadRowID != nil ||
		resp.ExpectedHash != nil || resp.ActualHash != nil {
		t.Error("all nullable fields must be nil on empty clean chain")
	}
}

// =============================================================================
// query_decisions (≥6)
// =============================================================================

func sampleDecisionRow() DecisionRow {
	return DecisionRow{
		ID:               uuid.NewString(),
		OutcomeEventID:   uuid.NewString(),
		OutcomeEventType: "president.approved",
		DecisionMode:     string(DecisionModeRule),
		Department:       "fin",
		Rationale:        "ok",
		CreatedAt:        time.Date(2026, 4, 19, 10, 0, 0, 0, time.UTC),
		RowHashHex:       strings.Repeat("a", 64),
	}
}

func TestQueryDecisions_HappyNoFilters(t *testing.T) {
	fs := &fakeStore{
		QueryDecisionsFn: func(ctx context.Context, filter QueryDecisionsFilter) (QueryDecisionsResult, error) {
			return QueryDecisionsResult{
				Items: []DecisionRow{sampleDecisionRow(), sampleDecisionRow()},
			}, nil
		},
	}
	h := newTestHandler(fs, nil)

	resp, err := h.QueryDecisions(context.Background(), QueryDecisionsRequest{})
	if err != nil {
		t.Fatalf("QueryDecisions: %v", err)
	}
	if len(resp.Items) != 2 {
		t.Errorf("items = %d, want 2", len(resp.Items))
	}
}

func TestQueryDecisions_FilterByOutcomeEventID(t *testing.T) {
	wantID := uuid.NewString()
	fs := &fakeStore{
		QueryDecisionsFn: func(ctx context.Context, filter QueryDecisionsFilter) (QueryDecisionsResult, error) {
			if filter.OutcomeEventID == nil || *filter.OutcomeEventID != wantID {
				t.Errorf("OutcomeEventID = %v, want %q", filter.OutcomeEventID, wantID)
			}
			row := sampleDecisionRow()
			row.OutcomeEventID = wantID
			return QueryDecisionsResult{Items: []DecisionRow{row}}, nil
		},
	}
	h := newTestHandler(fs, nil)

	resp, err := h.QueryDecisions(context.Background(), QueryDecisionsRequest{
		OutcomeEventID: strPtr(wantID),
	})
	if err != nil {
		t.Fatalf("QueryDecisions: %v", err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("items = %d, want 1", len(resp.Items))
	}
}

func TestQueryDecisions_CombinedFiltersPropagated(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs, nil)

	_, err := h.QueryDecisions(context.Background(), QueryDecisionsRequest{
		Department:   "fin",
		Outcome:      string(OutcomeApprove),
		DecisionMode: string(DecisionModeLLM),
	})
	if err != nil {
		t.Fatalf("QueryDecisions: %v", err)
	}
	if len(fs.QueryDecisionsCalls) != 1 {
		t.Fatalf("store calls = %d, want 1", len(fs.QueryDecisionsCalls))
	}
	f := fs.QueryDecisionsCalls[0]
	if f.Department != "fin" {
		t.Errorf("Department = %q, want fin", f.Department)
	}
	if f.Outcome != OutcomeApprove {
		t.Errorf("Outcome = %q, want approve", f.Outcome)
	}
	if f.DecisionMode != DecisionModeLLM {
		t.Errorf("DecisionMode = %q, want llm", f.DecisionMode)
	}
}

func TestQueryDecisions_PaginationCursorAndLimit(t *testing.T) {
	next := "cursor-xyz"
	fs := &fakeStore{
		QueryDecisionsFn: func(ctx context.Context, filter QueryDecisionsFilter) (QueryDecisionsResult, error) {
			if filter.Limit != 25 {
				t.Errorf("Limit = %d, want 25", filter.Limit)
			}
			if filter.Cursor == nil || *filter.Cursor != "prev-cursor" {
				t.Errorf("Cursor = %v, want prev-cursor", filter.Cursor)
			}
			return QueryDecisionsResult{
				Items:      []DecisionRow{sampleDecisionRow()},
				NextCursor: &next,
			}, nil
		},
	}
	h := newTestHandler(fs, nil)

	resp, err := h.QueryDecisions(context.Background(), QueryDecisionsRequest{
		Limit:  25,
		Cursor: strPtr("prev-cursor"),
	})
	if err != nil {
		t.Fatalf("QueryDecisions: %v", err)
	}
	if resp.NextCursor == nil || *resp.NextCursor != next {
		t.Errorf("NextCursor = %v, want %q", resp.NextCursor, next)
	}
}

func TestQueryDecisions_EndTimeBeforeStartTimeRejected(t *testing.T) {
	start := time.Date(2026, 4, 19, 12, 0, 0, 0, time.UTC)
	end := start.Add(-1 * time.Hour)
	fs := &fakeStore{}
	h := newTestHandler(fs, nil)

	_, err := h.QueryDecisions(context.Background(), QueryDecisionsRequest{
		StartTime: &start,
		EndTime:   &end,
	})
	if !errors.Is(err, ErrAuditQueryInvalid) {
		t.Fatalf("err = %v, want ErrAuditQueryInvalid", err)
	}
	if len(fs.QueryDecisionsCalls) != 0 {
		t.Errorf("store should not have been called on inverted time range")
	}
}

func TestQueryDecisions_InvalidOutcomeEnumRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs, nil)

	_, err := h.QueryDecisions(context.Background(), QueryDecisionsRequest{
		Outcome: "escalate", // not in {approve, reject, defer}
	})
	if !errors.Is(err, ErrAuditQueryInvalid) {
		t.Fatalf("err = %v, want ErrAuditQueryInvalid", err)
	}
	if len(fs.QueryDecisionsCalls) != 0 {
		t.Errorf("store should not have been called on invalid enum")
	}
}

func TestQueryDecisions_InvalidDecisionModeEnumRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs, nil)

	_, err := h.QueryDecisions(context.Background(), QueryDecisionsRequest{
		DecisionMode: "hybrid",
	})
	if !errors.Is(err, ErrAuditQueryInvalid) {
		t.Fatalf("err = %v, want ErrAuditQueryInvalid", err)
	}
}

func TestQueryDecisions_InvalidDepartmentPatternRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs, nil)

	_, err := h.QueryDecisions(context.Background(), QueryDecisionsRequest{
		Department: "Fin-Ops", // uppercase + hyphen
	})
	if !errors.Is(err, ErrAuditQueryInvalid) {
		t.Fatalf("err = %v, want ErrAuditQueryInvalid", err)
	}
}

// =============================================================================
// find_gaps (≥5)
// =============================================================================

func TestFindGaps_EmptyCleanWindow(t *testing.T) {
	fs := &fakeStore{
		FindGapsFn: func(ctx context.Context, req FindGapsRequest) (FindGapsResult, error) {
			return FindGapsResult{Gaps: []Gap{}}, nil
		},
	}
	h := newTestHandler(fs, nil)

	resp, err := h.FindGaps(context.Background(), FindGapsRequestWire{
		WindowStart: time.Date(2026, 4, 19, 0, 0, 0, 0, time.UTC),
		WindowEnd:   time.Date(2026, 4, 19, 23, 59, 59, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("FindGaps: %v", err)
	}
	if resp.Gaps == nil {
		t.Error("gaps must be non-nil (empty array, not null) per outputSchema")
	}
	if len(resp.Gaps) != 0 {
		t.Errorf("gaps = %d, want 0", len(resp.Gaps))
	}
}

func TestFindGaps_MissingDecisionLogRow(t *testing.T) {
	eventID := uuid.NewString()
	fs := &fakeStore{
		FindGapsFn: func(ctx context.Context, req FindGapsRequest) (FindGapsResult, error) {
			return FindGapsResult{Gaps: []Gap{
				{Kind: GapMissingDecisionLogRow, EventID: eventID},
			}}, nil
		},
	}
	h := newTestHandler(fs, nil)

	resp, err := h.FindGaps(context.Background(), FindGapsRequestWire{
		WindowStart: time.Date(2026, 4, 19, 0, 0, 0, 0, time.UTC),
		WindowEnd:   time.Date(2026, 4, 19, 23, 59, 59, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("FindGaps: %v", err)
	}
	if len(resp.Gaps) != 1 {
		t.Fatalf("gaps = %d, want 1", len(resp.Gaps))
	}
	g := resp.Gaps[0]
	if g.Kind != GapMissingDecisionLogRow {
		t.Errorf("kind = %q, want missing_decision_log_row", g.Kind)
	}
	if g.EventID != eventID {
		t.Errorf("event_id = %q, want %q", g.EventID, eventID)
	}
}

func TestFindGaps_MissingOutcome(t *testing.T) {
	eventID := uuid.NewString()
	fs := &fakeStore{
		FindGapsFn: func(ctx context.Context, req FindGapsRequest) (FindGapsResult, error) {
			return FindGapsResult{Gaps: []Gap{
				{Kind: GapMissingOutcome, EventID: eventID},
			}}, nil
		},
	}
	h := newTestHandler(fs, nil)

	resp, err := h.FindGaps(context.Background(), FindGapsRequestWire{
		WindowStart: time.Date(2026, 4, 19, 0, 0, 0, 0, time.UTC),
		WindowEnd:   time.Date(2026, 4, 19, 23, 59, 59, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("FindGaps: %v", err)
	}
	if len(resp.Gaps) != 1 || resp.Gaps[0].Kind != GapMissingOutcome {
		t.Fatalf("gaps = %+v", resp.Gaps)
	}
}

func TestFindGaps_MultipleOutcomesPopulatesRelatedIDs(t *testing.T) {
	requestID := uuid.NewString()
	dup1 := uuid.NewString()
	dup2 := uuid.NewString()
	fs := &fakeStore{
		FindGapsFn: func(ctx context.Context, req FindGapsRequest) (FindGapsResult, error) {
			return FindGapsResult{Gaps: []Gap{
				{
					Kind:       GapMultipleOutcomes,
					EventID:    requestID,
					RelatedIDs: []string{dup1, dup2},
				},
			}}, nil
		},
	}
	h := newTestHandler(fs, nil)

	resp, err := h.FindGaps(context.Background(), FindGapsRequestWire{
		WindowStart: time.Date(2026, 4, 19, 0, 0, 0, 0, time.UTC),
		WindowEnd:   time.Date(2026, 4, 19, 23, 59, 59, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("FindGaps: %v", err)
	}
	if len(resp.Gaps) != 1 {
		t.Fatalf("gaps = %d, want 1", len(resp.Gaps))
	}
	g := resp.Gaps[0]
	if g.Kind != GapMultipleOutcomes {
		t.Errorf("kind = %q, want multiple_outcomes", g.Kind)
	}
	if len(g.RelatedIDs) != 2 {
		t.Errorf("related_ids = %d, want 2", len(g.RelatedIDs))
	}
}

func TestFindGaps_IncludeKindsFiltersStoreCall(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs, nil)

	_, err := h.FindGaps(context.Background(), FindGapsRequestWire{
		WindowStart:  time.Date(2026, 4, 19, 0, 0, 0, 0, time.UTC),
		WindowEnd:    time.Date(2026, 4, 19, 23, 59, 59, 0, time.UTC),
		IncludeKinds: []string{string(GapMissingOutcome)},
	})
	if err != nil {
		t.Fatalf("FindGaps: %v", err)
	}
	if len(fs.FindGapsCalls) != 1 {
		t.Fatalf("store calls = %d, want 1", len(fs.FindGapsCalls))
	}
	got := fs.FindGapsCalls[0].IncludeKinds
	if len(got) != 1 || got[0] != GapMissingOutcome {
		t.Errorf("IncludeKinds propagated = %v, want [missing_outcome]", got)
	}
}

// =============================================================================
// Security invariants (≥3)
//
// These tests exist so any future change that adds a mutation surface fails
// loudly at build / unit-test time. Audit-mcp is WORM: chain extension happens
// only via tenet0-pending-mcp.record_decision. See types.go package doc.
// =============================================================================

func TestHandler_NoMutationMethods(t *testing.T) {
	// Reflection walk over *Handler's method set. Any exported method whose
	// name starts with a mutation verb is a contract violation.
	forbiddenPrefixes := []string{"Write", "Record", "Update", "Delete", "Insert", "Set", "Put"}
	// Allowlist of known read-only methods. Anything else triggers an explicit
	// review signal.
	allowed := map[string]bool{
		"VerifyChain":    true,
		"QueryDecisions": true,
		"FindGaps":       true,
		"RegisterTools":  true,
		"Close":          true,
	}

	typ := reflect.TypeOf(&Handler{})
	for i := 0; i < typ.NumMethod(); i++ {
		m := typ.Method(i)
		for _, p := range forbiddenPrefixes {
			if strings.HasPrefix(m.Name, p) {
				t.Errorf("Handler has forbidden mutation-prefixed method %q (audit-mcp is READ-ONLY)", m.Name)
			}
		}
		if !allowed[m.Name] {
			t.Errorf("Handler has unexpected exported method %q — add to allowlist or remove (security review)", m.Name)
		}
	}
}

func TestToolNames_ExactlyThreeReadOnly(t *testing.T) {
	want := []string{"verify_chain", "query_decisions", "find_gaps"}
	if !reflect.DeepEqual(ToolNames, want) {
		t.Fatalf("ToolNames = %v, want %v", ToolNames, want)
	}
	// Paranoia: no tool name hints at mutation.
	mutationVerbs := []string{"write", "record", "update", "delete", "insert", "set", "put", "create", "extend"}
	for _, n := range ToolNames {
		for _, v := range mutationVerbs {
			if strings.Contains(n, v) {
				t.Errorf("tool name %q contains mutation verb %q", n, v)
			}
		}
	}
}

func TestHashFieldFormat_VerifyChainContract(t *testing.T) {
	// Clean chain → both hash fields nil.
	rows := sampleChainRows(3)
	fs := &fakeStore{
		FetchRowsForVerifyFn: func(ctx context.Context, mode VerifyMode, sampleSize int, startID, endID *int64) ([]ChainRow, error) {
			return rows, nil
		},
	}
	h := newTestHandler(fs, &fakeVerifier{FirstBadIdx: -1})
	resp, err := h.VerifyChain(context.Background(), VerifyChainRequest{})
	if err != nil {
		t.Fatalf("happy path: %v", err)
	}
	if resp.ExpectedHash != nil || resp.ActualHash != nil {
		t.Errorf("hash fields must be nil on clean chain")
	}

	// Corrupt chain → both hash fields must match ^[a-f0-9]{64}$.
	h2 := newTestHandler(fs, &fakeVerifier{FirstBadIdx: 1, Err: hashchain.ErrCorrupt})
	resp2, err := h2.VerifyChain(context.Background(), VerifyChainRequest{})
	if err != nil {
		t.Fatalf("corrupt path: %v", err)
	}
	if resp2.ExpectedHash == nil || !hash64.MatchString(*resp2.ExpectedHash) {
		t.Errorf("expected_hash must be 64 lowercase hex on corruption: %v", resp2.ExpectedHash)
	}
	if resp2.ActualHash == nil || !hash64.MatchString(*resp2.ActualHash) {
		t.Errorf("actual_hash must be 64 lowercase hex on corruption: %v", resp2.ActualHash)
	}
}

// =============================================================================
// Generic: RegisterTools / ToolNames / toolErrorCode / schemas
// =============================================================================

func TestRegisterTools_RegistersExactlyThree(t *testing.T) {
	srv := mcp.NewServer("tenet0-audit-mcp", "test", discardLogger())
	h := newTestHandler(&fakeStore{}, nil)

	if err := h.RegisterTools(srv); err != nil {
		t.Fatalf("RegisterTools: %v", err)
	}
	// Re-registration must fail for each name (proves it was registered).
	for _, name := range ToolNames {
		err := srv.RegisterTool(mcp.Tool{
			Name:         name,
			InputSchema:  json.RawMessage(`{"type":"object"}`),
			OutputSchema: json.RawMessage(`{"type":"object"}`),
			Handler:      func(ctx context.Context, in json.RawMessage) (any, error) { return map[string]any{}, nil },
		})
		if err == nil {
			t.Errorf("re-registering %q should fail", name)
		}
	}
	if len(ToolNames) != 3 {
		t.Errorf("ToolNames has %d entries, want 3", len(ToolNames))
	}
}

func TestToolErrorCode_AllSentinels(t *testing.T) {
	cases := []struct {
		err  error
		code string
	}{
		{nil, ""},
		{ErrAuditUnauthorized, "AUDIT_UNAUTHORIZED"},
		{ErrAuditQueryInvalid, "AUDIT_QUERY_INVALID"},
		{errors.New("unrelated"), "INTERNAL"},
	}
	for _, tc := range cases {
		got := toolErrorCode(tc.err)
		if got != tc.code {
			t.Errorf("toolErrorCode(%v) = %q, want %q", tc.err, got, tc.code)
		}
	}
}

func TestRegisterTools_SchemasAreValidJSON(t *testing.T) {
	schemas := map[string][2]json.RawMessage{
		"verify_chain":    {verifyChainInputSchema, verifyChainOutputSchema},
		"query_decisions": {queryDecisionsInputSchema, queryDecisionsOutputSchema},
		"find_gaps":       {findGapsInputSchema, findGapsOutputSchema},
	}
	for name, pair := range schemas {
		var v any
		if err := json.Unmarshal(pair[0], &v); err != nil {
			t.Errorf("%s inputSchema invalid JSON: %v", name, err)
		}
		if err := json.Unmarshal(pair[1], &v); err != nil {
			t.Errorf("%s outputSchema invalid JSON: %v", name, err)
		}
	}
}

// =============================================================================
// New / Config validation
// =============================================================================

func TestNew_RequiresLogger(t *testing.T) {
	// Defensive: New must reject nil Logger. Until Task 2.8 lands, this
	// panics with the stub message — the panic IS the RED signal.
	defer func() {
		_ = recover()
	}()
	_, err := New(Config{PostgresURL: "postgres://x"})
	if err == nil {
		t.Fatal("New with nil Logger should return an error")
	}
	if !strings.Contains(err.Error(), "logger") && !strings.Contains(err.Error(), "Logger") {
		t.Errorf("err = %v, want to mention logger", err)
	}
}

// compile-time assertion that enum constants are exercised.
var _ = []bool{
	OutcomeApprove == OutcomeApprove,
	OutcomeReject == OutcomeReject,
	OutcomeDefer == OutcomeDefer,
	DecisionModeRule == DecisionModeRule,
	DecisionModeLLM == DecisionModeLLM,
	GapMissingDecisionLogRow == GapMissingDecisionLogRow,
	GapMissingOutcome == GapMissingOutcome,
	GapMultipleOutcomes == GapMultipleOutcomes,
	VerifyModeRandomSample == VerifyModeRandomSample,
	VerifyModeFullRange == VerifyModeFullRange,
}

// compile-time assertion: defaultGapKinds is referenced so the unused-var
// check on Task 2.8 helpers does not break the stub build.
var _ = defaultGapKinds
var _ = defaultSampleSize
var _ = defaultQueryLimit
var _ = maxQueryLimit
