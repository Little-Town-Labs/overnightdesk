// Package mcp wraps github.com/mark3labs/mcp-go with Tenet-0 conventions:
// stdio transport, slog-driven logging, panic recovery in tool handlers,
// and an output-validation layer that compensates for the upstream SDK's
// broken output schema enforcement (research.md RES-1).
//
// The internal `invokeTool` test seam dispatches against an in-memory
// registry independent of mcp-go so panic recovery, output validation,
// and unknown-tool handling can be exercised without a stdio transport.
// The Run() path registers all tools with mcp-go and serves stdio.
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"

	mcplib "github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

// InputSchema is a JSON-Schema fragment describing a tool's input.
type InputSchema = json.RawMessage

// OutputSchema is the JSON-Schema fragment describing a tool's output.
type OutputSchema = json.RawMessage

// ToolHandler is the user function for a tool. Returns either a struct that
// JSON-encodes to the declared OutputSchema or an error. Panics are caught
// by the wrapper and converted to a structured Error envelope.
type ToolHandler func(ctx context.Context, input json.RawMessage) (any, error)

// Tool aggregates the per-tool registration metadata.
type Tool struct {
	Name         string
	Description  string
	InputSchema  InputSchema
	OutputSchema OutputSchema
	Handler      ToolHandler
}

// Error is the JSON-RPC-aligned envelope every tool error returns.
type Error struct {
	Err     string         `json:"error"`
	Code    string         `json:"code"`
	Details map[string]any `json:"details,omitempty"`
}

// Error satisfies the error interface.
func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Code == "" {
		return e.Err
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Err)
}

// Server is the wrapped mark3labs server.
type Server struct {
	name    string
	version string
	logger  *slog.Logger

	mu    sync.RWMutex
	tools map[string]Tool
}

// NewServer constructs a Server with the given logical name and version.
// Logger MUST be non-nil; nil returns nil so callers fail fast at startup.
func NewServer(name, version string, logger *slog.Logger) *Server {
	if logger == nil {
		return nil
	}
	return &Server{
		name:    name,
		version: version,
		logger:  logger,
		tools:   map[string]Tool{},
	}
}

// RegisterTool installs a tool. Duplicate names return an error.
func (s *Server) RegisterTool(t Tool) error {
	if t.Name == "" {
		return errors.New("mcp.RegisterTool: tool Name is required")
	}
	if t.Handler == nil {
		return errors.New("mcp.RegisterTool: tool Handler is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.tools[t.Name]; exists {
		return fmt.Errorf("mcp.RegisterTool: tool %q already registered", t.Name)
	}
	s.tools[t.Name] = t
	return nil
}

// Run binds the server to stdio and serves until ctx is cancelled.
func (s *Server) Run(ctx context.Context) error {
	srv := mcpserver.NewMCPServer(s.name, s.version)
	s.mu.RLock()
	for _, tool := range s.tools {
		t := tool
		var libTool mcplib.Tool
		if len(t.InputSchema) > 0 {
			libTool = mcplib.NewToolWithRawSchema(t.Name, t.Description, json.RawMessage(t.InputSchema))
		} else {
			libTool = mcplib.NewTool(t.Name, mcplib.WithDescription(t.Description))
		}
		srv.AddTool(libTool, s.makeLibHandler(t))
	}
	s.mu.RUnlock()

	// ServeStdio is blocking; run it in a goroutine so we can honour ctx.
	errCh := make(chan error, 1)
	go func() { errCh <- mcpserver.ServeStdio(srv) }()

	select {
	case <-ctx.Done():
		return nil
	case err := <-errCh:
		return err
	}
}

// makeLibHandler bridges our ToolHandler to mcp-go's signature, applying
// the same panic recovery and output validation as invokeTool.
func (s *Server) makeLibHandler(t Tool) mcpserver.ToolHandlerFunc {
	return func(ctx context.Context, req mcplib.CallToolRequest) (*mcplib.CallToolResult, error) {
		raw, _ := json.Marshal(req.GetArguments())
		out, envelopeErr := s.runTool(ctx, t, raw)
		if envelopeErr != nil {
			body, _ := json.Marshal(envelopeErr)
			return mcplib.NewToolResultError(string(body)), nil
		}
		return mcplib.NewToolResultText(string(out)), nil
	}
}

// invokeTool is the test seam.
func (s *Server) invokeTool(ctx context.Context, name string, input json.RawMessage) (json.RawMessage, *Error) {
	s.mu.RLock()
	t, ok := s.tools[name]
	s.mu.RUnlock()
	if !ok {
		return nil, &Error{
			Err:     "tool not found",
			Code:    "NOT_FOUND",
			Details: map[string]any{"tool": name},
		}
	}
	return s.runTool(ctx, t, input)
}

// runTool runs handler with panic recovery, output validation, error mapping.
func (s *Server) runTool(ctx context.Context, t Tool, input json.RawMessage) (json.RawMessage, *Error) {
	var (
		result any
		hErr   error
		panicV any
	)

	func() {
		defer func() {
			if r := recover(); r != nil {
				panicV = r
			}
		}()
		result, hErr = t.Handler(ctx, input)
	}()

	if panicV != nil {
		s.logger.Error("mcp: tool panicked",
			"tool", t.Name,
			"panic", fmt.Sprintf("%v", panicV),
		)
		return nil, &Error{
			Err:  "internal error",
			Code: "INTERNAL",
			Details: map[string]any{
				"tool": t.Name,
				"type": fmt.Sprintf("%T", panicV),
			},
		}
	}

	if hErr != nil {
		// Don't leak handler internals in details; just the error string.
		return nil, &Error{
			Err:  hErr.Error(),
			Code: "HANDLER_ERROR",
			Details: map[string]any{
				"tool": t.Name,
			},
		}
	}

	out, err := json.Marshal(result)
	if err != nil {
		s.logger.Error("mcp: tool result not JSON-serialisable",
			"tool", t.Name, "err", err)
		return nil, &Error{
			Err:  "tool result is not JSON-serialisable",
			Code: "ENCODE_ERROR",
		}
	}

	if vErr := ValidateOutput(t.OutputSchema, out); vErr != nil {
		s.logger.Error("mcp: tool output schema violation",
			"tool", t.Name, "err", vErr)
		return nil, &Error{
			Err:  "tool output failed schema validation",
			Code: "OUTPUT_SCHEMA",
			Details: map[string]any{
				"tool":   t.Name,
				"reason": vErr.Error(),
			},
		}
	}
	return out, nil
}

// validateOutput is the LEGACY minimal validator. The production hot
// path now uses ValidateOutput (see output_validate.go) which uses
// santhosh-tekuri/jsonschema for full draft-7/2020-12 conformance per
// RES-1. This function is retained only because Task 1.11 wrote tests
// against it (extra_test.go); those tests still execute it directly.
// Do not call from production code paths.
func validateOutput(schema, instance json.RawMessage) error {
	if len(schema) == 0 {
		return nil
	}
	var s struct {
		Type       string                     `json:"type"`
		Required   []string                   `json:"required"`
		Properties map[string]json.RawMessage `json:"properties"`
	}
	if err := json.Unmarshal(schema, &s); err != nil {
		// If schema is unparseable, fail closed.
		return fmt.Errorf("schema unparseable: %w", err)
	}
	if s.Type != "" && s.Type != "object" {
		// We only validate object-typed outputs in this minimal impl.
		return nil
	}
	var inst map[string]any
	if err := json.Unmarshal(instance, &inst); err != nil {
		return fmt.Errorf("instance not an object: %w", err)
	}
	for _, key := range s.Required {
		if _, ok := inst[key]; !ok {
			return fmt.Errorf("missing required field %q", key)
		}
	}
	for name, propSchemaRaw := range s.Properties {
		val, present := inst[name]
		if !present {
			continue
		}
		var propSchema struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(propSchemaRaw, &propSchema); err != nil {
			continue
		}
		if propSchema.Type == "" {
			continue
		}
		if !typeMatches(propSchema.Type, val) {
			return fmt.Errorf("field %q: expected %s, got %T", name, propSchema.Type, val)
		}
	}
	return nil
}

func typeMatches(want string, v any) bool {
	switch want {
	case "string":
		_, ok := v.(string)
		return ok
	case "boolean":
		_, ok := v.(bool)
		return ok
	case "number":
		_, ok := v.(float64)
		return ok
	case "integer":
		f, ok := v.(float64)
		if !ok {
			return false
		}
		return f == float64(int64(f))
	case "array":
		_, ok := v.([]any)
		return ok
	case "object":
		_, ok := v.(map[string]any)
		return ok
	case "null":
		return v == nil
	}
	return true
}
