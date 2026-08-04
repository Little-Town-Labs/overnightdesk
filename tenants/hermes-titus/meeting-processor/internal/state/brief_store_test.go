package state

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/custody"
)

func TestBriefStoreOpensLegacyRecordWithoutAnalysisAttempt(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "briefs.json")
	key := strings.Repeat("a", 64)
	raw := `{"version":1,"records":{"` + key + `":{"internal_reference":"` + key + `","migration_status":"not_applicable","review_status":"draft","created_at":"2026-08-01T12:00:00Z","updated_at":"2026-08-01T12:00:00Z"}}}`
	if err := os.WriteFile(path, []byte(raw), 0o600); err != nil {
		t.Fatal(err)
	}
	store, err := OpenBrief(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if record := store.Document().Records[key]; record.Analysis != nil || record.ReviewStatus != "draft" {
		t.Fatalf("legacy record changed: %#v", record)
	}
}

func TestBriefStorePersistsAndClonesSafeAnalysisAttempt(t *testing.T) {
	store, err := OpenBrief(filepath.Join(t.TempDir(), "briefs.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	key := strings.Repeat("a", 64)
	doc := store.Document()
	doc.Records[key] = BriefRecord{
		InternalReference: key, MigrationStatus: "not_applicable", MeetingReference: "MB-ABCDEFGHIJKL",
		SourceDigest: strings.Repeat("b", 64), AnalysisPromptVersion: "meeting-sol-luna/v1", ReviewStatus: "luna_running",
		Analysis: &AnalysisAttempt{
			Version: 1, Attempt: 1, SessionID: "meeting-abcdefghijkl-1", RunID: "run_0123456789abcdef0123456789abcdef",
			CreateBodyDigest: strings.Repeat("c", 64), RunBodyDigest: strings.Repeat("d", 64), ScreenedDigest: strings.Repeat("e", 64),
			ChildSessionIDs: []string{}, Status: "luna_running", StartedAt: "2026-08-01T12:00:00Z", LastObservedAt: "2026-08-01T12:00:00Z",
		},
		CreatedAt: "2026-08-01T12:00:00Z", UpdatedAt: "2026-08-01T12:00:00Z",
	}
	if err := store.Commit(doc); err != nil {
		t.Fatal(err)
	}
	first := store.Document()
	first.Records[key].Analysis.ChildSessionIDs = append(first.Records[key].Analysis.ChildSessionIDs, "child_mutation")
	if len(store.Document().Records[key].Analysis.ChildSessionIDs) != 0 {
		t.Fatal("analysis child IDs were not cloned")
	}
}

func TestBriefStoreRejectsUnsafeAnalysisCorrelation(t *testing.T) {
	store, _ := OpenBrief(filepath.Join(t.TempDir(), "briefs.json"))
	defer store.Close()
	key := strings.Repeat("a", 64)
	base := BriefRecord{
		InternalReference: key, MigrationStatus: "not_applicable", ReviewStatus: "analysis_pending",
		Analysis:  &AnalysisAttempt{Version: 1, Attempt: 1, SessionID: "meeting-abcdefghijkl-1", CreateBodyDigest: strings.Repeat("c", 64), RunBodyDigest: strings.Repeat("d", 64), ScreenedDigest: strings.Repeat("e", 64), ChildSessionIDs: []string{}, Status: "dispatch_pending", StartedAt: "2026-08-01T12:00:00Z", LastObservedAt: "2026-08-01T12:00:00Z"},
		CreatedAt: "2026-08-01T12:00:00Z", UpdatedAt: "2026-08-01T12:00:00Z",
	}
	fixtures := []func(*BriefRecord){
		func(record *BriefRecord) { record.Analysis.SessionID = "../session" },
		func(record *BriefRecord) { record.Analysis.RunBodyDigest = "not-a-digest" },
		func(record *BriefRecord) { record.Analysis.ChildSessionIDs = []string{"same", "same"} },
		func(record *BriefRecord) { record.Analysis.ChildRouteVerified = true },
		func(record *BriefRecord) { record.Analysis.CleanupRetryCount = 9 },
		func(record *BriefRecord) { record.Analysis.LastObservedAt = "2026-08-01T11:59:59Z" },
		func(record *BriefRecord) { record.Analysis.OutcomeCode = "unsafe code" },
	}
	for index, mutate := range fixtures {
		record := base
		analysis := *base.Analysis
		analysis.ChildSessionIDs = append([]string(nil), base.Analysis.ChildSessionIDs...)
		record.Analysis = &analysis
		mutate(&record)
		doc := store.Document()
		doc.Records[key] = record
		if err := store.Commit(doc); err == nil {
			t.Fatalf("fixture %d accepted", index)
		}
	}
}

func TestBriefStoreResetBlockedTitusOutputPreservesCustodyAndIdentity(t *testing.T) {
	path := filepath.Join(t.TempDir(), "briefs.json")
	store, err := OpenBrief(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	key := strings.Repeat("a", 64)
	created := "2026-08-01T12:00:00Z"
	updated := "2026-08-01T12:01:00Z"
	doc := store.Document()
	doc.Records[key] = BriefRecord{
		InternalReference: key, MigrationStatus: "not_applicable", MeetingReference: "MB-ABCDEFGHIJKL",
		SourceDigest: strings.Repeat("b", 64), ReviewStatus: "blocked", RetryCount: 1,
		LastErrorCode: "titus_output_rejected", CreatedAt: created, UpdatedAt: updated,
		Custody: &custody.Record{Version: 1, ObjectName: strings.Repeat("c", 32) + ".bin", Algorithm: "AES-256-GCM", KeyID: "key-1", PlaintextSHA256: strings.Repeat("d", 64), CiphertextSHA256: strings.Repeat("e", 64), PlaintextBytes: 42, CreatedAt: created, ExpiresAt: "2026-08-08T12:00:00Z", Status: "retained"},
	}
	if err := store.Commit(doc); err != nil {
		t.Fatal(err)
	}
	resetAt := time.Date(2026, time.August, 4, 12, 0, 0, 0, time.UTC)
	if err := store.ResetBlockedBrief(key, resetAt); err != nil {
		t.Fatal(err)
	}
	record := store.Document().Records[key]
	if record.ReviewStatus != "" || record.Analysis != nil || record.RetryCount != 0 || record.LastErrorCode != "" {
		t.Fatalf("reset fields remain: %#v", record)
	}
	if record.InternalReference != key || record.MeetingReference != "MB-ABCDEFGHIJKL" || record.SourceDigest != strings.Repeat("b", 64) || record.Custody == nil || record.UpdatedAt != resetAt.Format(time.RFC3339Nano) || record.CreatedAt != created {
		t.Fatalf("identity/custody changed: %#v", record)
	}
}

func TestBriefStoreResetBlockedBriefRejectsWrongTerminalState(t *testing.T) {
	store, err := OpenBrief(filepath.Join(t.TempDir(), "briefs.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	key := strings.Repeat("a", 64)
	doc := store.Document()
	doc.Records[key] = BriefRecord{InternalReference: key, MigrationStatus: "not_applicable", ReviewStatus: "blocked", LastErrorCode: "state_invalid", CreatedAt: "2026-08-01T12:00:00Z", UpdatedAt: "2026-08-01T12:00:00Z"}
	if err := store.Commit(doc); err != nil {
		t.Fatal(err)
	}
	if err := store.ResetBlockedBrief(key, time.Date(2026, time.August, 4, 12, 0, 0, 0, time.UTC)); err == nil {
		t.Fatal("reset accepted a non-Titus terminal error")
	}
}
