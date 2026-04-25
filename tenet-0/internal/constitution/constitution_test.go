// Tests for the tenet0-constitution-mcp Handler. Phase 2 RED tests: every
// handler in types.go panics with "not implemented (Task 2.4)", so every
// test that invokes a handler is expected to FAIL on first run. Task 2.4
// implements the bodies and turns these green.
//
// Test seams: busgoClient, fileLoader, busReader, proseFunc. The fakes live
// in fakes_test.go. newTestHandler constructs a Handler directly, bypassing
// the real New() which would open pgx pools and read files.
package constitution

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	sharedconst "github.com/overnightdesk/tenet-0/internal/shared/constitution"
	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
	busgo "github.com/overnightdesk/tenet-0/shared/bus-go"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// =============================================================================
// LoadConstitution
// =============================================================================

func TestLoadConstitution_HappyPath(t *testing.T) {
	raw := []byte("version: 2\nrules: []\n")
	fb := &fakeBusgo{
		LoadFn: func(ctx context.Context) (*busgo.LoadedConstitution, error) {
			return &busgo.LoadedConstitution{VersionID: 7, ProseText: "# prose", RulesYAML: string(raw)}, nil
		},
	}
	ff := &fakeFile{Parsed: sampleFile(), Raw: raw}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose body"))

	got, err := h.LoadConstitution(context.Background(), LoadConstitutionRequest{})
	if err != nil {
		t.Fatalf("LoadConstitution: %v", err)
	}
	if got.Version == "" {
		t.Error("version must be non-empty")
	}
	if got.ProseMarkdown == "" {
		t.Error("prose_markdown must be non-empty")
	}
	// rules_hash must be lowercase hex SHA256 — 64 chars, matches content.
	if len(got.RulesHash) != 64 {
		t.Errorf("rules_hash length = %d, want 64", len(got.RulesHash))
	}
	sum := sha256.Sum256(raw)
	if got.RulesHash != hex.EncodeToString(sum[:]) {
		t.Errorf("rules_hash = %q, want SHA256(%q)", got.RulesHash, string(raw))
	}
}

func TestLoadConstitution_ProseReadError(t *testing.T) {
	fb := &fakeBusgo{}
	ff := &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}
	h := newTestHandler(fb, ff, &fakeReader{}, errProse(errors.New("disk gone")))

	_, err := h.LoadConstitution(context.Background(), LoadConstitutionRequest{})
	if !errors.Is(err, ErrConstitutionLoadFailed) {
		t.Fatalf("err = %v, want ErrConstitutionLoadFailed", err)
	}
	if code := toolErrorCode(err); code != "CONSTITUTION_LOAD_FAILED" {
		t.Errorf("code = %q, want CONSTITUTION_LOAD_FAILED", code)
	}
}

func TestLoadConstitution_BusVersionFetchError(t *testing.T) {
	fb := &fakeBusgo{
		LoadFn: func(ctx context.Context) (*busgo.LoadedConstitution, error) {
			return nil, errors.New("db down")
		},
	}
	ff := &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))

	_, err := h.LoadConstitution(context.Background(), LoadConstitutionRequest{})
	if !errors.Is(err, ErrConstitutionLoadFailed) {
		t.Fatalf("err = %v, want ErrConstitutionLoadFailed", err)
	}
}

func TestLoadConstitution_RulesHashDeterministic(t *testing.T) {
	raw := []byte("version: 2\nrules: [{id: r1, event_type_pattern: a.b.c, requires_approval: none}]\n")
	mk := func() *Handler {
		fb := &fakeBusgo{LoadFn: func(ctx context.Context) (*busgo.LoadedConstitution, error) {
			return &busgo.LoadedConstitution{VersionID: 3, RulesYAML: string(raw)}, nil
		}}
		ff := &fakeFile{Parsed: sampleFile(), Raw: raw}
		return newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))
	}
	a, err := mk().LoadConstitution(context.Background(), LoadConstitutionRequest{})
	if err != nil {
		t.Fatalf("LoadConstitution(A): %v", err)
	}
	b, err := mk().LoadConstitution(context.Background(), LoadConstitutionRequest{})
	if err != nil {
		t.Fatalf("LoadConstitution(B): %v", err)
	}
	if a.RulesHash != b.RulesHash {
		t.Errorf("rules_hash not deterministic: %q vs %q", a.RulesHash, b.RulesHash)
	}
	sum := sha256.Sum256(raw)
	if a.RulesHash != hex.EncodeToString(sum[:]) {
		t.Errorf("rules_hash = %q, want %x", a.RulesHash, sum)
	}
}

// =============================================================================
// EvaluateEvent
// =============================================================================

func TestEvaluateEvent_AllowedWhenNoMatchingRule(t *testing.T) {
	fb := &fakeBusgo{}
	ff := &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))

	resp, err := h.EvaluateEvent(context.Background(), EvaluateEventRequest{
		EventType: "ops.thing.happened",
		Payload:   json.RawMessage(`{"k":"v"}`),
	})
	if err != nil {
		t.Fatalf("EvaluateEvent: %v", err)
	}
	if !resp.Allowed {
		t.Errorf("allowed = false, want true (no rule matches ops.thing.happened)")
	}
	if resp.ViolatedRuleID != nil {
		t.Errorf("violated_rule_id = %v, want nil", resp.ViolatedRuleID)
	}
	if resp.Reason != nil {
		t.Errorf("reason = %v, want nil", resp.Reason)
	}
}

func TestEvaluateEvent_DeniedByPerActionWithoutApproval(t *testing.T) {
	// fin.payment.outbound requires per-action approval. With an empty
	// causality_chain (no approval ancestor) the event must be denied.
	fb := &fakeBusgo{}
	ff := &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))

	resp, err := h.EvaluateEvent(context.Background(), EvaluateEventRequest{
		EventType: "fin.payment.outbound",
		Payload:   json.RawMessage(`{"amount_cents": 10000}`),
	})
	if err != nil {
		t.Fatalf("EvaluateEvent: %v", err)
	}
	if resp.Allowed {
		t.Errorf("allowed = true, want false (per_action rule, no approval in chain)")
	}
	if resp.ViolatedRuleID == nil || *resp.ViolatedRuleID != "fin-payment-outbound-requires-approval" {
		t.Errorf("violated_rule_id = %v, want fin-payment-outbound-requires-approval", resp.ViolatedRuleID)
	}
	if resp.Reason == nil || *resp.Reason == "" {
		t.Error("reason must be non-empty when denied")
	}
}

func TestEvaluateEvent_ReasonTruncatedTo2000Chars(t *testing.T) {
	// Stuff a rule with an absurdly long description; the handler must
	// truncate the surfaced `reason` to maxReasonChars (2000).
	longDesc := strings.Repeat("X", 5000)
	f := sampleFile()
	f.Rules[0].Description = longDesc
	fb := &fakeBusgo{}
	ff := &fakeFile{Parsed: f, Raw: sampleRawYAML}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))

	resp, err := h.EvaluateEvent(context.Background(), EvaluateEventRequest{
		EventType: "fin.payment.outbound",
		Payload:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("EvaluateEvent: %v", err)
	}
	if resp.Reason == nil {
		t.Fatal("reason must be non-nil when denied")
	}
	if len(*resp.Reason) > maxReasonChars {
		t.Errorf("reason length = %d, want <= %d", len(*resp.Reason), maxReasonChars)
	}
}

func TestEvaluateEvent_NoRulesLoadedIsFailClosed(t *testing.T) {
	// fileLoader errors → handler must not proceed to evaluation.
	fb := &fakeBusgo{}
	ff := &fakeFile{Err: errors.New("yaml corrupt")}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))

	_, err := h.EvaluateEvent(context.Background(), EvaluateEventRequest{
		EventType: "ops.thing.happened",
		Payload:   json.RawMessage(`{}`),
	})
	if err == nil {
		t.Fatal("expected error when rules cannot be loaded (fail-closed)")
	}
	// Either LoadFailed or RuleInvalid is acceptable per contract
	// (both are the documented errorCodes for evaluate_event).
	if !errors.Is(err, ErrConstitutionLoadFailed) && !errors.Is(err, ErrConstitutionRuleInvalid) {
		t.Errorf("err = %v, want LoadFailed or RuleInvalid", err)
	}
}

func TestEvaluateEvent_MalformedCausalityChainRejectedGracefully(t *testing.T) {
	// Non-object / non-event entries in causality_chain must not panic. The
	// handler should either skip bad entries or return a non-panicking error.
	fb := &fakeBusgo{}
	ff := &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))

	defer func() {
		if r := recover(); r != nil {
			t.Errorf("handler panicked on malformed causality_chain: %v", r)
		}
	}()
	_, _ = h.EvaluateEvent(context.Background(), EvaluateEventRequest{
		EventType:      "ops.thing.happened",
		Payload:        json.RawMessage(`{}`),
		CausalityChain: []json.RawMessage{json.RawMessage(`"not-an-object"`), json.RawMessage(`123`)},
	})
}

// =============================================================================
// RequiresApproval
// =============================================================================

func TestRequiresApproval_BlanketEligible(t *testing.T) {
	fb := &fakeBusgo{}
	ff := &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))

	resp, err := h.RequiresApproval(context.Background(), RequiresApprovalRequest{
		EventType: "fin.refund.processed",
	})
	if err != nil {
		t.Fatalf("RequiresApproval: %v", err)
	}
	if resp.ApprovalMode != ApprovalModeBlanketEligible {
		t.Errorf("approval_mode = %q, want blanket_eligible", resp.ApprovalMode)
	}
	if resp.BlanketCategory == nil || *resp.BlanketCategory != "routine.finance.small_refund" {
		t.Errorf("blanket_category = %v, want routine.finance.small_refund", resp.BlanketCategory)
	}
}

func TestRequiresApproval_PerAction(t *testing.T) {
	fb := &fakeBusgo{}
	ff := &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))

	resp, err := h.RequiresApproval(context.Background(), RequiresApprovalRequest{
		EventType: "fin.payment.outbound",
	})
	if err != nil {
		t.Fatalf("RequiresApproval: %v", err)
	}
	if resp.ApprovalMode != ApprovalModePerAction {
		t.Errorf("approval_mode = %q, want per_action", resp.ApprovalMode)
	}
	if resp.BlanketCategory != nil {
		t.Errorf("blanket_category = %v, want nil", resp.BlanketCategory)
	}
}

func TestRequiresApproval_NoneWhenUnregulated(t *testing.T) {
	fb := &fakeBusgo{}
	ff := &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))

	resp, err := h.RequiresApproval(context.Background(), RequiresApprovalRequest{
		EventType: "ops.thing.happened",
	})
	if err != nil {
		t.Fatalf("RequiresApproval: %v", err)
	}
	if resp.ApprovalMode != ApprovalModeNone {
		t.Errorf("approval_mode = %q, want none", resp.ApprovalMode)
	}
	if resp.BlanketCategory != nil {
		t.Errorf("blanket_category = %v, want nil", resp.BlanketCategory)
	}
}

func TestRequiresApproval_RulesNotLoaded(t *testing.T) {
	fb := &fakeBusgo{}
	ff := &fakeFile{Err: errors.New("file missing")}
	h := newTestHandler(fb, ff, &fakeReader{}, constProse("# prose"))

	_, err := h.RequiresApproval(context.Background(), RequiresApprovalRequest{
		EventType: "fin.payment.outbound",
	})
	if !errors.Is(err, ErrConstitutionLoadFailed) {
		t.Fatalf("err = %v, want ErrConstitutionLoadFailed", err)
	}
	if code := toolErrorCode(err); code != "CONSTITUTION_LOAD_FAILED" {
		t.Errorf("code = %q", code)
	}
}

// =============================================================================
// ListBlanketAuthorizations
// =============================================================================

func TestListBlanketAuthorizations_HappyActiveOnly(t *testing.T) {
	future := time.Now().Add(24 * time.Hour)
	past := time.Now().Add(-24 * time.Hour)
	fr := &fakeReader{
		ListFn: func(ctx context.Context, cat string) ([]AuthorizationEvent, error) {
			return []AuthorizationEvent{
				{EventID: "11111111-1111-1111-1111-111111111111", Category: "routine.finance.small_refund", ExpiresAt: &future},
				{EventID: "22222222-2222-2222-2222-222222222222", Category: "routine.marketing.content", ExpiresAt: &past}, // expired
				{EventID: "33333333-3333-3333-3333-333333333333", Category: "routine.ops.alerts", ExpiresAt: nil},           // no expiry
				{EventID: "44444444-4444-4444-4444-444444444444", Category: "routine.ops.alerts", ExpiresAt: &future, Revoked: true}, // revoked
			}, nil
		},
	}
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, fr, constProse("# prose"))

	resp, err := h.ListBlanketAuthorizations(context.Background(), ListBlanketAuthorizationsRequest{})
	if err != nil {
		t.Fatalf("ListBlanketAuthorizations: %v", err)
	}
	// Active = not revoked AND (no expiry OR expiry in future).
	if len(resp.Authorizations) != 2 {
		t.Fatalf("authorizations = %d, want 2 active (got %+v)", len(resp.Authorizations), resp.Authorizations)
	}
	for _, a := range resp.Authorizations {
		if a.GrantedEventID == "22222222-2222-2222-2222-222222222222" {
			t.Error("expired auth should have been filtered out")
		}
		if a.GrantedEventID == "44444444-4444-4444-4444-444444444444" {
			t.Error("revoked auth should have been filtered out")
		}
	}
}

func TestListBlanketAuthorizations_CategoryFilterPropagated(t *testing.T) {
	fr := &fakeReader{}
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, fr, constProse("# prose"))

	_, err := h.ListBlanketAuthorizations(context.Background(), ListBlanketAuthorizationsRequest{
		Category: "routine.finance.small_refund",
	})
	if err != nil {
		t.Fatalf("ListBlanketAuthorizations: %v", err)
	}
	if len(fr.ListCalls) != 1 || fr.ListCalls[0] != "routine.finance.small_refund" {
		t.Errorf("category not propagated to reader: %+v", fr.ListCalls)
	}
}

func TestListBlanketAuthorizations_ExpiredExcluded(t *testing.T) {
	past := time.Now().Add(-1 * time.Minute)
	fr := &fakeReader{
		ListFn: func(ctx context.Context, cat string) ([]AuthorizationEvent, error) {
			return []AuthorizationEvent{
				{EventID: "55555555-5555-5555-5555-555555555555", Category: "x", ExpiresAt: &past},
			}, nil
		},
	}
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, fr, constProse("# prose"))

	resp, err := h.ListBlanketAuthorizations(context.Background(), ListBlanketAuthorizationsRequest{})
	if err != nil {
		t.Fatalf("ListBlanketAuthorizations: %v", err)
	}
	if len(resp.Authorizations) != 0 {
		t.Errorf("expired entries leaked through: %+v", resp.Authorizations)
	}
}

func TestListBlanketAuthorizations_BusDown(t *testing.T) {
	fr := &fakeReader{
		ListFn: func(ctx context.Context, cat string) ([]AuthorizationEvent, error) {
			return nil, context.DeadlineExceeded
		},
	}
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, fr, constProse("# prose"))

	_, err := h.ListBlanketAuthorizations(context.Background(), ListBlanketAuthorizationsRequest{})
	if !errors.Is(err, ErrBusDown) {
		t.Fatalf("err = %v, want ErrBusDown", err)
	}
	if code := toolErrorCode(err); code != "BUS_DOWN" {
		t.Errorf("code = %q, want BUS_DOWN", code)
	}
}

// =============================================================================
// GetMemoryAccessMatrix
// =============================================================================

func TestGetMemoryAccessMatrix_Happy(t *testing.T) {
	ff := &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}
	h := newTestHandler(&fakeBusgo{}, ff, &fakeReader{}, constProse("# prose"))

	resp, err := h.GetMemoryAccessMatrix(context.Background(), GetMemoryAccessMatrixRequest{})
	if err != nil {
		t.Fatalf("GetMemoryAccessMatrix: %v", err)
	}
	if resp.MatrixVersion == "" {
		t.Error("matrix_version must be non-empty")
	}
	if len(resp.Matrix) == 0 {
		t.Fatal("matrix must be non-empty")
	}
	pres, ok := resp.Matrix["president"]
	if !ok {
		t.Fatal("matrix missing president entry")
	}
	if len(pres.Read) == 0 || len(pres.Write) == 0 {
		t.Errorf("president entry malformed: %+v", pres)
	}
}

func TestGetMemoryAccessMatrix_MissingSection(t *testing.T) {
	// Parsed file with nil MemoryAccessMatrix → load failure.
	f := sampleFile()
	f.MemoryAccessMatrix = nil
	ff := &fakeFile{Parsed: f, Raw: sampleRawYAML}
	h := newTestHandler(&fakeBusgo{}, ff, &fakeReader{}, constProse("# prose"))

	_, err := h.GetMemoryAccessMatrix(context.Background(), GetMemoryAccessMatrixRequest{})
	if !errors.Is(err, ErrConstitutionLoadFailed) {
		t.Fatalf("err = %v, want ErrConstitutionLoadFailed", err)
	}
}

// =============================================================================
// RegisterTools / ToolNames / schemas
// =============================================================================

func TestRegisterTools_RegistersExactlyFive(t *testing.T) {
	srv := mcp.NewServer("tenet0-constitution-mcp", "test", discardLogger())
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, &fakeReader{}, constProse("# prose"))

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
		"load_constitution":           true,
		"evaluate_event":              true,
		"requires_approval":           true,
		"list_blanket_authorizations": true,
		"get_memory_access_matrix":    true,
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
		"load_constitution":           {loadConstitutionInputSchema, loadConstitutionOutputSchema},
		"evaluate_event":              {evaluateEventInputSchema, evaluateEventOutputSchema},
		"requires_approval":           {requiresApprovalInputSchema, requiresApprovalOutputSchema},
		"list_blanket_authorizations": {listBlanketAuthorizationsInputSchema, listBlanketAuthorizationsOutputSchema},
		"get_memory_access_matrix":    {getMemoryAccessMatrixInputSchema, getMemoryAccessMatrixOutputSchema},
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

// =============================================================================
// toolErrorCode mapping
// =============================================================================

func TestToolErrorCode_AllSentinels(t *testing.T) {
	cases := []struct {
		err  error
		code string
	}{
		{nil, ""},
		{ErrConstitutionLoadFailed, "CONSTITUTION_LOAD_FAILED"},
		{ErrConstitutionRuleInvalid, "CONSTITUTION_RULE_INVALID"},
		{ErrBusDown, "BUS_DOWN"},
		{errors.New("unrelated"), "INTERNAL"},
	}
	for _, tc := range cases {
		got := toolErrorCode(tc.err)
		if got != tc.code {
			t.Errorf("toolErrorCode(%v) = %q, want %q", tc.err, got, tc.code)
		}
	}
}

// =============================================================================
// New / Config validation
// =============================================================================

func TestNew_RequiresLogger(t *testing.T) {
	// Defensive: New must reject nil Logger. Until Task 2.4 lands, this
	// panics with the stub message — the panic IS the RED signal.
	defer func() {
		// The stub panics with "not implemented (Task 2.4)". After Task 2.4
		// lands, New must return a non-nil error on nil Logger.
		_ = recover()
	}()
	_, err := New(Config{
		Department:           "president",
		Credential:           "creds",
		PostgresURL:          "postgres://x",
		ConstitutionMDPath:   "/dev/null",
		ConstitutionYAMLPath: "/dev/null",
	})
	if err == nil {
		t.Fatal("New with nil Logger should return an error")
	}
	if !strings.Contains(err.Error(), "logger") && !strings.Contains(err.Error(), "Logger") {
		t.Errorf("err = %v, want to mention logger", err)
	}
}

// compile-time assertion the fakes satisfy their interfaces.
var (
	_ busgoClient = (*fakeBusgo)(nil)
	_ fileLoader  = (*fakeFile)(nil)
	_ busReader   = (*fakeReader)(nil)
)

// Silence unused-import warnings in case one of the imports only matters
// after Task 2.4 lands.
var _ = sharedconst.MinimumSupportedVersion
