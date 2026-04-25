package accessmatrix

import (
	"errors"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/overnightdesk/tenet-0/internal/shared/constitution"
)

// canonicalEntries mirrors constitution-rules.yaml v2 memory_access_matrix.
// Seven namespaces: president, ops, tech, finance, s_m, support, secops.
func canonicalEntries() map[string]constitution.MatrixEntry {
	return map[string]constitution.MatrixEntry{
		"president": {
			Write: []string{"president"},
			Read:  []string{"president", "ops", "tech", "finance", "s_m", "support", "secops"},
		},
		"ops":     {Write: []string{"ops"}, Read: []string{"ops"}},
		"tech":    {Write: []string{"tech"}, Read: []string{"tech"}},
		"finance": {Write: []string{"finance"}, Read: []string{"finance"}},
		"s_m":     {Write: []string{"s_m"}, Read: []string{"s_m"}},
		"support": {Write: []string{"support"}, Read: []string{"support"}},
		"secops": {
			Write: []string{"secops"},
			Read:  []string{"president", "ops", "tech", "finance", "s_m", "support", "secops"},
		},
	}
}

func mustLoad(t *testing.T) *Matrix {
	t.Helper()
	m, err := Load(canonicalEntries(), "v2")
	if err != nil {
		t.Fatalf("Load(canonical, v2): %v", err)
	}
	return m
}

func TestLoad_RejectsEmpty(t *testing.T) {
	_, err := Load(map[string]constitution.MatrixEntry{}, "v2")
	if !errors.Is(err, ErrEmpty) {
		t.Fatalf("Load(empty) returned %v, want ErrEmpty", err)
	}
}

func TestLoad_RejectsMissingReservedPresident(t *testing.T) {
	e := canonicalEntries()
	delete(e, "president")
	_, err := Load(e, "v2")
	if !errors.Is(err, ErrReservedMissing) {
		t.Fatalf("Load missing president returned %v, want ErrReservedMissing", err)
	}
}

func TestLoad_RejectsMissingReservedSecops(t *testing.T) {
	e := canonicalEntries()
	delete(e, "secops")
	_, err := Load(e, "v2")
	if !errors.Is(err, ErrReservedMissing) {
		t.Fatalf("Load missing secops returned %v, want ErrReservedMissing", err)
	}
}

func TestLoad_RejectsDanglingReference(t *testing.T) {
	e := canonicalEntries()
	pres := e["president"]
	pres.Read = append(pres.Read, "ghost_namespace")
	e["president"] = pres
	_, err := Load(e, "v2")
	if !errors.Is(err, ErrUnknownNamespace) {
		t.Fatalf("Load with dangling ns returned %v, want ErrUnknownNamespace", err)
	}
}

func TestLoad_RejectsMissingSelfWrite(t *testing.T) {
	e := canonicalEntries()
	e["ops"] = constitution.MatrixEntry{Write: []string{}, Read: []string{"ops"}}
	_, err := Load(e, "v2")
	if !errors.Is(err, ErrSelfWriteMissing) {
		t.Fatalf("Load missing self in write returned %v, want ErrSelfWriteMissing", err)
	}
}

// Exhaustive 49-cell matrix conformance for the read-grant surface.
func TestCheck_ReadMatrix(t *testing.T) {
	m := mustLoad(t)
	all := []string{"president", "ops", "tech", "finance", "s_m", "support", "secops"}

	// Build expected read map from canonical entries.
	want := map[string]map[string]bool{}
	for caller, entry := range canonicalEntries() {
		want[caller] = map[string]bool{}
		for _, target := range entry.Read {
			want[caller][target] = true
		}
	}

	for _, caller := range all {
		for _, target := range all {
			got := m.Check(caller, target, OpRead).Allowed
			expected := want[caller][target]
			if got != expected {
				t.Errorf("Check(%s -> %s, read) = %v, want %v", caller, target, got, expected)
			}
		}
	}
}

func TestCheck_WriteMatrix(t *testing.T) {
	m := mustLoad(t)
	all := []string{"president", "ops", "tech", "finance", "s_m", "support", "secops"}
	for _, caller := range all {
		for _, target := range all {
			got := m.Check(caller, target, OpWrite).Allowed
			expected := caller == target // every namespace writes only itself
			if got != expected {
				t.Errorf("Check(%s -> %s, write) = %v, want %v", caller, target, got, expected)
			}
		}
	}
}

func TestCheck_SearchUsesReadGrant(t *testing.T) {
	m := mustLoad(t)
	if !m.Check("president", "ops", OpSearch).Allowed {
		t.Error("president should be able to search ops (read grant covers search)")
	}
	if m.Check("ops", "finance", OpSearch).Allowed {
		t.Error("ops should NOT be able to search finance")
	}
}

func TestCheck_UpdateAndForgetUseWriteGrant(t *testing.T) {
	m := mustLoad(t)
	if !m.Check("ops", "ops", OpUpdate).Allowed {
		t.Error("ops should be able to update own memories")
	}
	if !m.Check("ops", "ops", OpForget).Allowed {
		t.Error("ops should be able to forget own memories")
	}
	if m.Check("president", "ops", OpUpdate).Allowed {
		t.Error("president should NOT be able to update ops memories (write-only-self)")
	}
}

func TestCheck_DefaultDenyOnUnknownCaller(t *testing.T) {
	m := mustLoad(t)
	d := m.Check("ghost", "ops", OpRead)
	if d.Allowed {
		t.Error("Check with unknown caller returned Allowed=true (default-deny violated)")
	}
	if d.Reason == "" {
		t.Error("Decision.Reason empty on deny — needed for audit log")
	}
}

func TestCheck_DefaultDenyOnUnknownTarget(t *testing.T) {
	m := mustLoad(t)
	d := m.Check("ops", "ghost", OpRead)
	if d.Allowed {
		t.Error("Check with unknown target returned Allowed=true")
	}
}

func TestDecisionReason_DoesNotLeakMatrix(t *testing.T) {
	m := mustLoad(t)
	d := m.Check("ops", "finance", OpRead)
	if d.Allowed {
		t.Fatal("setup: ops->finance should be denied")
	}
	// Reason should be a short audit string, not a dump of read/write lists.
	if strings.Contains(d.Reason, "[") || strings.Contains(d.Reason, "Write:") || strings.Contains(d.Reason, "Read:") {
		t.Errorf("Reason leaks matrix structure: %q", d.Reason)
	}
}

func TestVersion_RoundTrip(t *testing.T) {
	m, err := Load(canonicalEntries(), "v42")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if m.Version() != "v42" {
		t.Errorf("Version = %q, want v42", m.Version())
	}
}

func TestNamespaces_Sorted(t *testing.T) {
	m := mustLoad(t)
	got := m.Namespaces()
	want := append([]string(nil), got...)
	sort.Strings(want)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Namespaces not sorted: %v", got)
	}
	if len(got) != 7 {
		t.Errorf("Namespaces length = %d, want 7", len(got))
	}
}

// TestNoMutatorMethods asserts there is no Set/Update/Reload/Add method
// reachable on *Matrix. Compile-time + reflection guard against future
// drift that would re-introduce a privilege-escalation seam.
func TestNoMutatorMethods(t *testing.T) {
	tp := reflect.TypeOf(&Matrix{})
	for i := 0; i < tp.NumMethod(); i++ {
		name := tp.Method(i).Name
		for _, banned := range []string{"Set", "Add", "Reload", "Mutate", "Replace", "Insert"} {
			if strings.HasPrefix(name, banned) {
				t.Errorf("Matrix has forbidden mutator method %q (security: matrix is immutable post-Load)", name)
			}
		}
		// Update is OK as an Op constant but should NEVER be a method.
		if name == "Update" {
			t.Errorf("Matrix has forbidden Update method")
		}
	}
}

func TestCheck_ConcurrencySafe(t *testing.T) {
	m := mustLoad(t)
	var wg sync.WaitGroup
	for i := 0; i < 1000; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			callers := []string{"president", "ops", "tech", "finance", "s_m", "support", "secops"}
			c := callers[i%len(callers)]
			t := callers[(i+1)%len(callers)]
			_ = m.Check(c, t, OpRead)
		}(i)
	}
	wg.Wait()
}

// TestMatchesRealConstitution loads the live shared/constitution-rules.yaml
// via the constitution loader and spot-checks five cells to prove the
// matrix shape we encode in tests matches what production will load.
func TestMatchesRealConstitution(t *testing.T) {
	const realPath = "../../../shared/constitution-rules.yaml"
	f, err := constitution.LoadFromFile(realPath)
	if err != nil {
		t.Skipf("constitution loader unavailable in this checkout: %v", err)
	}
	if len(f.MemoryAccessMatrix) == 0 {
		t.Fatal("real constitution has empty memory_access_matrix")
	}
	m, err := Load(f.MemoryAccessMatrix, "v2-real")
	if err != nil {
		t.Fatalf("Load(real matrix): %v", err)
	}
	checks := []struct {
		caller, target string
		op             Op
		want           bool
	}{
		{"president", "finance", OpRead, true},
		{"president", "finance", OpWrite, false},
		{"finance", "finance", OpWrite, true},
		{"ops", "finance", OpRead, false},
		{"secops", "tech", OpRead, true},
	}
	for _, c := range checks {
		got := m.Check(c.caller, c.target, c.op).Allowed
		if got != c.want {
			t.Errorf("real-matrix Check(%s -> %s, %s) = %v, want %v", c.caller, c.target, c.op, got, c.want)
		}
	}
}
