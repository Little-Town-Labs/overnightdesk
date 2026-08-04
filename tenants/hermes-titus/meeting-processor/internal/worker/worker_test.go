package worker

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/analyzer"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/config"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/custody"
	meetingemail "github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/email"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/graph"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/testfixture"
)

type scriptedFetcher struct {
	calls      int
	failAt     int
	retryCount int
}

type fakeContentFetcher struct {
	calls int
	body  []byte
	err   error
}

func (fetcher *fakeContentFetcher) FetchTranscriptContent(context.Context, string, string, string) ([]byte, error) {
	fetcher.calls++
	return append([]byte(nil), fetcher.body...), fetcher.err
}

type fakeScanner struct {
	calls int
	safe  string
	err   error
}

func (scanner *fakeScanner) Scan(_ context.Context, raw []byte, _, _ string) (string, error) {
	scanner.calls++
	if !strings.Contains(string(raw), "private transcript phrase") {
		return "", errors.New("unexpected raw fixture")
	}
	return scanner.safe, scanner.err
}

type fakeAnalyzer struct {
	calls  int
	output string
	err    error
}

func (fake *fakeAnalyzer) Analyze(_ context.Context, _, safe string, protected []string) (string, error) {
	fake.calls++
	if safe != "screened wrapper" || len(protected) < 6 {
		return "", errors.New("boundary mismatch")
	}
	return fake.output, fake.err
}

type contentCodeError string

func (err contentCodeError) Error() string    { return string(err) }
func (err contentCodeError) SafeCode() string { return string(err) }

type fakeMeetingMailer struct{ calls int }

func (fake *fakeMeetingMailer) Send(_ context.Context, _, _, rendered string) (meetingemail.Delivery, error) {
	fake.calls++
	if !strings.Contains(rendered, "Source-derived summary") {
		return meetingemail.Delivery{}, errors.New("wrong render")
	}
	return meetingemail.Delivery{IdempotencyKey: strings.Repeat("a", 64), ProviderMessageIDDigest: strings.Repeat("b", 64), RecipientSet: "gary+austin", TemplateVersion: meetingemail.TemplateVersion, SentAt: fixedWorkerTime().Format(time.RFC3339Nano), ReadbackVerifiedAt: fixedWorkerTime().Format(time.RFC3339Nano)}, nil
}

type fakeRecordingVerifier struct{ calls int }

func (fake *fakeRecordingVerifier) VerifyRecordingContent(context.Context, string, string, string, int64) (graph.RecordingVerification, error) {
	fake.calls++
	return graph.RecordingVerification{SHA256: strings.Repeat("c", 64), Bytes: 1234, ContentType: "video/mp4"}, nil
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

func meetingBriefJSON() string {
	return `{"schemaVersion":"meeting-brief/v1","title":"Test meeting","occurredAt":"2026-08-01T12:00:00Z","participants":["Gary"],"summary":"Discussed internal delivery work.","facts":["The test completed."],"decisions":[],"actionItems":[{"title":"Track the internal follow-up","owner":"gary","dueDate":null,"sourceTimestamp":"00:01.000","confidence":"high"}],"externalCommitments":[],"unresolvedQuestions":[],"proposedFollowUp":"Review the internal note.","projectHint":"OvernightDesk","projectConfidence":"high"}`
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
	if doc := store.Document(); len(doc.Streams) != 0 || len(doc.Artifacts) != 0 {
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

func TestRunOnceProcessesOneTranscriptWithoutPersistingInputAndIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	statePath := filepath.Join(dir, "state.json")
	store, _ := state.Open(statePath)
	defer store.Close()
	content := &fakeContentFetcher{body: []byte("WEBVTT\nprivate transcript phrase")}
	scanner := &fakeScanner{safe: "screened wrapper"}
	fake := &fakeAnalyzer{output: "## Summary\nDone\n\n## Decisions\nNone\n\n## Action Items\nNone\n\n## Unresolved Questions\nNone"}
	cfg := workerConfig()
	cfg.ContentEnabled = true
	processor := Processor{Config: cfg, Store: store, Fetcher: &scriptedFetcher{}, Content: content, Scanner: scanner, Analyzer: fake, HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime}
	result, err := processor.RunOnce(context.Background())
	if err != nil || !result.ContentAttempted || !result.ContentProcessed {
		t.Fatalf("result=%#v err=%v", result, err)
	}
	if content.calls != 1 || scanner.calls != 1 || fake.calls != 1 {
		t.Fatalf("calls=%d/%d/%d", content.calls, scanner.calls, fake.calls)
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if content.calls != 1 || fake.calls != 1 {
		t.Fatal("completed transcript was processed twice")
	}
}

func TestRunOnceBlocksUnsafeTranscriptBeforeTitusAndKeepsMetadata(t *testing.T) {
	dir := t.TempDir()
	store, _ := state.Open(filepath.Join(dir, "state.json"))
	defer store.Close()
	cfg := workerConfig()
	cfg.ContentEnabled = true
	content := &fakeContentFetcher{body: []byte("WEBVTT\nprivate transcript phrase")}
	fake := &fakeAnalyzer{output: "should not run"}
	processor := Processor{Config: cfg, Store: store, Fetcher: &scriptedFetcher{}, Content: content, Scanner: &fakeScanner{err: contentCodeError("securityteam_blocked")}, Analyzer: fake, HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime}
	result, err := processor.RunOnce(context.Background())
	if err != nil || !result.ContentAttempted || result.ContentProcessed || fake.calls != 0 {
		t.Fatalf("result=%#v analyzer=%d err=%v", result, fake.calls, err)
	}
	if len(store.Document().Streams) != 4 || len(store.Document().Artifacts) != 2 {
		t.Fatal("metadata discovery was not committed")
	}
}

func newMeetingProcessor(t *testing.T, output string) (Processor, *state.BriefStore, *fakeAnalyzer, *fakeContentFetcher, *fakeMeetingMailer) {
	t.Helper()
	dir := t.TempDir()
	discovery, err := state.Open(filepath.Join(dir, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	briefs, err := state.OpenBrief(filepath.Join(dir, "briefs.json"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { briefs.Close(); discovery.Close() })
	key := base64.StdEncoding.EncodeToString(bytesOf(7, 32))
	ring, err := custody.ParseKeyRing(`{"active":"`+key+`"}`, "active")
	if err != nil {
		t.Fatal(err)
	}
	routes, err := analyzer.ParseRoutesJSON(`[{"canonicalProject":"OvernightDesk","aliases":["OvernightDesk"],"noteDirectory":"10-projects/overnightdesk","kanbanBoard":"overnightdesk"}]`)
	if err != nil {
		t.Fatal(err)
	}
	content := &fakeContentFetcher{body: []byte("WEBVTT\nprivate transcript phrase")}
	fake := &fakeAnalyzer{output: output}
	mailer := &fakeMeetingMailer{}
	cfg := workerConfig()
	cfg.MeetingBriefEnabled = true
	cfg.MeetingRecordingMaxBytes = graph.MaxRecordingContentBytes
	processor := Processor{Config: cfg, Store: discovery, Fetcher: &scriptedFetcher{}, Content: content, Scanner: &fakeScanner{safe: "screened wrapper"}, Analyzer: fake, Briefs: briefs, Custody: custody.Manager{Dir: filepath.Join(dir, "custody"), Ring: ring, Now: fixedWorkerTime}, Mailer: mailer, Recorder: &fakeRecordingVerifier{}, Routes: routes, HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime}
	return processor, briefs, fake, content, mailer
}

func TestMeetingBriefUsesOneBoundedTitusRequestAndIsIdempotent(t *testing.T) {
	processor, briefs, fake, content, mailer := newMeetingProcessor(t, meetingBriefJSON())
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "pending_review" || record.Email == nil || record.BriefDigest == "" || record.Analysis == nil || record.Analysis.Status != "completed" {
			t.Fatalf("incomplete record: %#v", record)
		}
		if record.Analysis.SessionID != "" || record.Analysis.RunID != "" || len(record.Analysis.ChildSessionIDs) != 0 {
			t.Fatalf("legacy session state retained: %#v", record.Analysis)
		}
	}
	if fake.calls != 1 || content.calls != 1 || mailer.calls != 1 {
		t.Fatalf("calls content=%d analyze=%d mail=%d", content.calls, fake.calls, mailer.calls)
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if fake.calls != 1 || mailer.calls != 1 {
		t.Fatal("single-pass result was replayed")
	}
}

func TestMeetingBriefRejectsLegacyModelOutputWithoutEmail(t *testing.T) {
	processor, briefs, fake, _, mailer := newMeetingProcessor(t, "## Summary\nlegacy")
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "blocked" || record.BriefDigest != "" || record.Email != nil || record.LastErrorCode != "titus_output_rejected" {
			t.Fatalf("legacy output escaped block: %#v", record)
		}
	}
	if fake.calls != 1 || mailer.calls != 0 {
		t.Fatalf("unexpected side effects analyze=%d mail=%d", fake.calls, mailer.calls)
	}
}

func TestMeetingBriefAcceptsOnlyCanonicalSchema(t *testing.T) {
	processor, briefs, fake, _, mailer := newMeetingProcessor(t, `{"schemaVersion":"meeting-brief/v1","title":"bad"}`)
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "blocked" || record.BriefDigest != "" {
			t.Fatalf("invalid schema escaped block: %#v", record)
		}
	}
	if fake.calls != 1 || mailer.calls != 0 {
		t.Fatalf("unexpected side effects analyze=%d mail=%d", fake.calls, mailer.calls)
	}
}

func bytesOf(value byte, count int) []byte {
	result := make([]byte, count)
	for index := range result {
		result[index] = value
	}
	return result
}

func fixedWorkerTime() time.Time { return time.Date(2026, 8, 1, 13, 0, 0, 0, time.UTC) }
