package accessmatrix

import "testing"

func TestNilMatrix_SafeMethods(t *testing.T) {
	var m *Matrix
	if d := m.Check("a", "b", OpRead); d.Allowed {
		t.Error("nil matrix Check should deny")
	}
	if ns := m.Namespaces(); ns != nil {
		t.Errorf("nil matrix Namespaces = %v, want nil", ns)
	}
	if v := m.Version(); v != "" {
		t.Errorf("nil matrix Version = %q, want \"\"", v)
	}
}

func TestCheck_DefaultDenyOnUnknownOp(t *testing.T) {
	m := mustLoad(t)
	if m.Check("ops", "ops", Op("invent")).Allowed {
		t.Error("unknown op should be denied")
	}
}
