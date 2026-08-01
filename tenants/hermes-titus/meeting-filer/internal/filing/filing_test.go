package filing

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/model"
)

const testBriefDigest = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

func testBrief() model.Brief {
	return model.Brief{SchemaVersion: "meeting-brief/v1", Title: "Planning", OccurredAt: "2026-08-01T11:00:00Z", Summary: "Discussed work.", Facts: []string{"A fact."}, Decisions: []string{"A decision."}, ActionItems: []model.ActionItem{{Title: "Track item", Owner: "gary", SourceTimestamp: "01:02"}}, ExternalCommitments: []model.Commitment{{Title: "Respond later", SourceTimestamp: "02:03"}}, UnresolvedQuestions: []string{"A question?"}, ProposedFollowUp: "Prepare a draft."}
}

func TestCreateNoteReconcilesCrashOrphanAfterAtomicInstall(t *testing.T) {
	root := t.TempDir()
	directory := filepath.Join(root, "10-projects", "overnightdesk")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	route := &model.ProjectRoute{NoteDirectory: "10-projects/overnightdesk"}
	crash := errors.New("simulated_crash_after_link")
	_, err := createNote(root, "MB-ABCDEFGHIJKL", testBriefDigest, "2026-08-01T12:00:00Z", route, testBrief(), func(_, _ string) error {
		return crash
	})
	if !errors.Is(err, crash) {
		t.Fatalf("crash boundary error = %v", err)
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	foundFinal, foundOrphan := false, false
	for _, entry := range entries {
		foundFinal = foundFinal || entry.Name() == "2026-08-01-MB-ABCDEFGHIJKL.md"
		foundOrphan = foundOrphan || strings.HasPrefix(entry.Name(), ".meeting-note-")
	}
	if !foundFinal || !foundOrphan {
		t.Fatalf("crash fixture final=%t orphan=%t", foundFinal, foundOrphan)
	}

	result, err := CreateNote(root, "MB-ABCDEFGHIJKL", testBriefDigest, "2026-08-01T12:00:00Z", route, testBrief())
	if err != nil {
		t.Fatal(err)
	}
	entries, err = os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".meeting-note-") {
			t.Fatalf("orphan survived reconciliation: %s", entry.Name())
		}
	}
	if result.RelativePath != "10-projects/overnightdesk/2026-08-01-MB-ABCDEFGHIJKL.md" {
		t.Fatalf("relative path = %s", result.RelativePath)
	}
}

func TestCreateNoteRejectsUnsupportedReservedTempEntry(t *testing.T) {
	root := t.TempDir()
	directory := filepath.Join(root, "10-projects", "overnightdesk")
	if err := os.MkdirAll(filepath.Join(directory, ".meeting-note-hostile"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateNote(root, "MB-ABCDEFGHIJKL", testBriefDigest, "2026-08-01T12:00:00Z", &model.ProjectRoute{NoteDirectory: "10-projects/overnightdesk"}, testBrief()); err == nil {
		t.Fatal("reserved non-file temp entry accepted")
	}
}

func TestCreateNoteIsCreateOnlyIdempotentAndSourceLabeled(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "10-projects", "overnightdesk"), 0o700); err != nil {
		t.Fatal(err)
	}
	route := &model.ProjectRoute{NoteDirectory: "10-projects/overnightdesk"}
	first, err := CreateNote(root, "MB-ABCDEFGHIJKL", testBriefDigest, "2026-08-01T12:00:00Z", route, testBrief())
	if err != nil {
		t.Fatal(err)
	}
	second, err := CreateNote(root, "MB-ABCDEFGHIJKL", testBriefDigest, "2026-08-01T12:00:00Z", route, testBrief())
	if err != nil || first != second {
		t.Fatalf("first=%#v second=%#v err=%v", first, second, err)
	}
	raw, _ := os.ReadFile(filepath.Join(root, filepath.FromSlash(first.RelativePath)))
	for _, required := range []string{"Source-derived summary", "Internal action tracking", "External commitment tracked internally only", "Draft proposal - not performed", "Filing key: `" + first.Key + "`"} {
		if !strings.Contains(string(raw), required) {
			t.Fatalf("missing %q: %s", required, raw)
		}
	}
	changed := testBrief()
	changed.Summary = "Changed"
	if _, err := CreateNote(root, "MB-ABCDEFGHIJKL", testBriefDigest, "2026-08-01T12:00:00Z", route, changed); err == nil {
		t.Fatal("overwrite accepted")
	}
}

func TestCreateNoteRejectsTraversalAndSymlink(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(root, "10-projects")); err != nil {
		t.Fatal(err)
	}
	for _, route := range []*model.ProjectRoute{{NoteDirectory: "../escape"}, {NoteDirectory: "10-projects/project"}} {
		if _, err := CreateNote(root, "MB-ABCDEFGHIJKL", testBriefDigest, "2026-08-01T12:00:00Z", route, testBrief()); err == nil {
			t.Fatalf("unsafe route accepted: %#v", route)
		}
	}
}
