package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/custody"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/worker"
)

func TestExecuteRejectsMissingUnknownAndTrailingArguments(t *testing.T) {
	for _, args := range [][]string{{}, {"unknown"}, {"health", "trailing"}, {"run-once", "--unknown"}} {
		if err := execute(args, &bytes.Buffer{}, &bytes.Buffer{}); err == nil {
			t.Fatalf("expected rejection for %v", args)
		}
	}
}

func TestHealthCommandPrintsExactlyOneSafeLine(t *testing.T) {
	path := filepath.Join(t.TempDir(), "health.json")
	now := time.Now().UTC()
	if err := worker.WriteHealth(path, worker.Health{State: "healthy", Timestamp: now.Format(time.RFC3339Nano), TokenHealth: "healthy", Streams: []worker.StreamHealth{}}); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := execute([]string{"health", "--health", path, "--max-age", "10m"}, &output, &bytes.Buffer{}); err != nil {
		t.Fatal(err)
	}
	if output.String() != "titus_meeting_processor=healthy\n" {
		t.Fatalf("output = %q", output.String())
	}
}

func TestContentStatusPrintsOnlyAggregateCounts(t *testing.T) {
	path := filepath.Join(t.TempDir(), "health.json")
	now := time.Now().UTC()
	if err := worker.WriteHealth(path, worker.Health{State: "healthy", Timestamp: now.Format(time.RFC3339Nano), TokenHealth: "healthy", Content: worker.ContentHealth{Enabled: true, Pending: 1, Processed: 2}}); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := execute([]string{"content-status", "--health", path}, &output, &bytes.Buffer{}); err != nil {
		t.Fatal(err)
	}
	if output.String() != "titus_meeting_content_enabled=true pending=1 processed=2 blocked=0 retryable_error=0\n" {
		t.Fatalf("output=%q", output.String())
	}
}

func TestInitVolumeCreatesPrivateOwnedDirectory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data")
	uid := strconv.Itoa(os.Getuid())
	gid := strconv.Itoa(os.Getgid())
	if err := execute([]string{"init-volume", "--path", path, "--uid", uid, "--gid", gid}, &bytes.Buffer{}, &bytes.Buffer{}); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o700 {
		t.Fatalf("volume mode = %o", info.Mode().Perm())
	}
}

func TestResetBriefRecordCommandReopensOnlyGuardedRecord(t *testing.T) {
	path := filepath.Join(t.TempDir(), "meeting-brief-state.json")
	key := strings.Repeat("a", 64)
	store, err := state.OpenBrief(path)
	if err != nil {
		t.Fatal(err)
	}
	doc := store.Document()
	doc.Records[key] = state.BriefRecord{
		InternalReference: key, MigrationStatus: "not_applicable", MeetingReference: "MB-ABCDEFGHIJKL", SourceDigest: strings.Repeat("b", 64),
		ReviewStatus: "blocked", RetryCount: 1, LastErrorCode: "titus_output_rejected", CreatedAt: "2026-08-01T12:00:00Z", UpdatedAt: "2026-08-01T12:00:00Z",
		Custody: &custody.Record{Version: 1, ObjectName: strings.Repeat("c", 32) + ".bin", Algorithm: "AES-256-GCM", KeyID: "key-1", PlaintextSHA256: strings.Repeat("d", 64), CiphertextSHA256: strings.Repeat("e", 64), PlaintextBytes: 42, CreatedAt: "2026-08-01T12:00:00Z", ExpiresAt: "2026-08-08T12:00:00Z", Status: "retained"},
	}
	if err := store.Commit(doc); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	if err := execute([]string{"reset-brief-record", "--brief-state", path, "--ref", key}, &bytes.Buffer{}, &bytes.Buffer{}); err != nil {
		t.Fatal(err)
	}
	store, err = state.OpenBrief(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	record := store.Document().Records[key]
	if record.ReviewStatus != "" || record.LastErrorCode != "" || record.RetryCount != 0 || record.Analysis != nil || record.Custody == nil {
		t.Fatalf("reset command result: %#v", record)
	}
}

func TestSafeCLIErrorNeverEchoesInput(t *testing.T) {
	secret := "sensitive-runtime-value"
	if got := safeCLIError(&unsafeTestError{value: secret}); got != "internal_error" || strings.Contains(got, secret) {
		t.Fatalf("unsafe CLI error: %q", got)
	}
}

type unsafeTestError struct{ value string }

func (err *unsafeTestError) Error() string { return err.value }
