// Package constitution implements the tenet0-constitution-mcp tool handlers —
// a thin MCP adapter over the Feature 49 Postgres-backed constitution
// (shared/bus-go/constitution.go) and the shared YAML loader
// (internal/shared/constitution). Each method corresponds to one tool in
// .specify/specs/50-tenet0-director-runtime/contracts/mcp-tool-contracts.yaml
// (servers.tenet0-constitution-mcp).
//
// This file contains the Phase 2 RED stubs. Every handler body panics with
// "not implemented (Task 2.4)". Task 2.4 replaces the bodies with working
// code and the unit tests in constitution_test.go turn green.
package constitution

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	sharedconst "github.com/overnightdesk/tenet-0/internal/shared/constitution"
	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
	busgo "github.com/overnightdesk/tenet-0/shared/bus-go"
)

// ---------------------------------------------------------------------------
// Typed error sentinels — one per contract errorCode. Handlers return these;
// toolErrorCode maps them to the wire code string. Wrap underlying errors
// with %w so errors.Is sees the sentinel.
// ---------------------------------------------------------------------------

var (
	// ErrConstitutionLoadFailed: could not load constitution.md, the YAML
	// rules file, or the Postgres-backed active version.
	ErrConstitutionLoadFailed = errors.New("constitution-mcp: load failed")

	// ErrConstitutionRuleInvalid: a rule in the loaded YAML is malformed,
	// or evaluation was requested before any rules were loaded.
	ErrConstitutionRuleInvalid = errors.New("constitution-mcp: rule invalid")

	// ErrBusDown: transport failure talking to the bus (used by
	// list_blanket_authorizations, which issues a QueryEvents against the
	// bus to find active president.authorization.granted events).
	ErrBusDown = errors.New("constitution-mcp: bus down")
)

// toolErrorCode maps a handler-returned sentinel to the wire `code` string
// declared in the contract's errorCodes list.
func toolErrorCode(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, ErrConstitutionLoadFailed):
		return "CONSTITUTION_LOAD_FAILED"
	case errors.Is(err, ErrConstitutionRuleInvalid):
		return "CONSTITUTION_RULE_INVALID"
	case errors.Is(err, ErrBusDown):
		return "BUS_DOWN"
	default:
		return "INTERNAL"
	}
}

// ---------------------------------------------------------------------------
// Test seams. The handler depends on three narrow interfaces so unit tests
// can run without Postgres / filesystem / network.
//
//   busgoClient wraps the subset of shared/bus-go *Constitution used here.
//   fileLoader  wraps internal/shared/constitution.LoadFromFile and also
//               returns the raw YAML bytes so the handler can compute a
//               deterministic SHA256 rules_hash without re-reading the file.
//   busReader   wraps the QueryEvents call used by list_blanket_authorizations.
//   proseSource reads constitution.md (path baked into the handler at New).
// ---------------------------------------------------------------------------

// busgoClient is satisfied in production by a thin wrapper around
// *busgo.Constitution. Tests use fakeBusgo.
type busgoClient interface {
	Load(ctx context.Context) (*busgo.LoadedConstitution, error)
	CurrentVersion(ctx context.Context) (int64, error)
}

// fileLoader returns the parsed YAML plus the raw bytes. Raw bytes feed the
// SHA256 rules_hash so it is deterministic and stable across reloads of the
// same file. Tests use fakeFile.
type fileLoader interface {
	Load() (*sharedconst.File, []byte, error)
}

// AuthorizationEvent is the minimal shape the handler needs from a
// president.authorization.granted event to build the list_blanket_authorizations
// response. The busReader collapses raw bus-go events to this so the
// handler stays agnostic to the event envelope.
type AuthorizationEvent struct {
	EventID     string          `json:"event_id"`
	Category    string          `json:"category"`
	GrantedAt   time.Time       `json:"granted_at"`
	ExpiresAt   *time.Time      `json:"expires_at,omitempty"`
	Revoked     bool            `json:"revoked,omitempty"`
	Constraints json.RawMessage `json:"constraints,omitempty"`
}

// busReader abstracts "give me the blanket-authorization events the bus
// knows about." Tests use fakeReader.
type busReader interface {
	ListAuthorizations(ctx context.Context, category string) ([]AuthorizationEvent, error)
}

// proseFunc returns the current constitution.md prose. Test seam.
type proseFunc func() (string, error)

// ---------------------------------------------------------------------------
// Handler — one per constitution-mcp process.
// ---------------------------------------------------------------------------

// Handler owns the three underlying clients, the prose source, and a logger.
type Handler struct {
	bus    busgoClient
	file   fileLoader
	reader busReader
	prose  proseFunc
	logger *slog.Logger
}

// Config is the constructor input.
type Config struct {
	// PostgresURL is the libpq DSN used to reach constitution_versions
	// (Feature 49). Must be a read-capable DSN; the handler never writes.
	PostgresURL string

	// ConstitutionMDPath is the path to constitution.md. Typically
	// tenet-0/shared/constitution.md inside the tenet-0 image.
	ConstitutionMDPath string

	// ConstitutionYAMLPath is the path to constitution-rules.yaml.
	ConstitutionYAMLPath string

	// Department is the bus-go credential department slug. This MCP is
	// read-only; "president" is the conventional choice.
	Department string

	// Credential is the bearer token handed to bus-go for reading events.
	Credential string

	// Logger is required; nil returns an error from New.
	Logger *slog.Logger
}

// New implementation lives in constitution.go (Task 2.4).

// Close releases the underlying pool + bus client. Implementation lives in
// constitution.go (Task 2.4).

// ---------------------------------------------------------------------------
// Tool request / response structs — JSON shapes mirror the contract exactly.
// ---------------------------------------------------------------------------

// --- load_constitution -----------------------------------------------------

// LoadConstitutionRequest mirrors the empty inputSchema for
// tenet0-constitution-mcp.load_constitution.
type LoadConstitutionRequest struct{}

// LoadConstitutionResponse mirrors outputSchema.
type LoadConstitutionResponse struct {
	Version       string `json:"version"`
	ProseMarkdown string `json:"prose_markdown"`
	RulesHash     string `json:"rules_hash"` // hex-lowercase SHA256, 64 chars
}

// LoadConstitution implementation lives in constitution.go (Task 2.4).

// --- evaluate_event --------------------------------------------------------

// EvaluateEventRequest mirrors inputSchema for
// tenet0-constitution-mcp.evaluate_event.
type EvaluateEventRequest struct {
	EventType      string            `json:"event_type"`
	Payload        json.RawMessage   `json:"payload"`
	CausalityChain []json.RawMessage `json:"causality_chain,omitempty"`
}

// EvaluateEventResponse mirrors outputSchema. violated_rule_id + reason are
// pointers so they serialize as JSON null when the event is allowed.
type EvaluateEventResponse struct {
	Allowed        bool    `json:"allowed"`
	ViolatedRuleID *string `json:"violated_rule_id"`
	Reason         *string `json:"reason"`
}

// EvaluateEvent implementation lives in constitution.go (Task 2.4).

// maxReasonChars mirrors the outputSchema maxLength:2000 on the reason field.
// Task 2.4 truncates in-handler so oversized reasons don't violate the schema.
const maxReasonChars = 2000

// --- requires_approval -----------------------------------------------------

// RequiresApprovalRequest mirrors inputSchema.
type RequiresApprovalRequest struct {
	EventType string `json:"event_type"`
}

// ApprovalMode is the enum { none | per_action | blanket_eligible } from the
// contract outputSchema. Note: the YAML uses "blanket_category" as the
// requires_approval field; the MCP surface reports it as "blanket_eligible"
// per contract wording.
type ApprovalMode string

const (
	ApprovalModeNone            ApprovalMode = "none"
	ApprovalModePerAction       ApprovalMode = "per_action"
	ApprovalModeBlanketEligible ApprovalMode = "blanket_eligible"
)

// RequiresApprovalResponse mirrors outputSchema.
type RequiresApprovalResponse struct {
	ApprovalMode    ApprovalMode `json:"approval_mode"`
	BlanketCategory *string      `json:"blanket_category"`
}

// RequiresApproval implementation lives in constitution.go (Task 2.4).

// --- list_blanket_authorizations ------------------------------------------

// ListBlanketAuthorizationsRequest mirrors inputSchema.
type ListBlanketAuthorizationsRequest struct {
	Category string `json:"category,omitempty"`
}

// BlanketAuthorization is one entry in the response. Shape from contract
// outputSchema.authorizations.items.
type BlanketAuthorization struct {
	Category       string          `json:"category"`
	GrantedEventID string          `json:"granted_event_id"`
	ExpiresAt      *time.Time      `json:"expires_at"`
	Constraints    json.RawMessage `json:"constraints,omitempty"`
}

// ListBlanketAuthorizationsResponse mirrors outputSchema.
type ListBlanketAuthorizationsResponse struct {
	Authorizations []BlanketAuthorization `json:"authorizations"`
}

// ListBlanketAuthorizations implementation lives in constitution.go (Task 2.4).

// --- get_memory_access_matrix ---------------------------------------------

// GetMemoryAccessMatrixRequest mirrors the empty inputSchema.
type GetMemoryAccessMatrixRequest struct{}

// MatrixEntry mirrors the per-namespace read/write grant structure from
// the contract outputSchema.matrix.additionalProperties.
type MatrixEntry struct {
	Read  []string `json:"read"`
	Write []string `json:"write"`
}

// GetMemoryAccessMatrixResponse mirrors outputSchema.
type GetMemoryAccessMatrixResponse struct {
	MatrixVersion string                 `json:"matrix_version"`
	Matrix        map[string]MatrixEntry `json:"matrix"`
}

// GetMemoryAccessMatrix implementation lives in constitution.go (Task 2.4).

// ---------------------------------------------------------------------------
// MCP wiring — RegisterTools registers the five tools on a *mcp.Server.
// ---------------------------------------------------------------------------

// ToolNames is the canonical, ordered list of tools this handler exposes.
var ToolNames = []string{
	"load_constitution",
	"evaluate_event",
	"requires_approval",
	"list_blanket_authorizations",
	"get_memory_access_matrix",
}

// schemas — JSON Schema fragments lifted verbatim from the contract.
var (
	loadConstitutionInputSchema = json.RawMessage(`{
		"type": "object",
		"additionalProperties": false,
		"properties": {}
	}`)
	loadConstitutionOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["version", "prose_markdown", "rules_hash"],
		"additionalProperties": false,
		"properties": {
			"version":        {"type": "string"},
			"prose_markdown": {"type": "string"},
			"rules_hash":     {"type": "string", "pattern": "^[a-f0-9]{64}$"}
		}
	}`)

	evaluateEventInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["event_type", "payload"],
		"additionalProperties": false,
		"properties": {
			"event_type":      {"type": "string"},
			"payload":         {"type": "object", "additionalProperties": true},
			"causality_chain": {"type": "array", "items": {"type": "object", "additionalProperties": true}}
		}
	}`)
	evaluateEventOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["allowed"],
		"additionalProperties": false,
		"properties": {
			"allowed":          {"type": "boolean"},
			"violated_rule_id": {"type": ["string", "null"]},
			"reason":           {"type": ["string", "null"], "maxLength": 2000}
		}
	}`)

	requiresApprovalInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["event_type"],
		"additionalProperties": false,
		"properties": {
			"event_type": {"type": "string"}
		}
	}`)
	requiresApprovalOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["approval_mode"],
		"additionalProperties": false,
		"properties": {
			"approval_mode":    {"type": "string", "enum": ["none", "per_action", "blanket_eligible"]},
			"blanket_category": {"type": ["string", "null"]}
		}
	}`)

	listBlanketAuthorizationsInputSchema = json.RawMessage(`{
		"type": "object",
		"additionalProperties": false,
		"properties": {
			"category": {"type": "string"}
		}
	}`)
	listBlanketAuthorizationsOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["authorizations"],
		"additionalProperties": false,
		"properties": {
			"authorizations": {
				"type": "array",
				"items": {
					"type": "object",
					"required": ["category", "granted_event_id", "expires_at"],
					"additionalProperties": false,
					"properties": {
						"category":         {"type": "string"},
						"granted_event_id": {"type": "string", "format": "uuid"},
						"expires_at":       {"type": ["string", "null"], "format": "date-time"},
						"constraints":      {"type": "object", "additionalProperties": true}
					}
				}
			}
		}
	}`)

	getMemoryAccessMatrixInputSchema = json.RawMessage(`{
		"type": "object",
		"additionalProperties": false,
		"properties": {}
	}`)
	getMemoryAccessMatrixOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["matrix_version", "matrix"],
		"additionalProperties": false,
		"properties": {
			"matrix_version": {"type": "string"},
			"matrix": {
				"type": "object",
				"additionalProperties": {
					"type": "object",
					"required": ["read", "write"],
					"additionalProperties": false,
					"properties": {
						"read":  {"type": "array", "items": {"type": "string"}},
						"write": {"type": "array", "items": {"type": "string"}}
					}
				}
			}
		}
	}`)
)

// buildTools produces the tool slice registered with the MCP server.
// Extracted so unit tests can invoke each handler lambda directly without
// needing access to the server's internal registry.
func (h *Handler) buildTools() []mcp.Tool {
	return []mcp.Tool{
		{
			Name:         "load_constitution",
			Description:  "Return the current constitution.md prose + version",
			InputSchema:  loadConstitutionInputSchema,
			OutputSchema: loadConstitutionOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req LoadConstitutionRequest
				if len(in) > 0 && string(in) != "null" {
					_ = json.Unmarshal(in, &req) // empty object; errors are non-fatal
				}
				return h.LoadConstitution(ctx, req)
			},
		},
		{
			Name:         "evaluate_event",
			Description:  "Evaluate a candidate event against the current constitution rules",
			InputSchema:  evaluateEventInputSchema,
			OutputSchema: evaluateEventOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req EvaluateEventRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, err
				}
				return h.EvaluateEvent(ctx, req)
			},
		},
		{
			Name:         "requires_approval",
			Description:  "Return the approval mode required for a given event type",
			InputSchema:  requiresApprovalInputSchema,
			OutputSchema: requiresApprovalOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req RequiresApprovalRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, err
				}
				return h.RequiresApproval(ctx, req)
			},
		},
		{
			Name:         "list_blanket_authorizations",
			Description:  "List currently-active blanket authorizations",
			InputSchema:  listBlanketAuthorizationsInputSchema,
			OutputSchema: listBlanketAuthorizationsOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req ListBlanketAuthorizationsRequest
				if len(in) > 0 && string(in) != "null" {
					if err := json.Unmarshal(in, &req); err != nil {
						return nil, err
					}
				}
				return h.ListBlanketAuthorizations(ctx, req)
			},
		},
		{
			Name:         "get_memory_access_matrix",
			Description:  "Return the per-Director memory read/write grant matrix",
			InputSchema:  getMemoryAccessMatrixInputSchema,
			OutputSchema: getMemoryAccessMatrixOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req GetMemoryAccessMatrixRequest
				if len(in) > 0 && string(in) != "null" {
					_ = json.Unmarshal(in, &req)
				}
				return h.GetMemoryAccessMatrix(ctx, req)
			},
		},
	}
}

// RegisterTools wires this Handler's five methods onto srv as MCP tools.
// Returns the first registration error.
func (h *Handler) RegisterTools(srv *mcp.Server) error {
	for _, t := range h.buildTools() {
		if err := srv.RegisterTool(t); err != nil {
			return err
		}
	}
	return nil
}
