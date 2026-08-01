package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/kanban"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/model"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/policy"
)

type fakeRunner struct{ calls int }

func (fake *fakeRunner) Run(_ context.Context, _ string, _ ...string) ([]byte, error) {
	fake.calls++
	return []byte(`{"task_id":"t_1"}`), nil
}

func handlerFixture(t *testing.T) (*Handler, *fakeRunner) {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "00-inbox", "meetings"), 0o700); err != nil {
		t.Fatal(err)
	}
	runner := &fakeRunner{}
	configuration := policy.Config{Enabled: true, Bearer: strings.Repeat("b", 32), ProjectsRoot: root, HermesBinary: "/opt/hermes/.venv/bin/hermes", LedgerPath: filepath.Join(t.TempDir(), "ledger.json"), Routes: map[string]model.ProjectRoute{}, ProtectedValues: []string{"gary@example.com", "austin@example.com"}}
	handler, err := NewHandler(configuration, kanban.Adapter{Binary: "/opt/hermes/.venv/bin/hermes", AllowedBoards: map[string]struct{}{"meeting-triage": {}}, Runner: runner}, func() time.Time { return time.Date(2026, 8, 1, 13, 0, 0, 0, time.UTC) })
	if err != nil {
		t.Fatal(err)
	}
	return handler, runner
}

func requestFixture(t *testing.T) *http.Request {
	t.Helper()
	brief := model.Brief{SchemaVersion: "meeting-brief/v1", Title: "Planning", OccurredAt: "2026-08-01T11:00:00Z", Summary: "Summary", ProjectConfidence: "unknown", ActionItems: []model.ActionItem{{Title: "Track action", Owner: "gary", SourceTimestamp: "01:02", Confidence: "high"}}}
	return requestForBrief(t, brief)
}

func requestForBrief(t *testing.T, brief model.Brief) *http.Request {
	t.Helper()
	briefRaw, _ := json.Marshal(brief)
	briefDigest := sha256.Sum256(briefRaw)
	input := model.FilingInput{SchemaVersion: "meeting-filing/v1", Reference: "MB-ABCDEFGHIJKL", ApprovedBy: "gary", ApprovedAt: "2026-08-01T12:30:00Z", BriefDigest: hex.EncodeToString(briefDigest[:]), Brief: briefRaw, ProjectRoute: nil}
	raw, _ := json.Marshal(input)
	digest := sha256.Sum256(raw)
	request := httptest.NewRequest(http.MethodPost, "/v1/filings", bytes.NewReader(raw))
	request.Header.Set("Authorization", "Bearer "+strings.Repeat("b", 32))
	request.Header.Set("Idempotency-Key", hex.EncodeToString(digest[:]))
	return request
}

func TestHandlerRejectsProtectedBriefBeforeMutation(t *testing.T) {
	handler, runner := handlerFixture(t)
	brief := model.Brief{SchemaVersion: "meeting-brief/v1", Title: "Planning", OccurredAt: "2026-08-01T11:00:00Z", Summary: "Contact GARY@example.com", ProjectConfidence: "unknown"}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, requestForBrief(t, brief))
	if response.Code != http.StatusUnprocessableEntity || runner.calls != 0 {
		t.Fatalf("status=%d calls=%d body=%s", response.Code, runner.calls, response.Body.String())
	}
}

func TestHandlerCreatesUnknownNoteTriageAndActionIdempotently(t *testing.T) {
	handler, runner := handlerFixture(t)
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, requestFixture(t))
	if first.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", first.Code, first.Body.String())
	}
	second := httptest.NewRecorder()
	handler.ServeHTTP(second, requestFixture(t))
	if second.Code != http.StatusOK || runner.calls != 2 {
		t.Fatalf("replay=%d calls=%d body=%s", second.Code, runner.calls, second.Body.String())
	}
	var result model.FilingResult
	if json.Unmarshal(first.Body.Bytes(), &result) != nil || result.TriageTaskKey == nil || len(result.ActionTaskKeys) != 1 || result.Board != "meeting-triage" || len(result.NoteKey) != 64 {
		t.Fatalf("result=%#v", result)
	}
}

func TestHandlerRejectsAuthIdempotencyAndBriefDigestBeforeMutation(t *testing.T) {
	handler, runner := handlerFixture(t)
	requests := []*http.Request{requestFixture(t), requestFixture(t)}
	requests[0].Header.Set("Authorization", "Bearer wrong")
	requests[1].Header.Set("Idempotency-Key", strings.Repeat("0", 64))
	for _, request := range requests {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code < 400 {
			t.Fatalf("accepted invalid: %d", response.Code)
		}
	}
	if runner.calls != 0 {
		t.Fatalf("mutated kanban %d", runner.calls)
	}
}
