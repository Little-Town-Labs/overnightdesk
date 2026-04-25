package constitution

import (
	"strings"
	"testing"
)

const realConstitutionRulesPath = "../../../shared/constitution-rules.yaml"

// TestLoadAmendedFile is the primary acceptance check for Task 1.3 (the
// v1.1.0 amendment). Before the amendment lands, this test FAILS with a
// version-too-low error. After the amendment, it PASSES with both new
// sections populated. This is the Phase 1 TDD pair (Task 1.2 → 1.3).
func TestLoadAmendedFile(t *testing.T) {
	f, err := LoadFromFile(realConstitutionRulesPath)
	if err != nil {
		t.Fatalf("LoadFromFile failed: %v\n\nThis is expected to FAIL until the constitution amendment lands (Task 1.3).", err)
	}

	if f.Version < MinimumSupportedVersion {
		t.Errorf("constitution version = %d, want >= %d", f.Version, MinimumSupportedVersion)
	}

	// Backward compatibility: Feature 49 rules must still load.
	if len(f.Rules) == 0 {
		t.Error("constitution rules slice is empty; backward compatibility broken — bus would lose all rules")
	}

	// Memory access matrix: every namespace mentioned in the amendment
	// recommendation must be present.
	requiredNamespaces := []string{"president", "ops", "tech", "finance", "s_m", "support", "secops"}
	for _, ns := range requiredNamespaces {
		entry, ok := f.MemoryAccessMatrix[ns]
		if !ok {
			t.Errorf("memory_access_matrix missing namespace %q", ns)
			continue
		}
		// Every namespace MUST be able to write its own memories.
		if !contains(entry.Write, ns) {
			t.Errorf("memory_access_matrix.%s.write missing self (%q)", ns, ns)
		}
	}

	// President is the only namespace that reads everyone (FR-13 default).
	pres, ok := f.MemoryAccessMatrix["president"]
	if ok && len(pres.Read) < len(requiredNamespaces) {
		t.Errorf("president.read has %d namespaces, want >= %d (cross-namespace synthesis required)",
			len(pres.Read), len(requiredNamespaces))
	}

	// SecOps reads everyone too (auditor role).
	secops, ok := f.MemoryAccessMatrix["secops"]
	if ok && len(secops.Read) < len(requiredNamespaces) {
		t.Errorf("secops.read has %d namespaces, want >= %d", len(secops.Read), len(requiredNamespaces))
	}

	// Memory scrubber: the seven layers from research.md §PII Scrubber Catalog.
	requiredLayers := []string{
		"unicode_normalize",
		"encoding_decode",
		"customer_email",
		"credit_card",
		"anthropic_credential",
		"conversation_transcript",
		"high_entropy",
	}
	if f.MemoryScrubber == nil {
		t.Fatal("memory_scrubber section is nil")
	}
	got := make(map[string]bool, len(f.MemoryScrubber.Layers))
	for _, l := range f.MemoryScrubber.Layers {
		got[l.Name] = true
	}
	for _, want := range requiredLayers {
		if !got[want] {
			t.Errorf("memory_scrubber missing required layer %q", want)
		}
	}
}

// TestVersionDowngradeRejected confirms the loader fails closed on an
// older file. Same yaml without memory_access_matrix → reject with an
// actionable error.
func TestVersionDowngradeRejected(t *testing.T) {
	tmp := writeTempFile(t, `version: 1
rules:
  - id: example
    event_type_pattern: "*"
    requires_approval: none
`)
	_, err := LoadFromFile(tmp)
	if err == nil {
		t.Fatal("LoadFromFile accepted a version=1 file; should have rejected")
	}
	if !strings.Contains(err.Error(), "version 1") {
		t.Errorf("error doesn't mention the bad version: %v", err)
	}
}

// TestMissingMatrixRejected confirms the loader fails when the section is
// absent at the right version (e.g., partial amendment).
func TestMissingMatrixRejected(t *testing.T) {
	tmp := writeTempFile(t, `version: 2
rules: []
memory_scrubber:
  version: 1
  layers:
    - name: unicode_normalize
      enabled: true
`)
	_, err := LoadFromFile(tmp)
	if err == nil {
		t.Fatal("LoadFromFile accepted a file without memory_access_matrix")
	}
	if !strings.Contains(err.Error(), "memory_access_matrix") {
		t.Errorf("error doesn't mention the missing section: %v", err)
	}
}

// helpers

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

func writeTempFile(t *testing.T, body string) string {
	t.Helper()
	f, err := writeTemp(body)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = removeTemp(f) })
	return f
}
