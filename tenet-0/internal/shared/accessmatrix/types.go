// Package accessmatrix is the runtime enforcer of the per-Director
// memory access matrix (spec FR-13, FR-16; constitution-rules.yaml v2
// memory_access_matrix). It is consumed by tenet0-director-memory-mcp
// (read+write enforcement) and read-only by tenet0-constitution-mcp
// (matrix introspection).
//
// The matrix is loaded once at MCP startup from
// constitution.MatrixEntry rows. After Load returns, the *Matrix is
// effectively immutable — there is intentionally no mutator API
// (Set/Update/Reload) to remove the runtime privilege-escalation seam.
// To change the matrix, restart the MCP after editing the YAML.
//
// Default policy: a Check that does not find an explicit grant is
// DENIED (fail closed). Self-namespace reads/writes are explicit
// (every Director must list itself in its own row).
//
// Reserved namespaces (`president`, `secops`) MUST exist in any loaded
// matrix; Load fails closed if they are missing.
//
// This file is a RED-phase stub (Task 1.12); Task 1.13 fills bodies.
package accessmatrix

import (
	"errors"

	"github.com/overnightdesk/tenet-0/internal/shared/constitution"
)

// Op enumerates the operations the matrix gates. Read/Search both gate
// on the read grant; Write/Update/Forget all gate on the write grant.
// Forget is the future supersede-to-tombstone op; included now so the
// matrix shape is stable.
type Op string

const (
	OpRead   Op = "read"
	OpSearch Op = "search"
	OpWrite  Op = "write"
	OpUpdate Op = "update"
	OpForget Op = "forget"
)

// ReservedNamespaces are the namespaces every loaded matrix must declare.
// Changing this list is a constitution-version change, not a code change.
var ReservedNamespaces = []string{"president", "secops"}

// Errors. Wrap with errors.Is in callers / tests.
var (
	ErrEmpty             = errors.New("accessmatrix: no entries provided (fail-closed)")
	ErrUnknownNamespace  = errors.New("accessmatrix: entry references namespace not in declared set")
	ErrReservedMissing   = errors.New("accessmatrix: reserved namespace missing from matrix")
	ErrSelfWriteMissing  = errors.New("accessmatrix: namespace must include self in its write list")
)

// Decision is the result of a Check call. Reason is filled on deny so
// callers can include it in audit-log entries; it intentionally omits
// the full row so the matrix shape does not leak via deny messages.
type Decision struct {
	Allowed bool
	Reason  string
}

// Matrix is the immutable runtime view of the memory_access_matrix.
type Matrix struct {
	data *matrixData
}

// Implementations live in accessmatrix.go (Task 1.13).
var _ = constitution.MatrixEntry{}
