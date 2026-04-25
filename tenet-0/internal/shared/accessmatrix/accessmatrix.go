package accessmatrix

import (
	"fmt"
	"sort"

	"github.com/overnightdesk/tenet-0/internal/shared/constitution"
)

// internal storage for the matrix. Read-only post-Load.
type matrixData struct {
	// caller -> target -> Op -> bool
	grants     map[string]map[string]map[Op]bool
	namespaces []string // sorted
	version    string
}

var data = struct{}{} // unused — silence linters during transition

// Load builds an immutable Matrix from constitution-loaded entries.
func Load(entries map[string]constitution.MatrixEntry, version string) (*Matrix, error) {
	_ = data
	if len(entries) == 0 {
		return nil, ErrEmpty
	}

	// Reserved namespaces must exist.
	for _, r := range ReservedNamespaces {
		if _, ok := entries[r]; !ok {
			return nil, fmt.Errorf("%w: %s", ErrReservedMissing, r)
		}
	}

	// All referenced namespaces (in any read/write list) must be keys.
	allowed := map[string]struct{}{}
	for k := range entries {
		allowed[k] = struct{}{}
	}
	for caller, entry := range entries {
		for _, t := range entry.Read {
			if _, ok := allowed[t]; !ok {
				return nil, fmt.Errorf("%w: %s referenced by %s.read", ErrUnknownNamespace, t, caller)
			}
		}
		for _, t := range entry.Write {
			if _, ok := allowed[t]; !ok {
				return nil, fmt.Errorf("%w: %s referenced by %s.write", ErrUnknownNamespace, t, caller)
			}
		}
		// Self must be writable.
		selfWrite := false
		for _, t := range entry.Write {
			if t == caller {
				selfWrite = true
				break
			}
		}
		if !selfWrite {
			return nil, fmt.Errorf("%w: %s", ErrSelfWriteMissing, caller)
		}
	}

	// Build grants table.
	grants := map[string]map[string]map[Op]bool{}
	for caller, entry := range entries {
		grants[caller] = map[string]map[Op]bool{}
		for _, t := range entry.Read {
			if grants[caller][t] == nil {
				grants[caller][t] = map[Op]bool{}
			}
			grants[caller][t][OpRead] = true
			grants[caller][t][OpSearch] = true
		}
		for _, t := range entry.Write {
			if grants[caller][t] == nil {
				grants[caller][t] = map[Op]bool{}
			}
			grants[caller][t][OpWrite] = true
			grants[caller][t][OpUpdate] = true
			grants[caller][t][OpForget] = true
		}
	}

	ns := make([]string, 0, len(entries))
	for k := range entries {
		ns = append(ns, k)
	}
	sort.Strings(ns)

	return &Matrix{data: &matrixData{
		grants:     grants,
		namespaces: ns,
		version:    version,
	}}, nil
}

// Check returns Allowed=true iff caller is permitted op against target.
func (m *Matrix) Check(caller, target string, op Op) Decision {
	if m == nil || m.data == nil {
		return Decision{Allowed: false, Reason: "denied: matrix not loaded"}
	}
	if cell, ok := m.data.grants[caller][target]; ok && cell[op] {
		return Decision{Allowed: true}
	}
	return Decision{
		Allowed: false,
		Reason:  fmt.Sprintf("denied: %s cannot %s %s", caller, op, target),
	}
}

// Namespaces returns a sorted slice of all namespaces in the matrix.
func (m *Matrix) Namespaces() []string {
	if m == nil || m.data == nil {
		return nil
	}
	out := make([]string, len(m.data.namespaces))
	copy(out, m.data.namespaces)
	return out
}

// Version returns the constitution version recorded at Load time.
func (m *Matrix) Version() string {
	if m == nil || m.data == nil {
		return ""
	}
	return m.data.version
}
