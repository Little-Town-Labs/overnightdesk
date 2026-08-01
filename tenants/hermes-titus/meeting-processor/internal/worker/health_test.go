package worker

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/testfixture"
)

func TestWriteEventUsesAllowlistedFields(t *testing.T) {
	var output bytes.Buffer
	err := WriteEvent(&output, Event{
		Event:           "stream_complete",
		CycleID:         "cycle-1",
		OrganizerSlot:   "organizer_1",
		ArtifactType:    "transcript",
		State:           "healthy",
		PageCount:       1,
		NewCount:        1,
		CursorPresent:   true,
		HTTPStatusClass: "2xx",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(output.String(), "\n") || strings.Contains(output.String(), testfixture.OrganizerOne) || strings.Contains(output.String(), testfixture.ClientSecret) {
		t.Fatal("structured event was unsafe")
	}
	if err := WriteEvent(&output, Event{Event: "unknown", CycleID: "cycle-2"}); err == nil {
		t.Fatal("expected unknown event rejection")
	}
}

func TestWriteAndReadHealthArePrivateFreshAndRedacted(t *testing.T) {
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	path := filepath.Join(t.TempDir(), "health.json")
	record := Health{
		State:       "healthy",
		Timestamp:   now.Format(time.RFC3339Nano),
		TokenHealth: "healthy",
		Streams:     []StreamHealth{{OrganizerSlot: "organizer_1", ArtifactType: "transcript", State: "healthy", CursorPresent: true}},
	}
	if err := WriteHealth(path, record); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("health mode = %o", info.Mode().Perm())
	}
	raw, _ := os.ReadFile(path)
	for _, forbidden := range []string{testfixture.OrganizerOne, testfixture.ClientSecret, "deltaLink", "meetingId"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("health exposed forbidden value or field %q", forbidden)
		}
	}
	if status := HealthStatus(path, now.Add(9*time.Minute), 10*time.Minute); status != "healthy" {
		t.Fatalf("fresh status = %s", status)
	}
	if status := HealthStatus(path, now.Add(11*time.Minute), 10*time.Minute); status != "stale" {
		t.Fatalf("stale status = %s", status)
	}
}

func TestHealthStatusHandlesMissingInvalidAndDisabled(t *testing.T) {
	path := filepath.Join(t.TempDir(), "health.json")
	if got := HealthStatus(path, time.Now(), time.Minute); got != "missing" {
		t.Fatal(got)
	}
	if err := os.WriteFile(path, []byte("bad"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := HealthStatus(path, time.Now(), time.Minute); got != "invalid" {
		t.Fatal(got)
	}
	if err := WriteHealth(path, Health{State: "disabled", Timestamp: time.Now().UTC().Format(time.RFC3339Nano), TokenHealth: "unused", Streams: []StreamHealth{}}); err != nil {
		t.Fatal(err)
	}
	if got := HealthStatus(path, time.Now(), time.Minute); got != "disabled" {
		t.Fatal(got)
	}
}
