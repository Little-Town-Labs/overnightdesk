package constitution

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	sharedconst "github.com/overnightdesk/tenet-0/internal/shared/constitution"
	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
)

// --- pure helpers -----------------------------------------------------------

func TestRuleMatches_WildcardAndExact(t *testing.T) {
	cases := []struct {
		pat   string
		event string
		want  bool
	}{
		{"fin.payment.outbound", "fin.payment.outbound", true},
		{"fin.payment.outbound", "fin.payment.inbound", false},
		{"secops.violation.*", "secops.violation.detected", true},
		{"secops.violation.*", "secops.violation.x.y", true},
		{"secops.violation.*", "secops.other.thing", false},
		{"", "anything", false},
	}
	for _, c := range cases {
		got := ruleMatches(sharedconst.Rule{EventTypePattern: c.pat}, c.event)
		if got != c.want {
			t.Errorf("ruleMatches(%q,%q)=%v want %v", c.pat, c.event, got, c.want)
		}
	}
}

func TestCausalityHasApproval(t *testing.T) {
	// Includes malformed + valid + unrelated entries.
	chain := []json.RawMessage{
		json.RawMessage(`"not an object"`),
		json.RawMessage(`{"event_type":"ops.thing.happened"}`),
		json.RawMessage(`{"event_type":"president.approved","payload":{"target":"x"}}`),
	}
	if !causalityHasApproval(chain) {
		t.Error("expected approval present")
	}

	none := []json.RawMessage{
		json.RawMessage(`{"event_type":"ops.thing.happened"}`),
	}
	if causalityHasApproval(none) {
		t.Error("expected no approval")
	}

	// Empty + nil entries must not panic.
	weird := []json.RawMessage{nil, json.RawMessage(``), json.RawMessage(`{}`)}
	if causalityHasApproval(weird) {
		t.Error("expected no approval in weird chain")
	}
}

func TestCausalityHasApproval_GrantedVariant(t *testing.T) {
	chain := []json.RawMessage{
		json.RawMessage(`{"event_type":"president.approval.granted"}`),
	}
	if !causalityHasApproval(chain) {
		t.Error("expected granted variant recognised")
	}
}

func TestTruncateReason(t *testing.T) {
	if got := truncateReason(""); got != nil {
		t.Errorf("empty → nil, got %v", *got)
	}
	small := truncateReason("hi")
	if small == nil || *small != "hi" {
		t.Errorf("small untouched, got %v", small)
	}
	big := strings.Repeat("y", maxReasonChars+500)
	trimmed := truncateReason(big)
	if trimmed == nil || len(*trimmed) != maxReasonChars {
		t.Errorf("truncate to %d, got %d", maxReasonChars, func() int {
			if trimmed == nil {
				return -1
			}
			return len(*trimmed)
		}())
	}
}

// --- EvaluateEvent extra branches -------------------------------------------

func TestEvaluateEvent_AllowedWithApprovalAncestor(t *testing.T) {
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	resp, err := h.EvaluateEvent(context.Background(), EvaluateEventRequest{
		EventType: "fin.payment.outbound",
		Payload:   json.RawMessage(`{}`),
		CausalityChain: []json.RawMessage{
			json.RawMessage(`{"event_type":"president.approved"}`),
		},
	})
	if err != nil {
		t.Fatalf("EvaluateEvent: %v", err)
	}
	if !resp.Allowed {
		t.Errorf("expected allowed with approval ancestor")
	}
}

func TestEvaluateEvent_BlanketCategoryAllows(t *testing.T) {
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	resp, err := h.EvaluateEvent(context.Background(), EvaluateEventRequest{
		EventType: "fin.refund.processed",
		Payload:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("EvaluateEvent: %v", err)
	}
	if !resp.Allowed {
		t.Errorf("blanket_category match should pre-allow")
	}
}

func TestEvaluateEvent_NoneExplicit(t *testing.T) {
	// secops.violation.* rule has requires_approval "none".
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	resp, err := h.EvaluateEvent(context.Background(), EvaluateEventRequest{
		EventType: "secops.violation.detected",
		Payload:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("EvaluateEvent: %v", err)
	}
	if !resp.Allowed {
		t.Error("requires_approval: none should allow")
	}
}

func TestEvaluateEvent_UnknownRequiresApprovalMode(t *testing.T) {
	f := sampleFile()
	f.Rules = []sharedconst.Rule{{
		ID:               "bad",
		EventTypePattern: "ops.thing.happened",
		RequiresApproval: "NOT_A_REAL_MODE",
	}}
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: f, Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	_, err := h.EvaluateEvent(context.Background(), EvaluateEventRequest{
		EventType: "ops.thing.happened",
		Payload:   json.RawMessage(`{}`),
	})
	if !errors.Is(err, ErrConstitutionRuleInvalid) {
		t.Fatalf("err=%v want ErrConstitutionRuleInvalid", err)
	}
}

func TestEvaluateEvent_EmptyRulesListFailsClosed(t *testing.T) {
	f := sampleFile()
	f.Rules = nil
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: f, Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	_, err := h.EvaluateEvent(context.Background(), EvaluateEventRequest{
		EventType: "ops.thing.happened",
		Payload:   json.RawMessage(`{}`),
	})
	if !errors.Is(err, ErrConstitutionRuleInvalid) {
		t.Fatalf("err=%v want ErrConstitutionRuleInvalid", err)
	}
}

// --- RequiresApproval extra branches ---------------------------------------

func TestRequiresApproval_UnknownMode(t *testing.T) {
	f := sampleFile()
	f.Rules = []sharedconst.Rule{{
		ID:               "bad",
		EventTypePattern: "fin.payment.outbound",
		RequiresApproval: "WEIRD",
	}}
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: f, Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	_, err := h.RequiresApproval(context.Background(), RequiresApprovalRequest{EventType: "fin.payment.outbound"})
	if !errors.Is(err, ErrConstitutionRuleInvalid) {
		t.Fatalf("err=%v want ErrConstitutionRuleInvalid", err)
	}
}

func TestRequiresApproval_ExplicitNoneRule(t *testing.T) {
	// Hit the "" / none branch of the match-path by using a rule with mode "none".
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	resp, err := h.RequiresApproval(context.Background(), RequiresApprovalRequest{EventType: "secops.violation.detected"})
	if err != nil {
		t.Fatalf("RequiresApproval: %v", err)
	}
	if resp.ApprovalMode != ApprovalModeNone {
		t.Errorf("approval_mode=%q want none", resp.ApprovalMode)
	}
}

// --- GetMemoryAccessMatrix edge: nil read/write slices ---------------------

func TestGetMemoryAccessMatrix_NilReadWriteSlices(t *testing.T) {
	f := sampleFile()
	f.MemoryAccessMatrix = map[string]sharedconst.MatrixEntry{
		"tech": {Read: nil, Write: nil},
	}
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: f, Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	resp, err := h.GetMemoryAccessMatrix(context.Background(), GetMemoryAccessMatrixRequest{})
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	entry, ok := resp.Matrix["tech"]
	if !ok {
		t.Fatal("tech entry missing")
	}
	if entry.Read == nil || entry.Write == nil {
		t.Errorf("nil slices should be normalized to [] not nil: %+v", entry)
	}
}

// --- Handler.Close --------------------------------------------------------

func TestHandler_Close_NilSafe(t *testing.T) {
	var h *Handler
	h.Close() // must not panic
}

func TestHandler_Close_FakeAdaptersNoOp(t *testing.T) {
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	h.Close() // fakes don't satisfy closer — must be a no-op
	h.Close() // idempotent
}

// --- New validation branches (pre-bus-connect) ----------------------------

func TestNew_RequiresPostgresURL(t *testing.T) {
	_, err := New(Config{Logger: discardLogger()})
	if err == nil || !strings.Contains(err.Error(), "PostgresURL") {
		t.Errorf("want PostgresURL required, got %v", err)
	}
}

func TestNew_BadSchemeRejected(t *testing.T) {
	_, err := New(Config{Logger: discardLogger(), PostgresURL: "mysql://x"})
	if err == nil || !strings.Contains(err.Error(), "scheme") {
		t.Errorf("want scheme rejected, got %v", err)
	}
}

func TestNew_RequiresConstitutionMDPath(t *testing.T) {
	_, err := New(Config{Logger: discardLogger(), PostgresURL: "postgres://x"})
	if err == nil || !strings.Contains(err.Error(), "ConstitutionMDPath") {
		t.Errorf("want ConstitutionMDPath required, got %v", err)
	}
}

func TestNew_RequiresConstitutionYAMLPath(t *testing.T) {
	_, err := New(Config{
		Logger:             discardLogger(),
		PostgresURL:        "postgres://x",
		ConstitutionMDPath: "/dev/null",
	})
	if err == nil || !strings.Contains(err.Error(), "ConstitutionYAMLPath") {
		t.Errorf("want ConstitutionYAMLPath required, got %v", err)
	}
}

func TestNew_YAMLLoadFailure(t *testing.T) {
	_, err := New(Config{
		Logger:               discardLogger(),
		PostgresURL:          "postgres://localhost/notreal",
		ConstitutionMDPath:   "/dev/null",
		ConstitutionYAMLPath: "/tmp/does-not-exist-constitution.yaml",
	})
	if err == nil || !strings.Contains(err.Error(), "load yaml") {
		t.Errorf("want yaml load failure, got %v", err)
	}
}

// writeValidYAML writes a minimal v2 YAML to dir/rules.yaml and returns the
// path. Used by New tests that need sharedconst.LoadFromFile to succeed.
func writeValidYAML(t *testing.T, dir string) string {
	t.Helper()
	p := filepath.Join(dir, "rules.yaml")
	err := os.WriteFile(p, []byte(`version: 2
rules: []
memory_access_matrix:
  president: {read: [president], write: [president]}
memory_scrubber:
  version: 1
  layers:
    - name: unicode_normalize
      enabled: true
`), 0o600)
	if err != nil {
		t.Fatalf("write yaml: %v", err)
	}
	return p
}

func TestNew_BusgoConnectFailureSurfaces(t *testing.T) {
	dir := t.TempDir()
	yamlPath := writeValidYAML(t, dir)
	mdPath := filepath.Join(dir, "constitution.md")
	if err := os.WriteFile(mdPath, []byte("# prose"), 0o600); err != nil {
		t.Fatalf("write md: %v", err)
	}

	// 127.0.0.1 on a port with no listener — connect will fail promptly.
	_, err := New(Config{
		Logger:               discardLogger(),
		PostgresURL:          "postgres://noone:nopass@127.0.0.1:1/nodb?sslmode=disable&connect_timeout=1",
		ConstitutionMDPath:   mdPath,
		ConstitutionYAMLPath: yamlPath,
	})
	if err == nil {
		t.Fatal("expected connect failure")
	}
	if !strings.Contains(err.Error(), "bus-go connect") && !strings.Contains(err.Error(), "constitution.New") {
		t.Errorf("unexpected err: %v", err)
	}
}

func TestNew_MDStatFailure(t *testing.T) {
	// Need a parseable YAML that passes sharedconst validation (v2+ matrix + scrubber).
	dir := t.TempDir()
	yamlPath := filepath.Join(dir, "rules.yaml")
	_ = os.WriteFile(yamlPath, []byte(`version: 2
rules: []
memory_access_matrix:
  president:
    read: [president]
    write: [president]
memory_scrubber:
  version: 1
  layers:
    - name: unicode_normalize
      enabled: true
`), 0o600)

	_, err := New(Config{
		Logger:               discardLogger(),
		PostgresURL:          "postgres://localhost/notreal",
		ConstitutionMDPath:   filepath.Join(dir, "no-such-md"),
		ConstitutionYAMLPath: yamlPath,
	})
	if err == nil || !strings.Contains(err.Error(), "constitution.md") {
		t.Errorf("want md stat failure, got %v", err)
	}
}

// --- proseFromPath ---------------------------------------------------------

func TestProseFromPath_HappyAndError(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "c.md")
	_ = os.WriteFile(p, []byte("# hello"), 0o600)
	fn := proseFromPath(p)
	got, err := fn()
	if err != nil || got != "# hello" {
		t.Errorf("happy: got=%q err=%v", got, err)
	}

	fn2 := proseFromPath(filepath.Join(dir, "missing.md"))
	if _, err := fn2(); err == nil {
		t.Error("expected read error")
	}
}

// --- fileAdapter -----------------------------------------------------------

func TestFileAdapter_ReadFailure(t *testing.T) {
	a := &fileAdapter{path: "/no/such/yaml"}
	_, _, err := a.Load()
	if err == nil {
		t.Error("expected read error")
	}
}

func TestFileAdapter_Happy(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "r.yaml")
	_ = os.WriteFile(p, []byte(`version: 2
rules: []
memory_access_matrix:
  president: {read: [president], write: [president]}
memory_scrubber:
  version: 1
  layers:
    - name: unicode_normalize
      enabled: true
`), 0o600)
	a := &fileAdapter{path: p}
	f, raw, err := a.Load()
	if err != nil {
		t.Fatalf("err=%v", err)
	}
	if f.Version != 2 {
		t.Errorf("version=%d", f.Version)
	}
	if len(raw) == 0 {
		t.Error("raw empty")
	}
}

// --- Production adapters: close() no-op branches --------------------------

func TestBusgoAdapter_CloseNilBus(t *testing.T) {
	a := &busgoAdapter{closer: nil}
	a.close() // must not panic
}

func TestBusReaderAdapter_CloseNilPool(t *testing.T) {
	a := &busReaderAdapter{pool: nil}
	a.close() // must not panic
}

// --- RegisterTools RSVP: hit every per-tool handler lambda once -----------

func TestRegisterTools_EachToolDispatchable(t *testing.T) {
	srv := mcp.NewServer("tenet0-constitution-mcp", "test", discardLogger())
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	if err := h.RegisterTools(srv); err != nil {
		t.Fatalf("RegisterTools: %v", err)
	}
}

func TestBuildTools_InvokeEachLambda(t *testing.T) {
	h := newTestHandler(&fakeBusgo{}, &fakeFile{Parsed: sampleFile(), Raw: sampleRawYAML}, &fakeReader{}, constProse("# p"))
	tools := h.buildTools()
	if len(tools) != len(ToolNames) {
		t.Fatalf("buildTools len=%d want %d", len(tools), len(ToolNames))
	}

	ctx := context.Background()
	inputs := map[string]json.RawMessage{
		"load_constitution":           json.RawMessage(`{}`),
		"evaluate_event":              json.RawMessage(`{"event_type":"ops.thing.happened","payload":{}}`),
		"requires_approval":           json.RawMessage(`{"event_type":"ops.thing.happened"}`),
		"list_blanket_authorizations": json.RawMessage(`{}`),
		"get_memory_access_matrix":    json.RawMessage(`{}`),
	}
	for _, tool := range tools {
		in, ok := inputs[tool.Name]
		if !ok {
			t.Errorf("no input for tool %q", tool.Name)
			continue
		}
		if _, err := tool.Handler(ctx, in); err != nil {
			t.Errorf("tool %q handler err=%v", tool.Name, err)
		}
	}

	// Also exercise the null-input branch (load_constitution / list / matrix
	// accept null); and an invalid-JSON branch for evaluate_event +
	// requires_approval to hit the err returns in their lambdas.
	for _, tool := range tools {
		switch tool.Name {
		case "load_constitution", "list_blanket_authorizations", "get_memory_access_matrix":
			if _, err := tool.Handler(ctx, json.RawMessage(`null`)); err != nil {
				t.Errorf("%q null input: %v", tool.Name, err)
			}
		case "evaluate_event", "requires_approval":
			if _, err := tool.Handler(ctx, json.RawMessage(`{not-json`)); err == nil {
				t.Errorf("%q expected unmarshal error", tool.Name)
			}
		}
	}
}
