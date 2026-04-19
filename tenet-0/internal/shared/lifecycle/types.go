// Package lifecycle parses Director markdown contracts and watches the
// agents directory for changes (spec FR-22 through FR-24, plan
// §Reference Director, contracts/director-markdown-contract.yaml).
//
// The package is split into two halves:
//
//   - Validator (no I/O): Parse + Validate work on bytes. Used by both
//     the daemon and a CI contract test.
//   - Watcher (I/O): NewWatcher + Watch + Close stream Events on file
//     creation / removal / mutation in ~/.claude-agent-zero/agents/.
//
// The contract requires five H2 body sections in this exact order:
//
//	1. Identity
//	2. Charter
//	3. MCP Grants
//	4. Memory Protocol
//	5. Constitutional Acknowledgment
//
// Cross-field rule: bus_namespace MUST equal department.
//
// Reserved namespaces (`president`, `secops`) require a non-empty
// operator_signature field.
//
// This file is a RED-phase stub (Task 1.12); Task 1.13 fills bodies.
package lifecycle

import (
	"context"
	"errors"
	"log/slog"
	"time"
)

// KnownMCPs is the closed set of MCP server identifiers a Director may
// reference in its frontmatter mcp_grants. Drift here is a deliberate
// schema bump.
var KnownMCPs = []string{
	"tenet0-bus-mcp",
	"tenet0-constitution-mcp",
	"tenet0-governor-mcp",
	"tenet0-pending-mcp",
	"tenet0-audit-mcp",
	"tenet0-director-memory-mcp",
}

// ReservedNamespaces require a non-empty operator_signature.
var ReservedNamespaces = []string{"president", "secops"}

// Required body section headings, in required order.
var RequiredSections = []string{
	"Identity",
	"Charter",
	"MCP Grants",
	"Memory Protocol",
	"Constitutional Acknowledgment",
}

// Errors. Wrap with errors.Is in callers.
var (
	ErrNoFrontmatter      = errors.New("lifecycle: file has no YAML frontmatter")
	ErrFrontmatterInvalid = errors.New("lifecycle: frontmatter YAML invalid")
	ErrMissingField       = errors.New("lifecycle: required frontmatter field missing")
	ErrMissingSection     = errors.New("lifecycle: required body section missing")
	ErrSectionOrder       = errors.New("lifecycle: body sections out of required order")
	ErrNamespaceMismatch  = errors.New("lifecycle: bus_namespace must equal department")
	ErrUnknownMCP         = errors.New("lifecycle: mcp_grants contains unknown MCP server")
	ErrReservedNoSig      = errors.New("lifecycle: reserved namespace requires operator_signature")
)

// Identity holds the human-facing Director identity from frontmatter.
type Identity struct {
	Name       string
	Department string
}

// Director is the parsed + validated form of a Director markdown file.
type Director struct {
	Identity            Identity
	Charter             string
	MCPGrants           []string
	BusNamespace        string
	ConstitutionVersion string // from "I acknowledge constitution version <X>" body line
	OperatorSignature   string // hex/base64 string; required for reserved namespaces
	FilePath            string // absolute path the bytes came from
	FileHash            string // hex SHA256 of raw bytes
}

// EventOp enumerates the watcher event kinds.
type EventOp int

const (
	EventRegistered EventOp = iota + 1
	EventDeregistered
	EventInvalid
)

// Event is one watcher-emitted occurrence.
type Event struct {
	Op       EventOp
	Path     string
	Director *Director // populated on EventRegistered; nil on the others
	Err      error     // populated on EventInvalid
}

// DefaultDebounce is the production debounce window per spec.
const DefaultDebounce = 5 * time.Second

// Watcher coalesces fsnotify events on the agents directory and emits
// validated Director lifecycle events.
type Watcher struct {
	impl *watcherImpl
}

// Implementations of Parse, Validate, NewWatcher, Watch, Close live in
// lifecycle.go (Task 1.13).
var (
	_ context.Context
	_ slog.Logger
	_ time.Duration
)
