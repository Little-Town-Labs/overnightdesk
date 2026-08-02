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
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/orchestrator"
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
	if strings.Contains(string(raw), "private transcript phrase") == false {
		return "", errors.New("unexpected raw fixture")
	}
	return scanner.safe, scanner.err
}

type fakeAnalyzer struct {
	calls  int
	output string
	err    error
}

func (analyzer *fakeAnalyzer) Analyze(_ context.Context, _, safe string, protected []string) (string, error) {
	analyzer.calls++
	if safe != "screened wrapper" || len(protected) < 6 {
		return "", errors.New("boundary mismatch")
	}
	return analyzer.output, analyzer.err
}

type contentCodeError string

func (err contentCodeError) Error() string    { return string(err) }
func (err contentCodeError) SafeCode() string { return string(err) }

type fakeMeetingOrchestrator struct {
	ensureCalls  int
	submitCalls  int
	inspectCalls int
	cleanupCalls int
}

type scriptedMeetingOrchestrator struct {
	ensureCalls   int
	submitCalls   int
	inspectCalls  int
	cleanupCalls  int
	ensureErr     error
	submitErr     error
	inspectErrors []error
	inspections   []orchestrator.Inspection
	cleanupErrors []error
}

func (fake *scriptedMeetingOrchestrator) EnsureSession(context.Context, orchestrator.Plan) error {
	fake.ensureCalls++
	return fake.ensureErr
}

func (fake *scriptedMeetingOrchestrator) SubmitRun(context.Context, orchestrator.Plan) (string, error) {
	fake.submitCalls++
	if fake.submitErr != nil {
		return "", fake.submitErr
	}
	return "run_0123456789abcdef0123456789abcdef", nil
}

func (fake *scriptedMeetingOrchestrator) Inspect(context.Context, string, orchestrator.InspectionBinding, []string) (orchestrator.Inspection, error) {
	fake.inspectCalls++
	if len(fake.inspectErrors) > 0 {
		err := fake.inspectErrors[0]
		fake.inspectErrors = fake.inspectErrors[1:]
		return orchestrator.Inspection{}, err
	}
	if len(fake.inspections) == 0 {
		return orchestrator.Inspection{Status: "pending"}, nil
	}
	result := fake.inspections[0]
	fake.inspections = fake.inspections[1:]
	return result, nil
}

func (fake *scriptedMeetingOrchestrator) Cleanup(context.Context, string, []string) error {
	fake.cleanupCalls++
	if len(fake.cleanupErrors) == 0 {
		return nil
	}
	err := fake.cleanupErrors[0]
	fake.cleanupErrors = fake.cleanupErrors[1:]
	return err
}

func (fake *fakeMeetingOrchestrator) EnsureSession(context.Context, orchestrator.Plan) error {
	fake.ensureCalls++
	return nil
}

func (fake *fakeMeetingOrchestrator) SubmitRun(context.Context, orchestrator.Plan) (string, error) {
	fake.submitCalls++
	return "run_0123456789abcdef0123456789abcdef", nil
}

func (fake *fakeMeetingOrchestrator) Inspect(_ context.Context, _ string, binding orchestrator.InspectionBinding, _ []string) (orchestrator.Inspection, error) {
	fake.inspectCalls++
	validated, err := analyzer.ParseAndValidate([]byte(`{"schemaVersion":"meeting-brief/v1","title":"Test meeting","occurredAt":"2026-08-01T12:00:00Z","participants":["Gary"],"summary":"Discussed internal delivery work.","facts":["The test completed."],"decisions":[],"actionItems":[{"title":"Track the internal follow-up","owner":"gary","dueDate":null,"sourceTimestamp":"00:01.000","confidence":"high"}],"externalCommitments":[],"unresolvedQuestions":[],"proposedFollowUp":"Review the internal note.","projectHint":"OvernightDesk","projectConfidence":"high"}`), nil)
	if err != nil || binding.ScreenedDigest == "" {
		return orchestrator.Inspection{}, errors.New("invalid inspection binding")
	}
	return orchestrator.Inspection{
		Status: analyzer.QAPass, DelegationCount: 1, ChildSessionIDs: []string{"child_1"}, ChildRouteVerified: true, ChildDraftDigest: validated.Digest,
		QA: analyzer.QAResult{Status: analyzer.QAPass, DraftAttempts: 1, QAReviews: 1, Validated: &validated},
	}, nil
}

func (fake *fakeMeetingOrchestrator) Cleanup(context.Context, string, []string) error {
	fake.cleanupCalls++
	return nil
}

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

func TestRunOnceProcessesOneTranscriptWithoutPersistingInputAndIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	statePath := filepath.Join(dir, "state.json")
	store, _ := state.Open(statePath)
	defer store.Close()
	content := &fakeContentFetcher{body: []byte("WEBVTT\nprivate transcript phrase")}
	scanner := &fakeScanner{safe: "screened wrapper"}
	analyzer := &fakeAnalyzer{output: "## Summary\nDone\n\n## Decisions\nNone\n\n## Action Items\nNone\n\n## Unresolved Questions\nNone"}
	cfg := workerConfig()
	cfg.ContentEnabled = true
	processor := Processor{Config: cfg, Store: store, Fetcher: &scriptedFetcher{}, Content: content, Scanner: scanner, Analyzer: analyzer, HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime}
	result, err := processor.RunOnce(context.Background())
	if err != nil || !result.ContentAttempted || !result.ContentProcessed {
		t.Fatalf("result=%#v err=%v", result, err)
	}
	if content.calls != 1 || scanner.calls != 1 || analyzer.calls != 1 {
		t.Fatalf("calls=%d/%d/%d", content.calls, scanner.calls, analyzer.calls)
	}
	doc := store.Document()
	processed := 0
	for _, artifact := range doc.Artifacts {
		if artifact.ArtifactType == "transcript" && artifact.ContentStatus == "processed" {
			processed++
			if artifact.RawContentDigest == "" || artifact.SafeContentDigest == "" || artifact.TitusOutputDigest == "" {
				t.Fatal("missing provenance digests")
			}
		}
		if artifact.ArtifactType == "recording" && artifact.ContentStatus != "not_applicable" {
			t.Fatal("recording content was activated")
		}
	}
	if processed != 1 {
		t.Fatalf("processed=%d", processed)
	}
	for _, path := range []string{statePath, processor.HandoffPath, processor.HealthPath} {
		raw, _ := os.ReadFile(path)
		if strings.Contains(string(raw), "private transcript phrase") || strings.Contains(string(raw), "screened wrapper") {
			t.Fatalf("input persisted in %s", path)
		}
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if content.calls != 1 || analyzer.calls != 1 {
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
	scanner := &fakeScanner{err: contentCodeError("securityteam_blocked")}
	analyzer := &fakeAnalyzer{output: "should not run"}
	processor := Processor{Config: cfg, Store: store, Fetcher: &scriptedFetcher{}, Content: content, Scanner: scanner, Analyzer: analyzer, HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime}
	result, err := processor.RunOnce(context.Background())
	if err != nil || !result.ContentAttempted || result.ContentProcessed || analyzer.calls != 0 {
		t.Fatalf("result=%#v analyzer=%d err=%v", result, analyzer.calls, err)
	}
	if len(store.Document().Streams) != 4 || len(store.Document().Artifacts) != 2 {
		t.Fatal("metadata discovery was not committed")
	}
	for _, artifact := range store.Document().Artifacts {
		if artifact.ArtifactType == "transcript" && artifact.ContentStatus != "blocked" {
			t.Fatalf("unsafe status: %#v", artifact)
		}
	}
}

func TestRunOnceCreatesFeature035BriefWithEncryptedCustodyEmailAndRecordingIdempotently(t *testing.T) {
	dir := t.TempDir()
	discovery, err := state.Open(filepath.Join(dir, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer discovery.Close()
	briefs, err := state.OpenBrief(filepath.Join(dir, "briefs.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer briefs.Close()
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
	meetingOrchestrator := &fakeMeetingOrchestrator{}
	mailer := &fakeMeetingMailer{}
	recorder := &fakeRecordingVerifier{}
	cfg := workerConfig()
	cfg.MeetingBriefEnabled = true
	cfg.MeetingRecordingMaxBytes = graph.MaxRecordingContentBytes
	processor := Processor{
		Config: cfg, Store: discovery, Fetcher: &scriptedFetcher{}, Content: content,
		Scanner: &fakeScanner{safe: "screened wrapper"}, Briefs: briefs,
		Custody:      custody.Manager{Dir: filepath.Join(dir, "custody"), Ring: ring, Now: fixedWorkerTime},
		Orchestrator: meetingOrchestrator, Mailer: mailer, Recorder: recorder, Routes: routes,
		HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime,
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	doc := briefs.Document()
	if len(doc.Records) != 1 {
		t.Fatalf("records=%d", len(doc.Records))
	}
	for _, record := range doc.Records {
		if record.ReviewStatus != "pending_review" || record.Email == nil || record.Custody == nil || record.Custody.Status != "retained" || record.Recording == nil || record.Recording.Status != "verified" || record.ProjectRoute == nil {
			t.Fatalf("incomplete record: %#v", record)
		}
		if record.MeetingReference == "" || record.BriefDigest == "" || record.SourceDigest == "" {
			t.Fatal("missing deterministic identifiers")
		}
	}
	for _, path := range []string{filepath.Join(dir, "state.json"), filepath.Join(dir, "briefs.json"), filepath.Join(dir, "handoff.json"), filepath.Join(dir, "health.json")} {
		raw, _ := os.ReadFile(path)
		if strings.Contains(string(raw), "private transcript phrase") || strings.Contains(string(raw), "screened wrapper") {
			t.Fatalf("plaintext leaked to %s", path)
		}
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if content.calls != 1 || meetingOrchestrator.submitCalls != 1 || meetingOrchestrator.inspectCalls != 1 || meetingOrchestrator.cleanupCalls != 1 || mailer.calls != 1 || recorder.calls != 1 {
		t.Fatalf("replayed side effects: content=%d submit=%d inspect=%d cleanup=%d mail=%d recording=%d", content.calls, meetingOrchestrator.submitCalls, meetingOrchestrator.inspectCalls, meetingOrchestrator.cleanupCalls, mailer.calls, recorder.calls)
	}
}

func featureProcessor(t *testing.T, meetingOrchestrator MeetingOrchestrator) (Processor, *state.BriefStore, *fakeMeetingMailer, *fakeContentFetcher) {
	t.Helper()
	dir := t.TempDir()
	discovery, err := state.Open(filepath.Join(dir, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	briefs, err := state.OpenBrief(filepath.Join(dir, "briefs.json"))
	if err != nil {
		discovery.Close()
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
	mailer := &fakeMeetingMailer{}
	cfg := workerConfig()
	cfg.MeetingBriefEnabled = true
	cfg.MeetingRecordingMaxBytes = graph.MaxRecordingContentBytes
	processor := Processor{
		Config: cfg, Store: discovery, Fetcher: &scriptedFetcher{}, Content: content,
		Scanner: &fakeScanner{safe: "screened wrapper"}, Briefs: briefs,
		Custody:      custody.Manager{Dir: filepath.Join(dir, "custody"), Ring: ring, Now: fixedWorkerTime},
		Orchestrator: meetingOrchestrator, Mailer: mailer, Recorder: &fakeRecordingVerifier{}, Routes: routes,
		HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime,
	}
	return processor, briefs, mailer, content
}

func passInspection(t *testing.T) orchestrator.Inspection {
	t.Helper()
	validated, err := analyzer.ParseAndValidate([]byte(`{"schemaVersion":"meeting-brief/v1","title":"Test meeting","occurredAt":"2026-08-01T12:00:00Z","participants":["Gary"],"summary":"Discussed internal delivery work.","facts":["The test completed."],"decisions":[],"actionItems":[{"title":"Track the internal follow-up","owner":"gary","dueDate":null,"sourceTimestamp":"00:01.000","confidence":"high"}],"externalCommitments":[],"unresolvedQuestions":[],"proposedFollowUp":"Review the internal note.","projectHint":"OvernightDesk","projectConfidence":"high"}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	return orchestrator.Inspection{
		Status: analyzer.QAPass, DelegationCount: 1, ChildSessionIDs: []string{"child_1"}, ChildRouteVerified: true, ChildDraftDigest: validated.Digest,
		QA: analyzer.QAResult{Status: analyzer.QAPass, DraftAttempts: 1, QAReviews: 1, Validated: &validated},
	}
}

func TestMeetingAnalysisPersistsPendingChildAndNeverEmailsBeforeQAPass(t *testing.T) {
	fake := &scriptedMeetingOrchestrator{inspections: []orchestrator.Inspection{
		{Status: "pending", DelegationCount: 1, ChildSessionIDs: []string{"child_1"}, ChildRouteVerified: true},
		passInspection(t),
	}}
	processor, briefs, mailer, _ := featureProcessor(t, fake)
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "sol_qa_pending" || record.Email != nil || record.BriefDigest != "" || record.Analysis == nil || record.Analysis.RunID == "" {
			t.Fatalf("pending analysis advanced early: %#v", record)
		}
	}
	if mailer.calls != 0 {
		t.Fatal("email sent before QA_PASS")
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if fake.ensureCalls != 1 || fake.submitCalls != 1 || fake.inspectCalls != 2 || fake.cleanupCalls != 1 || mailer.calls != 1 {
		t.Fatalf("unexpected calls: %#v mail=%d", fake, mailer.calls)
	}
}

func TestMeetingAnalysisCleanupFailureBlocksEmailUntilVerifiedRetry(t *testing.T) {
	fake := &scriptedMeetingOrchestrator{inspections: []orchestrator.Inspection{passInspection(t)}, cleanupErrors: []error{errors.New("delete unavailable"), nil}}
	processor, briefs, mailer, _ := featureProcessor(t, fake)
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "cleanup_retryable" || record.BriefDigest == "" || record.Email != nil {
			t.Fatalf("cleanup failure did not fail closed: %#v", record)
		}
	}
	if mailer.calls != 0 {
		t.Fatal("email sent before verified session deletion")
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if fake.inspectCalls != 1 || fake.cleanupCalls != 2 || mailer.calls != 1 {
		t.Fatalf("retry was not cleanup-only: %#v mail=%d", fake, mailer.calls)
	}
}

func TestMeetingAnalysisCleanupExhaustionBlocksAndDegradesHealth(t *testing.T) {
	cleanupErrors := make([]error, 8)
	for index := range cleanupErrors {
		cleanupErrors[index] = errors.New("delete unavailable")
	}
	fake := &scriptedMeetingOrchestrator{inspections: []orchestrator.Inspection{passInspection(t)}, cleanupErrors: cleanupErrors}
	processor, briefs, mailer, _ := featureProcessor(t, fake)
	for attempt := 0; attempt < 7; attempt++ {
		if _, err := processor.RunOnce(context.Background()); err != nil {
			t.Fatalf("retry %d failed early: %v", attempt+1, err)
		}
	}
	if _, err := processor.RunOnce(context.Background()); err == nil {
		t.Fatal("cleanup blocker left cycle healthy")
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "cleanup_blocked" || record.Analysis == nil || record.Analysis.CleanupRetryCount != 8 || record.Email != nil {
			t.Fatalf("cleanup exhaustion did not block: %#v", record)
		}
	}
	if mailer.calls != 0 || fake.cleanupCalls != 8 {
		t.Fatalf("blocked workflow side effects: mail=%d cleanup=%d", mailer.calls, fake.cleanupCalls)
	}
	if got := HealthStatus(processor.HealthPath, fixedWorkerTime(), 10*time.Minute); got != "degraded" {
		t.Fatalf("health=%s", got)
	}
}

func TestMeetingAnalysisQABlockedNeverEmails(t *testing.T) {
	blocked := orchestrator.Inspection{
		Status: analyzer.QABlocked, DelegationCount: 2, ChildSessionIDs: []string{"child_1", "child_2"}, ChildRouteVerified: true,
		QA: analyzer.QAResult{Status: analyzer.QABlocked, DraftAttempts: 2, QAReviews: 2, SafeReasonCode: "remediation_exhausted"},
	}
	fake := &scriptedMeetingOrchestrator{inspections: []orchestrator.Inspection{blocked}}
	processor, briefs, mailer, _ := featureProcessor(t, fake)
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "blocked" || record.BriefDigest != "" || record.Email != nil || record.Analysis == nil || record.Analysis.DeletedAt == "" || record.Analysis.OutcomeCode != "remediation_exhausted" || record.LastErrorCode != "remediation_exhausted" {
			t.Fatalf("QA_BLOCKED advanced: %#v", record)
		}
	}
	if mailer.calls != 0 || fake.cleanupCalls != 1 {
		t.Fatalf("blocked workflow side effects: mail=%d cleanup=%d", mailer.calls, fake.cleanupCalls)
	}
}

func TestMeetingAnalysisQABlockedOutcomeSurvivesCleanupRetry(t *testing.T) {
	blocked := orchestrator.Inspection{
		Status: analyzer.QABlocked, DelegationCount: 2, ChildSessionIDs: []string{"child_1", "child_2"}, ChildRouteVerified: true,
		QA: analyzer.QAResult{Status: analyzer.QABlocked, DraftAttempts: 2, QAReviews: 2, SafeReasonCode: "remediation_exhausted"},
	}
	fake := &scriptedMeetingOrchestrator{inspections: []orchestrator.Inspection{blocked}, cleanupErrors: []error{errors.New("delete unavailable"), nil}}
	processor, briefs, mailer, _ := featureProcessor(t, fake)
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "cleanup_retryable" || record.Analysis == nil || record.Analysis.OutcomeCode != "remediation_exhausted" {
			t.Fatalf("cleanup retry lost QA outcome: %#v", record)
		}
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "blocked" || record.Analysis == nil || record.Analysis.OutcomeCode != "remediation_exhausted" || record.LastErrorCode != "remediation_exhausted" {
			t.Fatalf("cleanup success lost QA outcome: %#v", record)
		}
	}
	if mailer.calls != 0 || fake.cleanupCalls != 2 {
		t.Fatalf("blocked cleanup retry side effects: mail=%d cleanup=%d", mailer.calls, fake.cleanupCalls)
	}
}

func TestMeetingAnalysisParentRouteConflictCleansUpAndBlocks(t *testing.T) {
	fake := &scriptedMeetingOrchestrator{ensureErr: contentCodeError("orchestrator_session_conflict")}
	processor, briefs, mailer, _ := featureProcessor(t, fake)
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "blocked" || record.Analysis == nil || record.Analysis.Status != "deleted" || record.Analysis.OutcomeCode != "orchestrator_session_conflict" || record.LastErrorCode != "orchestrator_session_conflict" {
			t.Fatalf("parent route conflict was not terminal: %#v", record)
		}
	}
	if fake.ensureCalls != 1 || fake.submitCalls != 0 || fake.inspectCalls != 0 || fake.cleanupCalls != 1 || mailer.calls != 0 {
		t.Fatalf("route conflict side effects: %#v mail=%d", fake, mailer.calls)
	}
}

func TestMeetingAnalysisLostRunResponseIsNeverResubmitted(t *testing.T) {
	fake := &scriptedMeetingOrchestrator{submitErr: errors.New("lost response"), inspections: []orchestrator.Inspection{{Status: "pending"}}}
	processor, briefs, mailer, content := featureProcessor(t, fake)
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.Analysis == nil || record.Analysis.Status != "dispatch_unknown" || record.Analysis.RunID != "" {
			t.Fatalf("lost dispatch was not durable unknown: %#v", record)
		}
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if fake.ensureCalls != 1 || fake.submitCalls != 1 || fake.inspectCalls != 1 || mailer.calls != 0 || content.calls != 1 {
		t.Fatalf("ambiguous run replayed: %#v mail=%d content=%d", fake, mailer.calls, content.calls)
	}
}

func TestMeetingAnalysisLostCreateResponseBecomesBoundedUnknownWithoutReplay(t *testing.T) {
	fake := &scriptedMeetingOrchestrator{ensureErr: errors.New("lost create response"), inspectErrors: []error{errors.New("session readback still unavailable")}}
	processor, briefs, mailer, content := featureProcessor(t, fake)
	now := fixedWorkerTime()
	processor.Now = func() time.Time { return now }
	processor.Custody.Now = func() time.Time { return now }
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.Analysis == nil || record.Analysis.Status != "dispatch_unknown" || record.Analysis.RunID != "" {
			t.Fatalf("lost create was not durable unknown: %#v", record)
		}
	}
	now = now.Add(analysisAttemptDeadline)
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if fake.ensureCalls != 1 || fake.submitCalls != 0 || fake.inspectCalls != 1 || fake.cleanupCalls != 1 || mailer.calls != 0 || content.calls != 1 {
		t.Fatalf("ambiguous create replayed or escaped deadline: %#v mail=%d content=%d", fake, mailer.calls, content.calls)
	}
}

func bytesOf(value byte, count int) []byte {
	result := make([]byte, count)
	for index := range result {
		result[index] = value
	}
	return result
}

func fixedWorkerTime() time.Time {
	return time.Date(2026, 8, 1, 13, 0, 0, 0, time.UTC)
}
