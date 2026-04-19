package mcp

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	mcplib "github.com/mark3labs/mcp-go/mcp"
)

func TestError_ErrorString(t *testing.T) {
	e := &Error{Err: "bad", Code: "X"}
	got := e.Error()
	if !strings.Contains(got, "bad") || !strings.Contains(got, "X") {
		t.Errorf("Error() = %q", got)
	}
	// Without code.
	e2 := &Error{Err: "lonely"}
	if e2.Error() != "lonely" {
		t.Errorf("no-code Error() = %q", e2.Error())
	}
	// Nil safety.
	var nilE *Error
	if nilE.Error() != "" {
		t.Error("nil Error.Error must be empty")
	}
}

func TestRegisterTool_Validations(t *testing.T) {
	s := NewServer("t", "0.0.1", discardLogger())
	if err := s.RegisterTool(Tool{Name: ""}); err == nil {
		t.Error("empty Name should fail")
	}
	if err := s.RegisterTool(Tool{Name: "x", Handler: nil}); err == nil {
		t.Error("nil Handler should fail")
	}
}

func TestValidateOutput_NoSchema(t *testing.T) {
	if err := validateOutput(nil, json.RawMessage(`{}`)); err != nil {
		t.Errorf("nil schema should not validate: %v", err)
	}
}

func TestValidateOutput_NonObjectSchemaPasses(t *testing.T) {
	// Minimal validator only handles object schemas; others are skipped.
	if err := validateOutput(json.RawMessage(`{"type":"string"}`), json.RawMessage(`"hi"`)); err != nil {
		t.Errorf("non-object schema should pass: %v", err)
	}
}

func TestValidateOutput_InstanceNotObject(t *testing.T) {
	err := validateOutput(json.RawMessage(`{"type":"object"}`), json.RawMessage(`"not-an-object"`))
	if err == nil {
		t.Error("expected error for non-object instance against object schema")
	}
}

func TestValidateOutput_BadSchema(t *testing.T) {
	err := validateOutput(json.RawMessage(`not-json`), json.RawMessage(`{}`))
	if err == nil {
		t.Error("expected error for unparseable schema")
	}
}

func TestValidateOutput_PropertyTypeMismatchVariants(t *testing.T) {
	cases := []struct {
		name     string
		schema   string
		instance string
		wantErr  bool
	}{
		{"string ok", `{"type":"object","properties":{"a":{"type":"string"}}}`, `{"a":"x"}`, false},
		{"string bad", `{"type":"object","properties":{"a":{"type":"string"}}}`, `{"a":1}`, true},
		{"number ok", `{"type":"object","properties":{"a":{"type":"number"}}}`, `{"a":1.5}`, false},
		{"number bad", `{"type":"object","properties":{"a":{"type":"number"}}}`, `{"a":"x"}`, true},
		{"boolean ok", `{"type":"object","properties":{"a":{"type":"boolean"}}}`, `{"a":true}`, false},
		{"boolean bad", `{"type":"object","properties":{"a":{"type":"boolean"}}}`, `{"a":1}`, true},
		{"integer ok", `{"type":"object","properties":{"a":{"type":"integer"}}}`, `{"a":3}`, false},
		{"integer bad fractional", `{"type":"object","properties":{"a":{"type":"integer"}}}`, `{"a":1.5}`, true},
		{"array ok", `{"type":"object","properties":{"a":{"type":"array"}}}`, `{"a":[1,2]}`, false},
		{"array bad", `{"type":"object","properties":{"a":{"type":"array"}}}`, `{"a":"x"}`, true},
		{"object ok", `{"type":"object","properties":{"a":{"type":"object"}}}`, `{"a":{}}`, false},
		{"object bad", `{"type":"object","properties":{"a":{"type":"object"}}}`, `{"a":1}`, true},
		{"null ok", `{"type":"object","properties":{"a":{"type":"null"}}}`, `{"a":null}`, false},
		{"unknown type passes", `{"type":"object","properties":{"a":{"type":"weird"}}}`, `{"a":1}`, false},
		{"missing optional skipped", `{"type":"object","properties":{"a":{"type":"string"}}}`, `{}`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateOutput(json.RawMessage(tc.schema), json.RawMessage(tc.instance))
			if tc.wantErr && err == nil {
				t.Errorf("want error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Errorf("want nil, got %v", err)
			}
		})
	}
}

func TestMakeLibHandler_HappyPath(t *testing.T) {
	s := NewServer("t", "0.0.1", discardLogger())
	tool := Tool{
		Name:         "echo",
		InputSchema:  json.RawMessage(`{"type":"object"}`),
		OutputSchema: json.RawMessage(`{"type":"object"}`),
		Handler: func(ctx context.Context, _ json.RawMessage) (any, error) {
			return map[string]any{"ok": true}, nil
		},
	}
	if err := s.RegisterTool(tool); err != nil {
		t.Fatalf("RegisterTool: %v", err)
	}
	h := s.makeLibHandler(tool)
	req := mcplib.CallToolRequest{}
	res, err := h(context.Background(), req)
	if err != nil {
		t.Fatalf("handler: %v", err)
	}
	if res == nil || res.IsError {
		t.Errorf("expected success result, got %+v", res)
	}
}

func TestMakeLibHandler_PanicYieldsErrorResult(t *testing.T) {
	s := NewServer("t", "0.0.1", discardLogger())
	tool := Tool{
		Name:         "boom",
		InputSchema:  json.RawMessage(`{"type":"object"}`),
		OutputSchema: json.RawMessage(`{"type":"object"}`),
		Handler: func(ctx context.Context, _ json.RawMessage) (any, error) {
			panic("kaboom")
		},
	}
	_ = s.RegisterTool(tool)
	h := s.makeLibHandler(tool)
	res, err := h(context.Background(), mcplib.CallToolRequest{})
	if err != nil {
		t.Fatalf("handler returned protocol-level err: %v", err)
	}
	if res == nil || !res.IsError {
		t.Errorf("expected IsError result, got %+v", res)
	}
	// And the body should not contain the raw panic message.
	body, _ := json.Marshal(res.Content)
	if strings.Contains(string(body), "kaboom") {
		t.Errorf("panic value leaked into result: %s", body)
	}
}

func TestRun_HonoursContextCancel(t *testing.T) {
	s := NewServer("t", "0.0.1", discardLogger())
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel before Run starts the read loop.
	done := make(chan error, 1)
	go func() { done <- s.Run(ctx) }()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("Run after cancel returned %v, want nil", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not exit on ctx cancel")
	}
}

func TestRunTool_NonSerialisableResult(t *testing.T) {
	s := NewServer("t", "0.0.1", discardLogger())
	_ = s.RegisterTool(Tool{
		Name:        "ch",
		InputSchema: json.RawMessage(`{}`),
		Handler: func(ctx context.Context, _ json.RawMessage) (any, error) {
			// channels do not JSON-marshal.
			return make(chan int), nil
		},
	})
	_, err := s.invokeTool(context.Background(), "ch", json.RawMessage(`{}`))
	if err == nil || err.Code != "ENCODE_ERROR" {
		t.Errorf("expected ENCODE_ERROR, got %+v", err)
	}
}
