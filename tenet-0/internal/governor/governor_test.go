// Tests for the tenet0-governor-mcp Handler. Phase 2 RED tests: every
// handler in types.go panics with "not implemented (Task 2.10)", so every
// test that invokes a handler FAILS on first run. Task 2.10 implements the
// bodies and turns these green.
//
// Test seams: `store` interface. The fakeStore lives in fakes_test.go.
// newTestHandler constructs a Handler directly, bypassing the real New()
// which would open a pgx pool.
//
// NFR-7 package-level invariant is enforced by TestNFR7_* tests at the
// bottom of this file by grepping the package .go source.
package governor

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// =============================================================================
// reserve_tokens (≥5)
// =============================================================================

func TestReserveTokens_HappyAllowed(t *testing.T) {
	fs := &fakeStore{
		ReserveFn: func(ctx context.Context, req ReserveTokensRequest) (ReserveTokensResponse, error) {
			return ReserveTokensResponse{
				ReservationID: "11111111-1111-1111-1111-111111111111",
				Allowed:       true,
			}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.ReserveTokens(context.Background(), ReserveTokensRequest{
		Department:            "fin",
		Model:                 "claude-opus-4",
		EstimatedInputTokens:  1000,
		EstimatedOutputTokens: 500,
	})
	if err != nil {
		t.Fatalf("ReserveTokens: %v", err)
	}
	if !resp.Allowed {
		t.Errorf("allowed=false, want true")
	}
	if resp.ReservationID == "" {
		t.Errorf("reservation_id must be non-empty on allowed reservation")
	}
	if resp.DeniedReason != nil {
		t.Errorf("denied_reason=%v, want nil when allowed", resp.DeniedReason)
	}
}

func TestReserveTokens_BudgetExceeded(t *testing.T) {
	reason := DeniedReasonBudgetExceeded
	fs := &fakeStore{
		ReserveFn: func(ctx context.Context, req ReserveTokensRequest) (ReserveTokensResponse, error) {
			return ReserveTokensResponse{Allowed: false, DeniedReason: &reason}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.ReserveTokens(context.Background(), ReserveTokensRequest{
		Department: "fin", Model: "m", EstimatedInputTokens: 1, EstimatedOutputTokens: 1,
	})
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if resp.Allowed {
		t.Errorf("allowed=true, want false")
	}
	if resp.DeniedReason == nil || *resp.DeniedReason != DeniedReasonBudgetExceeded {
		t.Errorf("denied_reason=%v, want budget_exceeded", resp.DeniedReason)
	}
}

func TestReserveTokens_DepartmentPaused(t *testing.T) {
	reason := DeniedReasonDepartmentPaused
	fs := &fakeStore{
		ReserveFn: func(ctx context.Context, req ReserveTokensRequest) (ReserveTokensResponse, error) {
			return ReserveTokensResponse{Allowed: false, DeniedReason: &reason}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.ReserveTokens(context.Background(), ReserveTokensRequest{
		Department: "fin", Model: "m", EstimatedInputTokens: 1, EstimatedOutputTokens: 1,
	})
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if resp.Allowed || resp.DeniedReason == nil || *resp.DeniedReason != DeniedReasonDepartmentPaused {
		t.Errorf("resp=%+v, want denied department_paused", resp)
	}
}

func TestReserveTokens_RateLimited(t *testing.T) {
	reason := DeniedReasonRateLimited
	fs := &fakeStore{
		ReserveFn: func(ctx context.Context, req ReserveTokensRequest) (ReserveTokensResponse, error) {
			return ReserveTokensResponse{Allowed: false, DeniedReason: &reason}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.ReserveTokens(context.Background(), ReserveTokensRequest{
		Department: "fin", Model: "m", EstimatedInputTokens: 1, EstimatedOutputTokens: 1,
	})
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if resp.Allowed || resp.DeniedReason == nil || *resp.DeniedReason != DeniedReasonRateLimited {
		t.Errorf("resp=%+v, want denied rate_limited", resp)
	}
}

func TestReserveTokens_DeptUnknown(t *testing.T) {
	fs := &fakeStore{
		ReserveFn: func(ctx context.Context, req ReserveTokensRequest) (ReserveTokensResponse, error) {
			return ReserveTokensResponse{}, ErrGovernorDeptUnknown
		},
	}
	h := newTestHandler(fs, discardLogger())
	_, err := h.ReserveTokens(context.Background(), ReserveTokensRequest{
		Department: "zzz_nope", Model: "m", EstimatedInputTokens: 1, EstimatedOutputTokens: 1,
	})
	if !errors.Is(err, ErrGovernorDeptUnknown) {
		t.Fatalf("err=%v, want ErrGovernorDeptUnknown", err)
	}
	if code := toolErrorCode(err); code != "GOVERNOR_DEPT_UNKNOWN" {
		t.Errorf("code=%q, want GOVERNOR_DEPT_UNKNOWN", code)
	}
}

func TestReserveTokens_NegativeTokensRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs, discardLogger())
	_, err := h.ReserveTokens(context.Background(), ReserveTokensRequest{
		Department:            "fin",
		Model:                 "m",
		EstimatedInputTokens:  -1,
		EstimatedOutputTokens: 0,
	})
	if err == nil {
		t.Fatal("expected input validation error on negative tokens")
	}
	if !errors.Is(err, ErrGovernorInputInvalid) {
		t.Errorf("err=%v, want ErrGovernorInputInvalid", err)
	}
	// Store must NOT have been called when input validation rejects.
	if len(fs.ReserveCalls) != 0 {
		t.Errorf("store called despite bad input: %d calls", len(fs.ReserveCalls))
	}
}

func TestReserveTokens_Idempotent(t *testing.T) {
	key := "01234567-89ab-cdef-0123-456789abcdef"
	fs := &fakeStore{
		ReserveFn: func(ctx context.Context, req ReserveTokensRequest) (ReserveTokensResponse, error) {
			// Store honours idempotency: same key → same reservation_id.
			return ReserveTokensResponse{
				ReservationID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
				Allowed:       true,
			}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	req := ReserveTokensRequest{
		Department:            "fin",
		Model:                 "m",
		EstimatedInputTokens:  10,
		EstimatedOutputTokens: 10,
		IdempotencyKey:        &key,
	}
	a, err := h.ReserveTokens(context.Background(), req)
	if err != nil {
		t.Fatalf("A: %v", err)
	}
	b, err := h.ReserveTokens(context.Background(), req)
	if err != nil {
		t.Fatalf("B: %v", err)
	}
	if a.ReservationID != b.ReservationID {
		t.Errorf("idempotency broken: a=%q b=%q", a.ReservationID, b.ReservationID)
	}
}

// =============================================================================
// record_spend (≥5)
// =============================================================================

func TestRecordSpend_Happy(t *testing.T) {
	fs := &fakeStore{
		RecordSpendFn: func(ctx context.Context, req RecordSpendRequest) (RecordSpendResponse, error) {
			return RecordSpendResponse{
				Committed:         true,
				CurrentSpendCents: 4200,
				BudgetCents:       100000,
				WarnThresholdHit:  false,
			}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.RecordSpend(context.Background(), RecordSpendRequest{
		ReservationID:      "11111111-1111-1111-1111-111111111111",
		ActualInputTokens:  900,
		ActualOutputTokens: 500,
		ActualCostCents:    0,
	})
	if err != nil {
		t.Fatalf("RecordSpend: %v", err)
	}
	if !resp.Committed {
		t.Errorf("committed=false")
	}
	if resp.BudgetCents == 0 {
		t.Errorf("budget_cents=0 (unset)")
	}
}

func TestRecordSpend_ReservationUnknown(t *testing.T) {
	fs := &fakeStore{
		RecordSpendFn: func(ctx context.Context, req RecordSpendRequest) (RecordSpendResponse, error) {
			return RecordSpendResponse{}, ErrGovernorReservationUnknown
		},
	}
	h := newTestHandler(fs, discardLogger())
	_, err := h.RecordSpend(context.Background(), RecordSpendRequest{
		ReservationID: "ffffffff-ffff-ffff-ffff-ffffffffffff",
	})
	if !errors.Is(err, ErrGovernorReservationUnknown) {
		t.Fatalf("err=%v", err)
	}
	if code := toolErrorCode(err); code != "GOVERNOR_RESERVATION_UNKNOWN" {
		t.Errorf("code=%q", code)
	}
}

func TestRecordSpend_ReservationExpired(t *testing.T) {
	fs := &fakeStore{
		RecordSpendFn: func(ctx context.Context, req RecordSpendRequest) (RecordSpendResponse, error) {
			return RecordSpendResponse{}, ErrGovernorReservationExpired
		},
	}
	h := newTestHandler(fs, discardLogger())
	_, err := h.RecordSpend(context.Background(), RecordSpendRequest{
		ReservationID: "11111111-1111-1111-1111-111111111111",
	})
	if !errors.Is(err, ErrGovernorReservationExpired) {
		t.Fatalf("err=%v", err)
	}
	if code := toolErrorCode(err); code != "GOVERNOR_RESERVATION_EXPIRED" {
		t.Errorf("code=%q", code)
	}
}

func TestRecordSpend_ZeroCostCentsIsNormal_NFR7(t *testing.T) {
	// CRITICAL NFR-7: actual_cost_cents=0 is the normal OAuth path. Must
	// never produce an error or rejection.
	fs := &fakeStore{
		RecordSpendFn: func(ctx context.Context, req RecordSpendRequest) (RecordSpendResponse, error) {
			if req.ActualCostCents != 0 {
				t.Errorf("actual_cost_cents=%d, want 0 on NFR-7 normal path", req.ActualCostCents)
			}
			return RecordSpendResponse{Committed: true, BudgetCents: 100000}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.RecordSpend(context.Background(), RecordSpendRequest{
		ReservationID:      "11111111-1111-1111-1111-111111111111",
		ActualInputTokens:  100,
		ActualOutputTokens: 50,
		ActualCostCents:    0,
	})
	if err != nil {
		t.Fatalf("zero cost must not error under NFR-7: %v", err)
	}
	if !resp.Committed {
		t.Errorf("committed=false on zero-cost spend")
	}
}

func TestRecordSpend_WarnThresholdHit(t *testing.T) {
	// Store reports spend crossed warn threshold; handler must propagate.
	fs := &fakeStore{
		RecordSpendFn: func(ctx context.Context, req RecordSpendRequest) (RecordSpendResponse, error) {
			return RecordSpendResponse{
				Committed:         true,
				CurrentSpendCents: 85000,
				BudgetCents:       100000,
				WarnThresholdHit:  true,
			}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.RecordSpend(context.Background(), RecordSpendRequest{
		ReservationID:      "11111111-1111-1111-1111-111111111111",
		ActualInputTokens:  1,
		ActualOutputTokens: 1,
	})
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if !resp.WarnThresholdHit {
		t.Errorf("warn_threshold_hit=false, want true when spent crosses threshold")
	}
}

func TestRecordSpend_NegativeTokensRejected(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs, discardLogger())
	_, err := h.RecordSpend(context.Background(), RecordSpendRequest{
		ReservationID:      "11111111-1111-1111-1111-111111111111",
		ActualInputTokens:  -5,
		ActualOutputTokens: 0,
	})
	if err == nil {
		t.Fatal("expected input validation rejection for negative tokens")
	}
	if !errors.Is(err, ErrGovernorInputInvalid) {
		t.Errorf("err=%v, want ErrGovernorInputInvalid", err)
	}
	if len(fs.RecordSpendCalls) != 0 {
		t.Errorf("store called despite bad input")
	}
}

// =============================================================================
// budget_remaining (≥3)
// =============================================================================

func TestBudgetRemaining_Happy(t *testing.T) {
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 4, 30, 23, 59, 59, 0, time.UTC)
	fs := &fakeStore{
		BudgetFn: func(ctx context.Context, department string) (BudgetRemainingResponse, error) {
			return BudgetRemainingResponse{
				Department:     department,
				PeriodStart:    start,
				PeriodEnd:      end,
				BudgetCents:    100000,
				SpentCents:     30000,
				RemainingCents: 70000,
			}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.BudgetRemaining(context.Background(), BudgetRemainingRequest{Department: "fin"})
	if err != nil {
		t.Fatalf("BudgetRemaining: %v", err)
	}
	if resp.Department != "fin" {
		t.Errorf("department=%q", resp.Department)
	}
	if resp.PeriodStart.IsZero() || resp.PeriodEnd.IsZero() {
		t.Errorf("period unset")
	}
	if resp.BudgetCents != 100000 || resp.SpentCents != 30000 || resp.RemainingCents != 70000 {
		t.Errorf("amounts wrong: %+v", resp)
	}
}

func TestBudgetRemaining_DeptUnknown(t *testing.T) {
	fs := &fakeStore{
		BudgetFn: func(ctx context.Context, department string) (BudgetRemainingResponse, error) {
			return BudgetRemainingResponse{}, ErrGovernorDeptUnknown
		},
	}
	h := newTestHandler(fs, discardLogger())
	_, err := h.BudgetRemaining(context.Background(), BudgetRemainingRequest{Department: "zzz"})
	if !errors.Is(err, ErrGovernorDeptUnknown) {
		t.Fatalf("err=%v", err)
	}
	if code := toolErrorCode(err); code != "GOVERNOR_DEPT_UNKNOWN" {
		t.Errorf("code=%q", code)
	}
}

func TestBudgetRemaining_NegativeRemainingOnOverspend(t *testing.T) {
	// Schema: remaining_cents is `integer` (no minimum), so overspend is
	// representable as a negative value. Handler must not clamp.
	fs := &fakeStore{
		BudgetFn: func(ctx context.Context, department string) (BudgetRemainingResponse, error) {
			return BudgetRemainingResponse{
				Department:     department,
				BudgetCents:    1000,
				SpentCents:     1500,
				RemainingCents: -500,
			}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.BudgetRemaining(context.Background(), BudgetRemainingRequest{Department: "fin"})
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if resp.RemainingCents != -500 {
		t.Errorf("remaining_cents=%d, want -500 (overspend preserved)", resp.RemainingCents)
	}
}

// =============================================================================
// check_budget (≥3)
// =============================================================================

func TestCheckBudget_Allowed(t *testing.T) {
	fs := &fakeStore{
		CheckFn: func(ctx context.Context, department string, marginal int) (CheckBudgetResponse, error) {
			return CheckBudgetResponse{Allowed: true}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.CheckBudget(context.Background(), CheckBudgetRequest{
		Department:                 "fin",
		EstimatedMarginalCostCents: 100,
	})
	if err != nil {
		t.Fatalf("CheckBudget: %v", err)
	}
	if !resp.Allowed {
		t.Errorf("allowed=false")
	}
	if resp.DeniedReason != nil {
		t.Errorf("denied_reason=%v, want nil on allowed", resp.DeniedReason)
	}
}

func TestCheckBudget_DeniedBudgetExceeded(t *testing.T) {
	reason := DeniedReasonBudgetExceeded
	fs := &fakeStore{
		CheckFn: func(ctx context.Context, department string, marginal int) (CheckBudgetResponse, error) {
			return CheckBudgetResponse{Allowed: false, DeniedReason: &reason}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.CheckBudget(context.Background(), CheckBudgetRequest{
		Department:                 "fin",
		EstimatedMarginalCostCents: 999999,
	})
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if resp.Allowed {
		t.Errorf("allowed=true")
	}
	if resp.DeniedReason == nil || *resp.DeniedReason != DeniedReasonBudgetExceeded {
		t.Errorf("denied_reason=%v", resp.DeniedReason)
	}
}

func TestCheckBudget_DeptUnknown(t *testing.T) {
	fs := &fakeStore{
		CheckFn: func(ctx context.Context, department string, marginal int) (CheckBudgetResponse, error) {
			return CheckBudgetResponse{}, ErrGovernorDeptUnknown
		},
	}
	h := newTestHandler(fs, discardLogger())
	_, err := h.CheckBudget(context.Background(), CheckBudgetRequest{Department: "zzz"})
	if !errors.Is(err, ErrGovernorDeptUnknown) {
		t.Fatalf("err=%v", err)
	}
	if code := toolErrorCode(err); code != "GOVERNOR_DEPT_UNKNOWN" {
		t.Errorf("code=%q", code)
	}
}

// =============================================================================
// record_spawn_telemetry (≥3)
// =============================================================================

func TestRecordSpawnTelemetry_Happy(t *testing.T) {
	fs := &fakeStore{
		SpawnFn: func(ctx context.Context, req RecordSpawnTelemetryRequest) (bool, error) {
			return true, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	resp, err := h.RecordSpawnTelemetry(context.Background(), RecordSpawnTelemetryRequest{
		Department:  "fin",
		Director:    "fin",
		SpawnKind:   SpawnKindCold,
		WallClockMS: 1523,
		Outcome:     SpawnOutcomeSuccess,
	})
	if err != nil {
		t.Fatalf("RecordSpawnTelemetry: %v", err)
	}
	if !resp.Recorded {
		t.Errorf("recorded=false")
	}
	if len(fs.SpawnCalls) != 1 {
		t.Errorf("store call count=%d, want 1", len(fs.SpawnCalls))
	}
}

func TestRecordSpawnTelemetry_InvalidSpawnKind(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs, discardLogger())
	_, err := h.RecordSpawnTelemetry(context.Background(), RecordSpawnTelemetryRequest{
		Department:  "fin",
		Director:    "fin",
		SpawnKind:   "lukewarm", // invalid
		WallClockMS: 100,
		Outcome:     SpawnOutcomeSuccess,
	})
	if err == nil {
		t.Fatal("expected input validation error for invalid spawn_kind")
	}
	if !errors.Is(err, ErrGovernorInputInvalid) {
		t.Errorf("err=%v, want ErrGovernorInputInvalid", err)
	}
	if len(fs.SpawnCalls) != 0 {
		t.Errorf("store called despite bad input")
	}
}

func TestRecordSpawnTelemetry_InvalidOutcome(t *testing.T) {
	fs := &fakeStore{}
	h := newTestHandler(fs, discardLogger())
	_, err := h.RecordSpawnTelemetry(context.Background(), RecordSpawnTelemetryRequest{
		Department:  "fin",
		Director:    "fin",
		SpawnKind:   SpawnKindWarm,
		WallClockMS: 100,
		Outcome:     "exploded", // invalid
	})
	if err == nil {
		t.Fatal("expected input validation error for invalid outcome")
	}
	if !errors.Is(err, ErrGovernorInputInvalid) {
		t.Errorf("err=%v, want ErrGovernorInputInvalid", err)
	}
	if len(fs.SpawnCalls) != 0 {
		t.Errorf("store called despite bad input")
	}
}

// =============================================================================
// NFR-7 invariants (≥3) — package-level audit.
// =============================================================================

// packageDir returns the absolute directory holding this test's source file.
// Used by NFR-7 tests to scan only governor package .go sources.
func packageDir(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Dir(thisFile)
}

// readPackageSources returns the non-test .go files in the package directory.
// We deliberately EXCLUDE test files so this NFR-7 audit covers only what
// ships in the binary, not test scaffolding.
func readPackageSources(t *testing.T) map[string][]byte {
	t.Helper()
	dir := packageDir(t)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read dir %s: %v", dir, err)
	}
	out := map[string][]byte{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(name, ".go") {
			continue
		}
		if strings.HasSuffix(name, "_test.go") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		out[name] = b
	}
	if len(out) == 0 {
		t.Fatal("no non-test .go sources found in package dir")
	}
	return out
}

func TestNFR7_NoAnthropicStringLiteralsInPackageSource(t *testing.T) {
	forbidden := []string{
		"api.anthropic.com",
		"anthropic.com",
		"ANTHROPIC_API_KEY",
	}
	sources := readPackageSources(t)
	for name, src := range sources {
		lower := strings.ToLower(string(src))
		for _, needle := range forbidden {
			if strings.Contains(lower, strings.ToLower(needle)) {
				t.Errorf("NFR-7 violation: %s contains forbidden literal %q", name, needle)
			}
		}
	}
}

func TestNFR7_NoHTTPClientImportInPackageSource(t *testing.T) {
	// The governor has no outbound network reason to exist. If net/http ever
	// appears in a package source it MUST be reviewed — this test forces that
	// review by failing when the import is introduced.
	sources := readPackageSources(t)
	for name, src := range sources {
		// Accept any form the compiler accepts: `"net/http"`, bare or aliased
		// import line. Crude but deterministic.
		if strings.Contains(string(src), `"net/http"`) {
			t.Errorf("NFR-7 suspicious: %s imports net/http; governor must not make outbound HTTP calls", name)
		}
	}
}

func TestNFR7_RecordSpendAcceptsZeroCost(t *testing.T) {
	// Duplicate-check of the NFR-7 spend path: explicit regression guard so
	// a future implementer cannot accidentally make cost-0 an error path.
	fs := &fakeStore{
		RecordSpendFn: func(ctx context.Context, req RecordSpendRequest) (RecordSpendResponse, error) {
			return RecordSpendResponse{Committed: true, BudgetCents: 1}, nil
		},
	}
	h := newTestHandler(fs, discardLogger())
	for _, cost := range []int{0, 0, 0} {
		_, err := h.RecordSpend(context.Background(), RecordSpendRequest{
			ReservationID:      "11111111-1111-1111-1111-111111111111",
			ActualInputTokens:  1,
			ActualOutputTokens: 1,
			ActualCostCents:    cost,
		})
		if err != nil {
			t.Fatalf("zero cost must succeed under NFR-7, got %v", err)
		}
	}
}

// =============================================================================
// RegisterTools / ToolNames / schemas / toolErrorCode (≥3)
// =============================================================================

func TestRegisterTools_RegistersExactlyFive(t *testing.T) {
	srv := mcp.NewServer("tenet0-governor-mcp", "test", discardLogger())
	h := newTestHandler(&fakeStore{}, discardLogger())

	if err := h.RegisterTools(srv); err != nil {
		t.Fatalf("RegisterTools: %v", err)
	}
	// Re-registration of any tool name must fail (proves it was registered).
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
}

func TestRegisterTools_NamesMatchContract(t *testing.T) {
	want := map[string]bool{
		"reserve_tokens":         true,
		"record_spend":           true,
		"budget_remaining":       true,
		"check_budget":           true,
		"record_spawn_telemetry": true,
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
			t.Errorf("duplicate tool name %q in ToolNames", n)
		}
		seen[n] = true
	}
}

func TestRegisterTools_SchemasAreValidJSON(t *testing.T) {
	schemas := map[string][2]json.RawMessage{
		"reserve_tokens":         {reserveTokensInputSchema, reserveTokensOutputSchema},
		"record_spend":           {recordSpendInputSchema, recordSpendOutputSchema},
		"budget_remaining":       {budgetRemainingInputSchema, budgetRemainingOutputSchema},
		"check_budget":           {checkBudgetInputSchema, checkBudgetOutputSchema},
		"record_spawn_telemetry": {recordSpawnTelemetryInputSchema, recordSpawnTelemetryOutputSchema},
	}
	for name, pair := range schemas {
		var any1, any2 any
		if err := json.Unmarshal(pair[0], &any1); err != nil {
			t.Errorf("%s inputSchema invalid JSON: %v", name, err)
		}
		if err := json.Unmarshal(pair[1], &any2); err != nil {
			t.Errorf("%s outputSchema invalid JSON: %v", name, err)
		}
	}
}

func TestToolErrorCode_AllSentinels(t *testing.T) {
	cases := []struct {
		err  error
		code string
	}{
		{nil, ""},
		{ErrGovernorUnauthorized, "GOVERNOR_UNAUTHORIZED"},
		{ErrGovernorDeptUnknown, "GOVERNOR_DEPT_UNKNOWN"},
		{ErrGovernorReservationUnknown, "GOVERNOR_RESERVATION_UNKNOWN"},
		{ErrGovernorReservationExpired, "GOVERNOR_RESERVATION_EXPIRED"},
		{errors.New("unrelated"), "INTERNAL"},
	}
	for _, tc := range cases {
		got := toolErrorCode(tc.err)
		if got != tc.code {
			t.Errorf("toolErrorCode(%v) = %q, want %q", tc.err, got, tc.code)
		}
	}
}

// compile-time assertion the fake satisfies the interface (repeats the one in
// fakes_test.go to give this file a standalone assertion for readers).
var _ store = (*fakeStore)(nil)
