package worker

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/config"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/graph"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/testfixture"
)

type scriptedFetcher struct {
	calls      int
	failAt     int
	retryCount int
}

func (fetcher *scriptedFetcher) FetchDelta(_ context.Context, organizerID string, kind graph.ArtifactType, _ string) (graph.Round, error) {
	fetcher.calls++
	if fetcher.failAt > 0 && fetcher.calls == fetcher.failAt {
		return graph.Round{}, graph.ProviderError{Code: "provider_response_invalid", RetryCount: fetcher.retryCount}
	}
	function := "getAllTranscripts"
	if kind == graph.Recording {
		function = "getAllRecordings"
	}
	delta := "https://graph.microsoft.com/v1.0/users/" + organizerID + "/onlineMeetings/" + function + "(meetingOrganizerUserId='" + organizerID + "')/delta?$deltaToken=done"
	artifacts := []graph.Artifact{}
	if organizerID == testfixture.OrganizerOne {
		artifacts = append(artifacts, graph.Artifact{ID: "artifact-" + string(kind), MeetingID: "meeting-1", CreatedAt: "2026-08-01T12:00:00Z"})
	}
	return graph.Round{Artifacts: artifacts, DeltaLink: delta, PageCount: 1}, nil
}

func workerConfig() config.Config {
	return config.Config{
		TenantID: testfixture.TenantID, ClientID: testfixture.ClientID, ClientSecret: testfixture.ClientSecret,
		Organizers:          [2]config.Organizer{{Slot: "organizer_1", UserID: testfixture.OrganizerOne}, {Slot: "organizer_2", UserID: testfixture.OrganizerTwo}},
		PollIntervalSeconds: 300, InitialLookbackHours: 168,
	}
}

func TestRunOnceCompletesFourStreamsAndEmptyOrganizer(t *testing.T) {
	dir := t.TempDir()
	store, err := state.Open(filepath.Join(dir, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	fetcher := &scriptedFetcher{}
	processor := Processor{Config: workerConfig(), Store: store, Fetcher: fetcher, HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime}
	result, err := processor.RunOnce(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if fetcher.calls != 4 || result.NewCount != 2 || result.KnownCount != 0 {
		t.Fatalf("unexpected result: %#v calls=%d", result, fetcher.calls)
	}
	doc := store.Document()
	if len(doc.Streams) != 4 || len(doc.Artifacts) != 2 {
		t.Fatalf("unexpected state sizes: streams=%d artifacts=%d", len(doc.Streams), len(doc.Artifacts))
	}
	for _, stream := range doc.Streams {
		if stream.DeltaLink == "" || stream.LastSuccessAt == "" {
			t.Fatal("stream did not complete")
		}
	}
	raw, _ := os.ReadFile(processor.HandoffPath)
	for _, forbidden := range []string{testfixture.OrganizerOne, testfixture.OrganizerTwo, "artifact-transcript", "meeting-1", "graph.microsoft.com"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("handoff exposed %q", forbidden)
		}
	}
}

func TestRunOnceDeduplicatesReplayedArtifacts(t *testing.T) {
	dir := t.TempDir()
	store, _ := state.Open(filepath.Join(dir, "state.json"))
	defer store.Close()
	processor := Processor{Config: workerConfig(), Store: store, Fetcher: &scriptedFetcher{}, HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	result, err := processor.RunOnce(context.Background())
	if err != nil || result.NewCount != 0 || result.KnownCount != 2 || len(store.Document().Artifacts) != 2 {
		t.Fatalf("replay was not idempotent: %#v err=%v", result, err)
	}
}

func TestRunOnceRollsBackEntireCycleWhenAStreamIsIncomplete(t *testing.T) {
	dir := t.TempDir()
	store, _ := state.Open(filepath.Join(dir, "state.json"))
	defer store.Close()
	processor := Processor{Config: workerConfig(), Store: store, Fetcher: &scriptedFetcher{failAt: 1}, HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime}
	_, err := processor.RunOnce(context.Background())
	if err == nil || !errors.Is(err, ErrCycleFailed) {
		t.Fatalf("expected cycle failure, got %v", err)
	}
	doc := store.Document()
	if len(doc.Streams) != 0 || len(doc.Artifacts) != 0 {
		t.Fatalf("partial cycle advanced state: %#v", doc)
	}
	raw, readErr := os.ReadFile(processor.HealthPath)
	if readErr != nil {
		t.Fatal(readErr)
	}
	var health Health
	if json.Unmarshal(raw, &health) != nil || len(health.Streams) != 4 {
		t.Fatalf("degraded health did not cover four streams: %s", raw)
	}
}

func TestRunOnceReportsOnlyTheFailedStreamRetryExhaustion(t *testing.T) {
	dir := t.TempDir()
	store, _ := state.Open(filepath.Join(dir, "state.json"))
	defer store.Close()
	var events strings.Builder
	processor := Processor{
		Config: workerConfig(), Store: store, Fetcher: &scriptedFetcher{failAt: 1, retryCount: 2},
		HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"),
		Events: &events, Now: fixedWorkerTime,
	}
	if _, err := processor.RunOnce(context.Background()); err == nil {
		t.Fatal("expected exhausted retry failure")
	}
	raw, _ := os.ReadFile(processor.HealthPath)
	var health Health
	if json.Unmarshal(raw, &health) != nil || len(health.Streams) != 4 {
		t.Fatalf("invalid health: %s", raw)
	}
	failed := 0
	for _, stream := range health.Streams {
		if stream.SafeErrorCode != "" {
			failed++
			if stream.OrganizerSlot != "organizer_1" || stream.ArtifactType != "transcript" || stream.RetryCount != 2 {
				t.Fatalf("wrong failed stream detail: %#v", stream)
			}
		}
	}
	if failed != 1 || !strings.Contains(events.String(), `"event":"retry"`) || !strings.Contains(events.String(), `"retry_count":2`) {
		t.Fatalf("retry exhaustion was not safely observable: %s", events.String())
	}
}

func fixedWorkerTime() time.Time {
	return time.Date(2026, 8, 1, 13, 0, 0, 0, time.UTC)
}
