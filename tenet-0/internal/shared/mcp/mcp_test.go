package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestNewServer_RequiresLogger(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			// Must either panic or return non-nil Server with safe default.
			// We assert: nil logger is rejected.
		}
	}()
	s := NewServer("test", "0.0.1", nil)
	if s != nil {
		t.Error("NewServer with nil logger should not return a usable Server")
	}
}

func TestRegisterTool_DuplicateNameRejected(t *testing.T) {
	s := NewServer("test", "0.0.1", discardLogger())

	tool := Tool{
		Name:         "echo",
		Description:  "test",
		InputSchema:  json.RawMessage(`{"type":"object"}`),
		OutputSchema: json.RawMessage(`{"type":"object"}`),
		Handler: func(ctx context.Context, input json.RawMessage) (any, error) {
			return map[string]any{"ok": true}, nil
		},
	}
	if err := s.RegisterTool(tool); err != nil {
		t.Fatalf("first RegisterTool failed: %v", err)
	}
	if err := s.RegisterTool(tool); err == nil {
		t.Fatal("duplicate RegisterTool should return error")
	}
}

func TestInvokeTool_HappyPath(t *testing.T) {
	s := NewServer("test", "0.0.1", discardLogger())
	_ = s.RegisterTool(Tool{
		Name:         "echo",
		InputSchema:  json.RawMessage(`{"type":"object"}`),
		OutputSchema: json.RawMessage(`{"type":"object","required":["echoed"],"properties":{"echoed":{"type":"string"}}}`),
		Handler: func(ctx context.Context, input json.RawMessage) (any, error) {
			return map[string]any{"echoed": "hi"}, nil
		},
	})

	out, err := s.invokeTool(context.Background(), "echo", json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("invokeTool returned error: %+v", err)
	}
	if !strings.Contains(string(out), `"echoed"`) {
		t.Errorf("output = %s, missing echoed", out)
	}
}

func TestInvokeTool_PanicReturnsErrorEnvelope(t *testing.T) {
	s := NewServer("test", "0.0.1", discardLogger())
	_ = s.RegisterTool(Tool{
		Name:         "boom",
		InputSchema:  json.RawMessage(`{"type":"object"}`),
		OutputSchema: json.RawMessage(`{"type":"object"}`),
		Handler: func(ctx context.Context, input json.RawMessage) (any, error) {
			panic("kaboom")
		},
	})

	out, err := s.invokeTool(context.Background(), "boom", json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("panic in handler must surface as Error envelope")
	}
	if err.Code == "" {
		t.Error("Error.Code must be populated for panics")
	}
	if strings.Contains(err.Err, "kaboom") {
		t.Error("Error.Err must NOT leak raw panic message to caller")
	}
	if strings.Contains(string(out), "kaboom") {
		t.Error("output must NOT leak raw panic message")
	}
}

func TestInvokeTool_ReturnsErrorEnvelopeForHandlerError(t *testing.T) {
	s := NewServer("test", "0.0.1", discardLogger())
	_ = s.RegisterTool(Tool{
		Name:         "fail",
		InputSchema:  json.RawMessage(`{"type":"object"}`),
		OutputSchema: json.RawMessage(`{"type":"object"}`),
		Handler: func(ctx context.Context, input json.RawMessage) (any, error) {
			return nil, errors.New("handler said no")
		},
	})

	_, err := s.invokeTool(context.Background(), "fail", json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("handler error must surface as Error envelope")
	}
	if err.Code == "" {
		t.Error("Error.Code required")
	}
}

func TestInvokeTool_OutputSchemaMismatchDetected(t *testing.T) {
	// RES-1 — wrapper enforces output schema even though mark3labs SDK
	// does not. Schema requires `count`:integer; handler returns string.
	s := NewServer("test", "0.0.1", discardLogger())
	_ = s.RegisterTool(Tool{
		Name:         "bad-output",
		InputSchema:  json.RawMessage(`{"type":"object"}`),
		OutputSchema: json.RawMessage(`{"type":"object","required":["count"],"properties":{"count":{"type":"integer"}}}`),
		Handler: func(ctx context.Context, input json.RawMessage) (any, error) {
			return map[string]any{"count": "not-a-number"}, nil
		},
	})

	_, err := s.invokeTool(context.Background(), "bad-output", json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("output schema violation must be detected and surfaced")
	}
}

func TestInvokeTool_UnknownToolReturnsError(t *testing.T) {
	s := NewServer("test", "0.0.1", discardLogger())
	_, err := s.invokeTool(context.Background(), "nope", json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("unknown tool must return Error envelope")
	}
}

func TestInvokeTool_RespectsContextCancellation(t *testing.T) {
	s := NewServer("test", "0.0.1", discardLogger())
	_ = s.RegisterTool(Tool{
		Name:         "slow",
		InputSchema:  json.RawMessage(`{"type":"object"}`),
		OutputSchema: json.RawMessage(`{"type":"object"}`),
		Handler: func(ctx context.Context, input json.RawMessage) (any, error) {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(5 * time.Second):
				return map[string]any{}, nil
			}
		},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := s.invokeTool(ctx, "slow", json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected error when context cancelled")
	}
	if time.Since(start) > 2*time.Second {
		t.Errorf("invoke didn't honor cancellation; took %v", time.Since(start))
	}
}
