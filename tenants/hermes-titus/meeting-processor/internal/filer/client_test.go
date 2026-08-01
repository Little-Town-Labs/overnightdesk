package filer

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/analyzer"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}
func TestFileBindsExactBodyAndValidatesReadback(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		raw, _ := io.ReadAll(request.Body)
		digest := sha256.Sum256(raw)
		digestHex := hex.EncodeToString(digest[:])
		if request.Header.Get("Idempotency-Key") != digestHex {
			t.Fatal("body not bound")
		}
		var input Request
		_ = json.Unmarshal(raw, &input)
		triage := filingItemKey(input.Reference, input.BriefDigest, "triage", 0)
		note := filingItemKey(input.Reference, input.BriefDigest, "note", 0)
		result := Result{SchemaVersion: "meeting-filing-result/v1", Reference: input.Reference, RequestDigest: digestHex, NoteRelativePath: "00-inbox/meetings/2026-08-01-" + input.Reference + ".md", NoteDigest: strings.Repeat("d", 64), NoteKey: note, Board: "meeting-triage", TriageTaskKey: &triage, ActionTaskKeys: []string{}, FiledAt: "2026-08-01T13:00:00Z"}
		body, _ := json.Marshal(result)
		return &http.Response{StatusCode: http.StatusCreated, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(string(body)))}, nil
	})}
	client, err := NewClient(ServiceOrigin, strings.Repeat("b", 32), httpClient)
	if err != nil {
		t.Fatal(err)
	}
	brief := analyzer.Brief{SchemaVersion: "meeting-brief/v1", Title: "Title", OccurredAt: "2026-08-01T12:00:00Z", Summary: "Summary"}
	briefRaw, _ := json.Marshal(brief)
	briefDigest := sha256.Sum256(briefRaw)
	result, err := client.File(context.Background(), Request{SchemaVersion: "meeting-filing/v1", Reference: "MB-ABCDEFGHIJKL", ApprovedBy: "gary", ApprovedAt: "2026-08-01T12:30:00Z", BriefDigest: hex.EncodeToString(briefDigest[:]), Brief: brief})
	if err != nil || result.Board != "meeting-triage" {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}
