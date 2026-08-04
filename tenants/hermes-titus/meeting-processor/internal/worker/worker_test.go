package worker

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
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
	calls     int
	output    string
	err       error
	onAnalyze func()
}

func (fake *fakeAnalyzer) Analyze(_ context.Context, _, safe string, protected []string) (string, error) {
	fake.calls++
	if fake.onAnalyze != nil {
		fake.onAnalyze()
	}
	if safe != "screened wrapper" || len(protected) < 6 {
		return "", errors.New("boundary mismatch")
	}
	return fake.output, fake.err
}

type contentCodeError string

func (err contentCodeError) Error() string    { return string(err) }
func (err contentCodeError) SafeCode() string { return string(err) }

type fakeMeetingMailer struct {
	calls      int
	references []string
	bodies     []string
}

func (fake *fakeMeetingMailer) Send(_ context.Context, reference, _ string, rendered string) (meetingemail.Delivery, error) {
	fake.calls++
	fake.references = append(fake.references, reference)
	fake.bodies = append(fake.bodies, rendered)
	if !regexp.MustCompile(`^MB-[A-Z2-7]{12}$`).MatchString(reference) {
		return meetingemail.Delivery{}, errors.New("invalid meeting reference")
	}
	if !strings.Contains(rendered, "Source-derived summary") && !strings.Contains(rendered, "## Summary") {
		return meetingemail.Delivery{}, errors.New("wrong render")
	}
	return meetingemail.Delivery{IdempotencyKey: strings.Repeat("a", 64), ProviderMessageIDDigest: strings.Repeat("b", 64), RecipientSet: "gary+austin", TemplateVersion: meetingemail.TemplateVersion, SentAt: fixedWorkerTime().Format(time.RFC3339Nano), ReadbackVerifiedAt: fixedWorkerTime().Format(time.RFC3339Nano)}, nil
}

type workerRoundTripFunc func(*http.Request) (*http.Response, error)

func (function workerRoundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func workerHTTPResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
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

func TestMeetingBriefAcceptsBoundedMarkdownMVP(t *testing.T) {
	markdown := "## Summary\nDiscussed internal delivery work.\n\n## Decisions\nNone.\n\n## Action Items\nNone.\n\n## Unresolved Questions\nNone."
	processor, briefs, fake, _, mailer := newMeetingProcessor(t, markdown)
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "pending_review" || record.BriefDigest == "" || record.Email == nil || record.BriefMarkdown != markdown || len(record.Brief) != 0 {
			t.Fatalf("markdown brief was not persisted: %#v", record)
		}
	}
	if fake.calls != 1 || mailer.calls != 1 || len(mailer.bodies) != 1 || mailer.bodies[0] != markdown {
		t.Fatalf("markdown MVP calls/body mismatch: analyze=%d mail=%d bodies=%q", fake.calls, mailer.calls, mailer.bodies)
	}
}

func TestMeetingBriefInitializesReferenceBeforeRealMailerValidation(t *testing.T) {
	processor, briefs, _, _, _ := newMeetingProcessor(t, meetingBriefJSON())
	var sent []byte
	httpClient := &http.Client{Transport: workerRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		switch {
		case request.URL.String() == meetingemail.SecurityOrigin+"/check-outbound":
			raw, _ := io.ReadAll(request.Body)
			var envelope struct {
				Content string `json:"content"`
			}
			_ = json.Unmarshal(raw, &envelope)
			encoded, _ := json.Marshal(envelope.Content)
			return workerHTTPResponse(http.StatusOK, `{"allowed":true,"content":`+string(encoded)+`}`), nil
		case request.Method == http.MethodPost:
			sent, _ = io.ReadAll(request.Body)
			return workerHTTPResponse(http.StatusOK, `{"message_id":"msg-1","thread_id":"thread-1"}`), nil
		case request.Method == http.MethodGet:
			return workerHTTPResponse(http.StatusOK, string(sent)), nil
		default:
			t.Fatalf("unexpected mail request: %s", request.URL.String())
			return nil, nil
		}
	})}
	mailer, err := meetingemail.NewClient(meetingemail.SecurityOrigin, strings.Repeat("s", 32), meetingemail.AgentMailOrigin, strings.Repeat("a", 32), "titus@agentmail.to", [2]string{"gary@example.com", "austin@example.com"}, httpClient)
	if err != nil {
		t.Fatal(err)
	}
	processor.Mailer = mailer

	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "pending_review" || !regexp.MustCompile(`^MB-[A-Z2-7]{12}$`).MatchString(record.MeetingReference) {
			t.Fatalf("real mailer did not receive initialized reference: %#v", record)
		}
	}
}

func TestMeetingBriefPreservesAndBackfillsReferenceOnRestart(t *testing.T) {
	processor, briefs, fake, _, mailer := newMeetingProcessor(t, meetingBriefJSON())
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	doc := briefs.Document()
	var key string
	for candidate, record := range doc.Records {
		key = candidate
		record.MeetingReference = "MB-ABCDEFGHIJKL"
		record.ReviewStatus = "email_pending"
		record.Email = nil
		doc.Records[candidate] = record
	}
	if err := briefs.Commit(doc); err != nil {
		t.Fatal(err)
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := mailer.references[len(mailer.references)-1]; got != "MB-ABCDEFGHIJKL" {
		t.Fatalf("valid reference replaced: %s", got)
	}

	doc = briefs.Document()
	record := doc.Records[key]
	record.MeetingReference = ""
	record.ReviewStatus = "email_pending"
	record.Email = nil
	doc.Records[key] = record
	if err := briefs.Commit(doc); err != nil {
		t.Fatal(err)
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := mailer.references[len(mailer.references)-1]; got != meetingReference(key) {
		t.Fatalf("missing reference not deterministically backfilled: %s", got)
	}
	if fake.calls != 1 {
		t.Fatalf("restart replayed analysis: %d", fake.calls)
	}
}

func TestMeetingBriefBackfillsRetainedCustodySourceDigest(t *testing.T) {
	processor, briefs, fake, _, mailer := newMeetingProcessor(t, meetingBriefJSON())
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	doc := briefs.Document()
	discovery := processor.Store.Document()
	var key string
	var sourceDigest string
	for candidate, record := range doc.Records {
		key = candidate
		sourceDigest = record.Custody.PlaintextSHA256
		record.SourceDigest = ""
		record.Brief = nil
		record.BriefDigest = ""
		record.Analysis = nil
		record.Email = nil
		record.ReviewStatus = "analysis_pending"
		doc.Records[candidate] = record
		artifact := discovery.Artifacts[candidate]
		artifact.ContentStatus = "pending"
		artifact.RawContentDigest = ""
		artifact.SafeContentDigest = ""
		artifact.TitusOutput = ""
		artifact.TitusOutputDigest = ""
		artifact.LastContentAttemptAt = ""
		artifact.ContentProcessedAt = ""
		artifact.ContentErrorCode = ""
		artifact.ContentRetryCount = 0
		discovery.Artifacts[candidate] = artifact
	}
	if err := briefs.Commit(doc); err != nil {
		t.Fatal(err)
	}
	if err := processor.Store.Commit(discovery); err != nil {
		t.Fatal(err)
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	record := briefs.Document().Records[key]
	if record.SourceDigest != sourceDigest || record.ReviewStatus != "pending_review" || record.BriefDigest == "" {
		t.Fatalf("retained custody digest was not backfilled: %#v", record)
	}
	if fake.calls != 2 || mailer.calls != 2 {
		t.Fatalf("unexpected replay counts analyze=%d mail=%d", fake.calls, mailer.calls)
	}
}

func TestMeetingBriefBlocksRetainedCustodySourceDigestMismatch(t *testing.T) {
	processor, briefs, fake, _, mailer := newMeetingProcessor(t, meetingBriefJSON())
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	doc := briefs.Document()
	discovery := processor.Store.Document()
	var key string
	for candidate, record := range doc.Records {
		key = candidate
		record.SourceDigest = strings.Repeat("f", 64)
		record.Brief = nil
		record.BriefDigest = ""
		record.Analysis = nil
		record.Email = nil
		record.ReviewStatus = "analysis_pending"
		doc.Records[candidate] = record
		artifact := discovery.Artifacts[candidate]
		artifact.ContentStatus = "pending"
		artifact.RawContentDigest = ""
		artifact.SafeContentDigest = ""
		artifact.TitusOutput = ""
		artifact.TitusOutputDigest = ""
		artifact.LastContentAttemptAt = ""
		artifact.ContentProcessedAt = ""
		artifact.ContentErrorCode = ""
		artifact.ContentRetryCount = 0
		discovery.Artifacts[candidate] = artifact
	}
	if err := briefs.Commit(doc); err != nil {
		t.Fatal(err)
	}
	if err := processor.Store.Commit(discovery); err != nil {
		t.Fatal(err)
	}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	record := briefs.Document().Records[key]
	if record.ReviewStatus != "blocked" || record.LastErrorCode != "state_invalid" || record.BriefDigest != "" || record.Email != nil {
		t.Fatalf("custody digest mismatch escaped fail-closed handling: %#v", record)
	}
	if fake.calls != 1 || mailer.calls != 1 {
		t.Fatalf("mismatch caused an unsafe replay analyze=%d mail=%d", fake.calls, mailer.calls)
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

func TestMeetingBriefBlocksAmbiguousTitusAttemptWithoutReplay(t *testing.T) {
	for _, code := range []string{"titus_unavailable", "titus_response_invalid"} {
		t.Run(code, func(t *testing.T) {
			processor, briefs, fake, _, mailer := newMeetingProcessor(t, "")
			fake.err = contentCodeError(code)
			fake.onAnalyze = func() {
				for _, record := range briefs.Document().Records {
					if record.Analysis == nil || record.Analysis.Status != "dispatching" {
						t.Fatalf("dispatch boundary was not durable before Analyze: %#v", record.Analysis)
					}
				}
			}
			if _, err := processor.RunOnce(context.Background()); err != nil {
				t.Fatal(err)
			}
			for _, record := range briefs.Document().Records {
				if record.ReviewStatus != "blocked" || record.Analysis == nil || record.Analysis.Status != "blocked" || record.Analysis.Attempt != 1 || record.LastErrorCode != code {
					t.Fatalf("ambiguous attempt was not terminal: %#v", record)
				}
			}
			if _, err := processor.RunOnce(context.Background()); err != nil {
				t.Fatal(err)
			}
			if fake.calls != 1 || mailer.calls != 0 {
				t.Fatalf("ambiguous attempt replayed: analyze=%d mail=%d", fake.calls, mailer.calls)
			}
		})
	}
}

func TestMeetingBriefBlocksPersistedDispatchingAttemptAfterRestart(t *testing.T) {
	processor, briefs, fake, _, mailer := newMeetingProcessor(t, meetingBriefJSON())
	processor.Scanner = &fakeScanner{err: contentCodeError("securityteam_unavailable")}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	doc := briefs.Document()
	for key, record := range doc.Records {
		record.ReviewStatus = "analysis_pending"
		record.Analysis = &state.AnalysisAttempt{
			Version: 1, Attempt: 1, Status: "dispatching", ScreenedDigest: strings.Repeat("d", 64),
			ChildSessionIDs: []string{}, StartedAt: fixedWorkerTime().Format(time.RFC3339Nano), LastObservedAt: fixedWorkerTime().Format(time.RFC3339Nano),
		}
		doc.Records[key] = record
	}
	if err := briefs.Commit(doc); err != nil {
		t.Fatal(err)
	}
	processor.Scanner = &fakeScanner{safe: "screened wrapper"}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "blocked" || record.Analysis.Status != "blocked" || record.LastErrorCode != "titus_response_invalid" {
			t.Fatalf("persisted dispatch was not failed closed: %#v", record)
		}
	}
	if fake.calls != 0 || mailer.calls != 0 {
		t.Fatalf("restart replayed model or email: analyze=%d mail=%d", fake.calls, mailer.calls)
	}
}

func TestMeetingBriefRetriesSecurityFailureProvenBeforeTitusDispatch(t *testing.T) {
	processor, briefs, fake, _, mailer := newMeetingProcessor(t, meetingBriefJSON())
	processor.Scanner = &fakeScanner{err: contentCodeError("securityteam_unavailable")}
	if _, err := processor.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, record := range briefs.Document().Records {
		if record.ReviewStatus != "analysis_pending" || record.LastErrorCode != "securityteam_unavailable" || record.RetryCount != 1 {
			t.Fatalf("pre-dispatch failure did not remain retryable: %#v", record)
		}
	}
	if fake.calls != 0 || mailer.calls != 0 {
		t.Fatalf("pre-dispatch failure escaped boundary: analyze=%d mail=%d", fake.calls, mailer.calls)
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
