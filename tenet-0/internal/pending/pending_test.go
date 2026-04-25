// Tests for the tenet0-pending-mcp Handler. Phase 2 RED tests: every handler
// in types.go panics with "not implemented (Task 2.6)", so every test that
// invokes a handler is expected to FAIL on first run. Task 2.6 implements
// the bodies and turns these green.
//
// Test seam: store. The fake lives in fakes_test.go. newTestHandler
// constructs a Handler directly, bypassing the real New() which would open
// a pgx pool.
package pending

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// sampleItem returns a canonical PendingItem populated with sensible values.
func sampleItem() PendingItem {
	deadline := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	ruleID := "fin-payment-outbound-requires-approval"
	return PendingItem{
		ID:                   "11111111-1111-1111-1111-111111111111",
		RequestEventID:       "22222222-2222-2222-2222-222222222222",
		TargetEventType:      "fin.payment.outbound",
		RequestingDepartment: "fin",
		Status:               StatusPending,
		OperatorDeadline:     deadline,
		RuleID:               &ruleID,
	}
}

// =============================================================================
// list_pending (≥4)
// =============================================================================

func TestListPending_HappyReturnsItemsAndCursor(t *testing.T) {
	cursor := "next-cursor-abc"
	fs := &fakeStore{
		ListFn: func(ctx context.Context, f ListPendingFilter) (ListPendingResult, error) {
			return ListPendingResult{Items: []PendingItem{sampleItem()}, NextCursor: &cursor}, nil
		},
	}
	h := newTestHandler(fs)

	resp, err := h.ListPending(context.Background(), ListPendingRequest{})
	if err != nil {
		t.Fatalf("ListPending: %v", err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("items = %d, want 1", len(resp.Items))
	}
	if resp.NextCursor == nil || *resp.NextCursor != cursor {
		t.Errorf("next_cursor = %v, want %q", resp.NextCursor, cursor)
	}
}

func TestListPending_FilterByDepartmentPropagated(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs)

	_, err := h.ListPending(context.Background(), ListPendingRequest{Department: "fin"})
	if err != nil {
		t.Fatalf("ListPending: %v", err)
	}
	if len(fs.ListCalls) != 1 || fs.ListCalls[0].Department != "fin" {
		t.Errorf("department not propagated: %+v", fs.ListCalls)
	}
}

func TestListPending_FilterByStatusPropagated(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs)

	_, err := h.ListPending(context.Background(), ListPendingRequest{Status: string(StatusAwaitingOperator)})
	if err != nil {
		t.Fatalf("ListPending: %v", err)
	}
	if len(fs.ListCalls) != 1 || fs.ListCalls[0].Status != StatusAwaitingOperator {
		t.Errorf("status not propagated: %+v", fs.ListCalls)
	}
}

func TestListPending_InvalidStatusRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs)

	_, err := h.ListPending(context.Background(), ListPendingRequest{Status: "not_a_real_status"})
	if !errors.Is(err, ErrPendingQueryInvalid) {
		t.Fatalf("err = %v, want ErrPendingQueryInvalid", err)
	}
	if code := toolErrorCode(err); code != "PENDING_QUERY_INVALID" {
		t.Errorf("code = %q", code)
	}
	if len(fs.ListCalls) != 0 {
		t.Errorf("store should not have been called on invalid input: %+v", fs.ListCalls)
	}
}

func TestListPending_InvalidDepartmentRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs)

	// Uppercase + hyphen violates ^[a-z][a-z0-9_]+$.
	_, err := h.ListPending(context.Background(), ListPendingRequest{Department: "Fin-Ops"})
	if !errors.Is(err, ErrPendingQueryInvalid) {
		t.Fatalf("err = %v, want ErrPendingQueryInvalid", err)
	}
}

// =============================================================================
// claim_for_decision (≥5)
// =============================================================================

func TestClaimForDecision_HappyPath(t *testing.T) {
	claimedAt := time.Date(2026, 4, 19, 10, 0, 0, 0, time.UTC)
	fs := &fakeStore{
		ClaimFn: func(ctx context.Context, req ClaimRequest) (ClaimResult, error) {
			return ClaimResult{
				PendingApprovalID: "11111111-1111-1111-1111-111111111111",
				ClaimedAt:         claimedAt,
			}, nil
		},
	}
	h := newTestHandler(fs)

	resp, err := h.ClaimForDecision(context.Background(), ClaimForDecisionRequest{
		RequestEventID: "22222222-2222-2222-2222-222222222222",
	})
	if err != nil {
		t.Fatalf("ClaimForDecision: %v", err)
	}
	if resp.PendingApprovalID == "" {
		t.Error("pending_approval_id must be non-empty")
	}
	if !resp.ClaimedAt.Equal(claimedAt) {
		t.Errorf("claimed_at = %v, want %v", resp.ClaimedAt, claimedAt)
	}
}

func TestClaimForDecision_RaceOnlyOneWinner(t *testing.T) {
	var calls int32
	fs := &fakeStore{
		ClaimFn: func(ctx context.Context, req ClaimRequest) (ClaimResult, error) {
			n := atomic.AddInt32(&calls, 1)
			if n == 1 {
				return ClaimResult{
					PendingApprovalID: "11111111-1111-1111-1111-111111111111",
					ClaimedAt:         time.Now().UTC(),
				}, nil
			}
			return ClaimResult{}, ErrPendingAlreadyClaimed
		},
	}
	h := newTestHandler(fs)

	const N = 2
	var (
		wg       sync.WaitGroup
		winners  int32
		losers   int32
		otherErr error
		mu       sync.Mutex
	)
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func() {
			defer wg.Done()
			_, err := h.ClaimForDecision(context.Background(), ClaimForDecisionRequest{
				RequestEventID: "22222222-2222-2222-2222-222222222222",
			})
			switch {
			case err == nil:
				atomic.AddInt32(&winners, 1)
			case errors.Is(err, ErrPendingAlreadyClaimed):
				atomic.AddInt32(&losers, 1)
			default:
				mu.Lock()
				otherErr = err
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if otherErr != nil {
		t.Fatalf("unexpected error: %v", otherErr)
	}
	if winners != 1 || losers != 1 {
		t.Fatalf("winners=%d losers=%d, want 1/1", winners, losers)
	}
}

func TestClaimForDecision_NotFound(t *testing.T) {
	fs := &fakeStore{
		ClaimFn: func(ctx context.Context, req ClaimRequest) (ClaimResult, error) {
			return ClaimResult{}, ErrPendingNotFound
		},
	}
	h := newTestHandler(fs)

	_, err := h.ClaimForDecision(context.Background(), ClaimForDecisionRequest{
		RequestEventID: "22222222-2222-2222-2222-222222222222",
	})
	if !errors.Is(err, ErrPendingNotFound) {
		t.Fatalf("err = %v, want ErrPendingNotFound", err)
	}
	if code := toolErrorCode(err); code != "PENDING_NOT_FOUND" {
		t.Errorf("code = %q", code)
	}
}

func TestClaimForDecision_AwaitingOperatorWithoutDeadlineRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs)

	_, err := h.ClaimForDecision(context.Background(), ClaimForDecisionRequest{
		RequestEventID:   "22222222-2222-2222-2222-222222222222",
		NewStatus:        string(StatusAwaitingOperator),
		OperatorDeadline: nil,
	})
	if !errors.Is(err, ErrPendingInvalidTransition) {
		t.Fatalf("err = %v, want ErrPendingInvalidTransition", err)
	}
	if len(fs.ClaimCalls) != 0 {
		t.Errorf("store should not have been called: %+v", fs.ClaimCalls)
	}
}

func TestClaimForDecision_InvalidNewStatusRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs)

	// "decided" is a valid status overall but NOT a valid new_status target
	// for claim_for_decision (enum restricted to awaiting_llm|awaiting_operator).
	_, err := h.ClaimForDecision(context.Background(), ClaimForDecisionRequest{
		RequestEventID: "22222222-2222-2222-2222-222222222222",
		NewStatus:      "decided",
	})
	if !errors.Is(err, ErrPendingQueryInvalid) && !errors.Is(err, ErrPendingInvalidTransition) {
		t.Fatalf("err = %v, want ErrPendingQueryInvalid or ErrPendingInvalidTransition", err)
	}
	if len(fs.ClaimCalls) != 0 {
		t.Errorf("store should not have been called on invalid input: %+v", fs.ClaimCalls)
	}
}

// =============================================================================
// record_decision (≥5)
// =============================================================================

func TestRecordDecision_HappyPath(t *testing.T) {
	recorded := time.Date(2026, 4, 19, 10, 5, 0, 0, time.UTC)
	fs := &fakeStore{
		RecordFn: func(ctx context.Context, req RecordDecisionRequest) (RecordDecisionResult, error) {
			return RecordDecisionResult{
				DecisionLogID: 1234,
				RowHash:       "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
				RecordedAt:    recorded,
			}, nil
		},
	}
	h := newTestHandler(fs)

	resp, err := h.RecordDecision(context.Background(), RecordDecisionReq{
		PendingApprovalID: "11111111-1111-1111-1111-111111111111",
		Outcome:           string(OutcomeApprove),
		DecisionMode:      string(DecisionModeRule),
		Rationale:         "matched rule r1",
		RuleID:            "r1",
	})
	if err != nil {
		t.Fatalf("RecordDecision: %v", err)
	}
	if resp.DecisionLogID == 0 {
		t.Error("decision_log_id must be non-zero")
	}
	if len(resp.RowHash) != 64 {
		t.Errorf("row_hash length = %d, want 64", len(resp.RowHash))
	}
	if !resp.RecordedAt.Equal(recorded) {
		t.Errorf("recorded_at = %v, want %v", resp.RecordedAt, recorded)
	}
}

func TestRecordDecision_LongRationaleTruncated(t *testing.T) {
	fs := &fakeStore{
		RecordFn: func(ctx context.Context, req RecordDecisionRequest) (RecordDecisionResult, error) {
			if len(req.Rationale) > maxRationaleChars {
				t.Errorf("rationale not truncated before store call: len=%d", len(req.Rationale))
			}
			return RecordDecisionResult{
				DecisionLogID: 1,
				RowHash:       strings.Repeat("a", 64),
				RecordedAt:    time.Now().UTC(),
			}, nil
		},
	}
	h := newTestHandler(fs)

	_, err := h.RecordDecision(context.Background(), RecordDecisionReq{
		PendingApprovalID: "11111111-1111-1111-1111-111111111111",
		Outcome:           string(OutcomeApprove),
		DecisionMode:      string(DecisionModeRule),
		Rationale:         strings.Repeat("X", 5000),
		RuleID:            "r1",
	})
	if err != nil {
		t.Fatalf("RecordDecision: %v", err)
	}
}

func TestRecordDecision_MissingPendingApprovalIDNotFound(t *testing.T) {
	fs := &fakeStore{
		RecordFn: func(ctx context.Context, req RecordDecisionRequest) (RecordDecisionResult, error) {
			return RecordDecisionResult{}, ErrPendingNotFound
		},
	}
	h := newTestHandler(fs)

	_, err := h.RecordDecision(context.Background(), RecordDecisionReq{
		PendingApprovalID: "99999999-9999-9999-9999-999999999999",
		Outcome:           string(OutcomeReject),
		DecisionMode:      string(DecisionModeRule),
		Rationale:         "n/a",
		RuleID:            "r1",
	})
	if !errors.Is(err, ErrPendingNotFound) {
		t.Fatalf("err = %v, want ErrPendingNotFound", err)
	}
}

func TestRecordDecision_HashChainFailureSurfaced(t *testing.T) {
	fs := &fakeStore{
		RecordFn: func(ctx context.Context, req RecordDecisionRequest) (RecordDecisionResult, error) {
			return RecordDecisionResult{}, ErrDecisionLogHashFailure
		},
	}
	h := newTestHandler(fs)

	_, err := h.RecordDecision(context.Background(), RecordDecisionReq{
		PendingApprovalID: "11111111-1111-1111-1111-111111111111",
		Outcome:           string(OutcomeApprove),
		DecisionMode:      string(DecisionModeRule),
		Rationale:         "ok",
		RuleID:            "r1",
	})
	if !errors.Is(err, ErrDecisionLogHashFailure) {
		t.Fatalf("err = %v, want ErrDecisionLogHashFailure", err)
	}
	if code := toolErrorCode(err); code != "DECISION_LOG_HASH_FAILURE" {
		t.Errorf("code = %q", code)
	}
}

func TestRecordDecision_IdempotencyKeyReturnsSameID(t *testing.T) {
	// Same idempotency_key + same input → same decision_log_id.
	// Fake simulates the store's idempotency cache.
	idem := "01J8Z0Z0Z0Z0Z0Z0Z0Z0Z0Z0Z0" // ULID-shape
	cached := map[string]RecordDecisionResult{}
	var mu sync.Mutex
	fs := &fakeStore{
		RecordFn: func(ctx context.Context, req RecordDecisionRequest) (RecordDecisionResult, error) {
			mu.Lock()
			defer mu.Unlock()
			if req.IdempotencyKey != nil {
				if prev, ok := cached[*req.IdempotencyKey]; ok {
					return prev, nil
				}
			}
			res := RecordDecisionResult{
				DecisionLogID: int64(len(cached) + 1),
				RowHash:       strings.Repeat("b", 64),
				RecordedAt:    time.Now().UTC(),
			}
			if req.IdempotencyKey != nil {
				cached[*req.IdempotencyKey] = res
			}
			return res, nil
		},
	}
	h := newTestHandler(fs)

	req := RecordDecisionReq{
		PendingApprovalID: "11111111-1111-1111-1111-111111111111",
		Outcome:           string(OutcomeApprove),
		DecisionMode:      string(DecisionModeRule),
		Rationale:         "ok",
		RuleID:            "r1",
		IdempotencyKey:    &idem,
	}
	a, err := h.RecordDecision(context.Background(), req)
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	b, err := h.RecordDecision(context.Background(), req)
	if err != nil {
		t.Fatalf("second call: %v", err)
	}
	if a.DecisionLogID != b.DecisionLogID {
		t.Errorf("idempotent call returned different IDs: %d vs %d", a.DecisionLogID, b.DecisionLogID)
	}
}

// =============================================================================
// expire_overdue (≥4)
// =============================================================================

func TestExpireOverdue_HappyReturnsBatch(t *testing.T) {
	fs := &fakeStore{
		ExpireFn: func(ctx context.Context, req ExpireRequest) (ExpireResult, error) {
			return ExpireResult{Expired: []ExpiredItem{
				{
					PendingApprovalID: "11111111-1111-1111-1111-111111111111",
					RequestEventID:    "22222222-2222-2222-2222-222222222222",
					TargetEventType:   "fin.payment.outbound",
				},
			}}, nil
		},
	}
	h := newTestHandler(fs)

	resp, err := h.ExpireOverdue(context.Background(), ExpireOverdueRequest{})
	if err != nil {
		t.Fatalf("ExpireOverdue: %v", err)
	}
	if len(resp.Expired) != 1 {
		t.Fatalf("expired = %d, want 1", len(resp.Expired))
	}
	e := resp.Expired[0]
	if e.PendingApprovalID == "" || e.RequestEventID == "" || e.TargetEventType == "" {
		t.Errorf("incomplete ExpiredItem: %+v", e)
	}
}

func TestExpireOverdue_EmptyWhenNothingPastDeadline(t *testing.T) {
	fs := &fakeStore{
		ExpireFn: func(ctx context.Context, req ExpireRequest) (ExpireResult, error) {
			return ExpireResult{Expired: []ExpiredItem{}}, nil
		},
	}
	h := newTestHandler(fs)

	resp, err := h.ExpireOverdue(context.Background(), ExpireOverdueRequest{})
	if err != nil {
		t.Fatalf("ExpireOverdue: %v", err)
	}
	if resp.Expired == nil {
		t.Error("expired must be non-nil (empty array, not null) per outputSchema")
	}
	if len(resp.Expired) != 0 {
		t.Errorf("expired = %d, want 0", len(resp.Expired))
	}
}

func TestExpireOverdue_MaxBatchPropagated(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs)

	_, err := h.ExpireOverdue(context.Background(), ExpireOverdueRequest{MaxBatch: 25})
	if err != nil {
		t.Fatalf("ExpireOverdue: %v", err)
	}
	if len(fs.ExpireCalls) != 1 {
		t.Fatalf("expire calls = %d, want 1", len(fs.ExpireCalls))
	}
	if fs.ExpireCalls[0].MaxBatch != 25 {
		t.Errorf("max_batch = %d, want 25", fs.ExpireCalls[0].MaxBatch)
	}
}

func TestExpireOverdue_NowPropagatedForDeterminism(t *testing.T) {
	now := time.Date(2026, 4, 19, 12, 0, 0, 0, time.UTC)
	fs := &fakeStore{}
	h := newTestHandler(fs)

	_, err := h.ExpireOverdue(context.Background(), ExpireOverdueRequest{Now: &now})
	if err != nil {
		t.Fatalf("ExpireOverdue: %v", err)
	}
	if len(fs.ExpireCalls) != 1 {
		t.Fatalf("expire calls = %d, want 1", len(fs.ExpireCalls))
	}
	got := fs.ExpireCalls[0].Now
	if got == nil || !got.Equal(now) {
		t.Errorf("now = %v, want %v (deterministic cutoff for daemon tests)", got, now)
	}
}

// =============================================================================
// Generic: RegisterTools / ToolNames / toolErrorCode
// =============================================================================

func TestRegisterTools_RegistersExactlyFour(t *testing.T) {
	srv := mcp.NewServer("tenet0-pending-mcp", "test", discardLogger())
	h := newTestHandler(&fakeStore{})

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
	if len(ToolNames) != 4 {
		t.Errorf("ToolNames has %d entries, want 4", len(ToolNames))
	}
}

func TestToolNames_MatchesContract(t *testing.T) {
	want := map[string]bool{
		"list_pending":       true,
		"claim_for_decision": true,
		"record_decision":    true,
		"expire_overdue":     true,
	}
	if len(ToolNames) != len(want) {
		t.Fatalf("ToolNames has %d entries, want %d", len(ToolNames), len(want))
	}
	seen := map[string]bool{}
	for _, n := range ToolNames {
		if !want[n] {
			t.Errorf("unexpected tool name %q", n)
		}
		if seen[n] {
			t.Errorf("duplicate tool name %q", n)
		}
		seen[n] = true
	}
}

func TestToolErrorCode_AllSentinels(t *testing.T) {
	cases := []struct {
		err  error
		code string
	}{
		{nil, ""},
		{ErrPendingUnauthorized, "PENDING_UNAUTHORIZED"},
		{ErrPendingNotFound, "PENDING_NOT_FOUND"},
		{ErrPendingAlreadyClaimed, "PENDING_ALREADY_CLAIMED"},
		{ErrPendingInvalidTransition, "PENDING_INVALID_TRANSITION"},
		{ErrPendingQueryInvalid, "PENDING_QUERY_INVALID"},
		{ErrDecisionLogHashFailure, "DECISION_LOG_HASH_FAILURE"},
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
		"list_pending":       {listPendingInputSchema, listPendingOutputSchema},
		"claim_for_decision": {claimForDecisionInputSchema, claimForDecisionOutputSchema},
		"record_decision":    {recordDecisionInputSchema, recordDecisionOutputSchema},
		"expire_overdue":     {expireOverdueInputSchema, expireOverdueOutputSchema},
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
// Extra input validation (regex + enum coverage beyond the core cases above)
// =============================================================================

func TestDepartmentPattern_MatchesContract(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"fin", true},
		{"ops_alpha", true},
		{"president", true},
		{"f1n", true}, // lower + digits OK
		{"", false},
		{"Fin", false},          // uppercase rejected
		{"1fin", false},         // leading digit rejected
		{"fin-ops", false},      // hyphen rejected
		{"fin.ops", false},      // dot rejected
		{"x", false},            // single char fails the "+" (min 2)
	}
	for _, tc := range cases {
		got := departmentPattern.MatchString(tc.in)
		if got != tc.want {
			t.Errorf("departmentPattern.MatchString(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

func TestRecordDecision_InvalidOutcomeRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs)

	_, err := h.RecordDecision(context.Background(), RecordDecisionReq{
		PendingApprovalID: "11111111-1111-1111-1111-111111111111",
		Outcome:           "escalate", // not in {approve, reject, defer}
		DecisionMode:      string(DecisionModeRule),
		Rationale:         "n/a",
		RuleID:            "r1",
	})
	if !errors.Is(err, ErrPendingQueryInvalid) {
		t.Fatalf("err = %v, want ErrPendingQueryInvalid", err)
	}
	if len(fs.RecordCalls) != 0 {
		t.Errorf("store should not have been called on invalid outcome: %+v", fs.RecordCalls)
	}
}

func TestRecordDecision_InvalidDecisionModeRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs)

	_, err := h.RecordDecision(context.Background(), RecordDecisionReq{
		PendingApprovalID: "11111111-1111-1111-1111-111111111111",
		Outcome:           string(OutcomeApprove),
		DecisionMode:      "hybrid", // not in {rule, llm}
		Rationale:         "n/a",
	})
	if !errors.Is(err, ErrPendingQueryInvalid) {
		t.Fatalf("err = %v, want ErrPendingQueryInvalid", err)
	}
}

// =============================================================================
// New / Config validation
// =============================================================================

func TestNew_RequiresLogger(t *testing.T) {
	// Defensive: New must reject nil Logger. Until Task 2.6 lands, this
	// panics with the stub message — the panic IS the RED signal.
	defer func() {
		_ = recover()
	}()
	_, err := New(Config{
		PostgresURL: "postgres://x",
		Department:  "president",
	})
	if err == nil {
		t.Fatal("New with nil Logger should return an error")
	}
	if !strings.Contains(err.Error(), "logger") && !strings.Contains(err.Error(), "Logger") {
		t.Errorf("err = %v, want to mention logger", err)
	}
}

// compile-time assertion that the enum maps cover the referenced statuses.
var _ = []bool{
	allStatuses[StatusPending],
	allStatuses[StatusAwaitingLLM],
	allStatuses[StatusAwaitingOperator],
	allStatuses[StatusDecided],
	allStatuses[StatusExpired],
	allOutcomes[OutcomeApprove],
	allOutcomes[OutcomeReject],
	allOutcomes[OutcomeDefer],
	allDecisionModes[DecisionModeRule],
	allDecisionModes[DecisionModeLLM],
}
