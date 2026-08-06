package titus

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func response(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}

func TestMeetingBriefAnalyzeUsesStatelessNoToolRequest(t *testing.T) {
	reference := strings.Repeat("a", 64)
	httpClient := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != ServiceOrigin+"/v1/chat/completions" || request.Header.Get("Authorization") != "Bearer "+strings.Repeat("h", 32) {
			t.Fatalf("unexpected request: %s", request.URL.String())
		}
		if request.Header.Get("X-Hermes-Session-Key") != "" || request.Header.Get("Idempotency-Key") == "" {
			t.Fatal("session/idempotency contract violated")
		}
		raw, _ := io.ReadAll(request.Body)
		body := string(raw)
		for _, forbidden := range []string{`"tools"`, `"session`, `"stream":true`} {
			if strings.Contains(body, forbidden) {
				t.Fatalf("request contains %s", forbidden)
			}
		}
		for _, required := range []string{`"model":"hermes-agent"`, `"stream":false`, "screened wrapper", "do not call tools", "Return Markdown only", "Participants", "Action Items", "owner label: Gary, Austin, or Unassigned", "Unresolved Questions"} {
			if !strings.Contains(strings.ToLower(body), strings.ToLower(required)) {
				t.Fatalf("request missing %s: %s", required, body)
			}
		}
		return response(http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":`+quote(validBriefMarkdown())+`},"finish_reason":"stop"}]}`), nil
	})}
	client, err := NewMeetingBriefClient(ServiceOrigin, strings.Repeat("h", 32), httpClient)
	if err != nil {
		t.Fatal(err)
	}
	output, err := client.Analyze(context.Background(), reference, "screened wrapper", []string{"protected-id"})
	if err != nil || !strings.Contains(output, "## Summary") {
		t.Fatalf("output=%q err=%v", output, err)
	}
}

func TestMeetingBriefIdempotencyIncludesSystemPromptDigest(t *testing.T) {
	reference := strings.Repeat("a", 64)
	screened := "screened"
	var got string
	client, err := NewMeetingBriefClient(ServiceOrigin, strings.Repeat("h", 32), &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		got = request.Header.Get("Idempotency-Key")
		return response(http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":`+quote(validBriefMarkdown())+`},"finish_reason":"stop"}]}`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Analyze(context.Background(), reference, screened, nil); err != nil {
		t.Fatal(err)
	}
	safeDigest := sha256.Sum256([]byte(screened))
	promptDigest := sha256.Sum256([]byte(briefSystemInstruction))
	wantInput := "titus-meeting-brief/v1" + "\x00" + hex.EncodeToString(promptDigest[:]) + "\x00" + reference + "\x00" + hex.EncodeToString(safeDigest[:])
	wantDigest := sha256.Sum256([]byte(wantInput))
	if want := hex.EncodeToString(wantDigest[:]); got != want {
		t.Fatalf("prompt-aware idempotency key mismatch: got=%s want=%s", got, want)
	}
}

func TestExplicitContractsPreserveMarkdownRollbackAndRejectCrossContractOutput(t *testing.T) {
	markdown := "## Participants\n- Gary\n\n## Summary\nDone\n\n## Decisions\nNone\n\n## Action Items\n- None\n\n## Unresolved Questions\nNone"
	briefResponse := `{"choices":[{"message":{"role":"assistant","content":` + quote(validBriefJSON()) + `},"finish_reason":"stop"}]}`
	markdownResponse := `{"choices":[{"message":{"role":"assistant","content":` + quote(markdown) + `},"finish_reason":"stop"}]}`
	newHTTPClient := func(body string) *http.Client {
		return &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return response(http.StatusOK, body), nil
		})}
	}

	legacy, err := NewMarkdownClient(ServiceOrigin, strings.Repeat("h", 32), newHTTPClient(markdownResponse))
	if err != nil {
		t.Fatal(err)
	}
	if output, err := legacy.Analyze(context.Background(), strings.Repeat("a", 64), "screened", nil); err != nil || output != markdown {
		t.Fatalf("markdown rollback output=%q err=%v", output, err)
	}
	legacyJSON, _ := NewMarkdownClient(ServiceOrigin, strings.Repeat("h", 32), newHTTPClient(briefResponse))
	if _, err := legacyJSON.Analyze(context.Background(), strings.Repeat("a", 64), "screened", nil); SafeCode(err) != "titus_output_rejected" {
		t.Fatalf("markdown contract accepted JSON: %v", err)
	}

	brief, _ := NewMeetingBriefClient(ServiceOrigin, strings.Repeat("h", 32), newHTTPClient(markdownResponse))
	if output, err := brief.Analyze(context.Background(), strings.Repeat("a", 64), "screened", nil); err != nil || !strings.Contains(output, "## Summary") {
		t.Fatalf("meeting brief output=%q err=%v", output, err)
	}
	briefJSON, _ := NewMeetingBriefClient(ServiceOrigin, strings.Repeat("h", 32), newHTTPClient(briefResponse))
	if _, err := briefJSON.Analyze(context.Background(), strings.Repeat("a", 64), "screened", nil); SafeCode(err) != "titus_output_rejected" {
		t.Fatalf("meeting brief contract accepted JSON: %v", err)
	}
}

func TestMarkdownClientPreservesFeature034IdempotencyKey(t *testing.T) {
	reference := strings.Repeat("a", 64)
	screened := "screened"
	var got string
	client, err := NewMarkdownClient(ServiceOrigin, strings.Repeat("h", 32), &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		got = request.Header.Get("Idempotency-Key")
		return response(http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":"## Participants\n- Gary\n## Summary\nDone\n## Decisions\nNone\n## Action Items\n- None\n## Unresolved Questions\nNone"},"finish_reason":"stop"}]}`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Analyze(context.Background(), reference, screened, nil); err != nil {
		t.Fatal(err)
	}
	safeDigest := sha256.Sum256([]byte(screened))
	wantDigest := sha256.Sum256([]byte(reference + "\x00" + hex.EncodeToString(safeDigest[:])))
	if want := hex.EncodeToString(wantDigest[:]); got != want {
		t.Fatalf("Feature 034 idempotency key changed: got=%s want=%s", got, want)
	}
}

func validBriefJSON() string {
	return `{"schemaVersion":"meeting-brief/v1","title":"Test meeting","occurredAt":"2026-08-01T12:00:00Z","participants":["Gary"],"summary":"Discussed internal delivery work.","facts":["The test completed."],"decisions":[],"actionItems":[],"externalCommitments":[],"unresolvedQuestions":[],"proposedFollowUp":"Review the internal note.","projectHint":null,"projectConfidence":"unknown"}`
}

func validBriefMarkdown() string {
	return "## Participants\n- Gary\n\n## Summary\nDiscussed internal delivery work.\n\n## Decisions\nNone.\n\n## Action Items\n- None.\n\n## Unresolved Questions\nNone."
}

func TestMeetingBriefMarkdownRequiresParticipantsAndActionOwnerLabels(t *testing.T) {
	valid := "## Participants\n- Gary\n- Austin\n\n## Summary\nDone.\n\n## Decisions\nNone.\n\n## Action Items\n- Prepare the draft — owner: Gary; due: not stated; source: 00:01; confidence: high\n\n## Unresolved Questions\nNone."
	if _, err := ValidateMeetingBriefMarkdown(valid, nil); err != nil {
		t.Fatalf("valid attributed brief rejected: %v", err)
	}

	missingParticipants := strings.Replace(valid, "## Participants\n- Gary\n- Austin\n\n", "", 1)
	if _, err := ValidateMeetingBriefMarkdown(missingParticipants, nil); SafeCode(err) != "titus_output_rejected" {
		t.Fatalf("brief without participants accepted: %v", err)
	}

	missingOwner := strings.Replace(valid, "owner: Gary", "owner omitted", 1)
	if _, err := ValidateMeetingBriefMarkdown(missingOwner, nil); SafeCode(err) != "titus_output_rejected" {
		t.Fatalf("action without owner accepted: %v", err)
	}

	unknownOwner := strings.Replace(valid, "owner: Gary", "owner: Client", 1)
	if _, err := ValidateMeetingBriefMarkdown(unknownOwner, nil); SafeCode(err) != "titus_output_rejected" {
		t.Fatalf("unknown owner accepted: %v", err)
	}

	unassigned := strings.Replace(valid, "owner: Gary", "owner: Unassigned", 1)
	if _, err := ValidateMeetingBriefMarkdown(unassigned, nil); err != nil {
		t.Fatalf("unassigned action rejected: %v", err)
	}
}

func TestAnalyzeRejectsProtectedAndUnsafeOutput(t *testing.T) {
	protected := "meeting-protected-id"
	outputs := []string{
		`{"schemaVersion":"meeting-brief/v1","title":"` + protected + `","occurredAt":"2026-08-01T12:00:00Z","participants":[],"summary":"Summary","facts":[],"decisions":[],"actionItems":[],"externalCommitments":[],"unresolvedQuestions":[],"proposedFollowUp":"","projectHint":null,"projectConfidence":"unknown"}`,
		`{"schemaVersion":"meeting-brief/v1","title":"Test","occurredAt":"2026-08-01T12:00:00Z","participants":[],"summary":"https://graph.microsoft.com/v1.0/users/x","facts":[],"decisions":[],"actionItems":[],"externalCommitments":[],"unresolvedQuestions":[],"proposedFollowUp":"","projectHint":null,"projectConfidence":"unknown"}`,
		`{"schemaVersion":"meeting-brief/v1","title":"Test","occurredAt":"2026-08-01T12:00:00Z","participants":[],"summary":"Authorization: Bearer abc","facts":[],"decisions":[],"actionItems":[],"externalCommitments":[],"unresolvedQuestions":[],"proposedFollowUp":"","projectHint":null,"projectConfidence":"unknown"}`,
		"plain text",
		"",
	}
	for _, output := range outputs {
		body := `{"choices":[{"message":{"role":"assistant","content":` + quote(output) + `},"finish_reason":"stop"}]}`
		client, _ := NewMeetingBriefClient(ServiceOrigin, strings.Repeat("h", 32), &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return response(http.StatusOK, body), nil })})
		if _, err := client.Analyze(context.Background(), strings.Repeat("a", 64), "screened", []string{protected}); SafeCode(err) != "titus_output_rejected" {
			t.Fatalf("unsafe output accepted or wrong code: %q err=%v", output, err)
		}
	}
}

func TestAnalyzeRejectsToolOrAmbiguousResponse(t *testing.T) {
	bodies := []string{
		`{"choices":[{"message":{"role":"assistant","content":"ok","tool_calls":[{}]},"finish_reason":"tool_calls"}]}`,
		`{"choices":[]}`,
		`{"choices":[{"message":{"role":"assistant","content":"one"}},{"message":{"role":"assistant","content":"two"}}]}`,
		`not-json`,
	}
	for _, body := range bodies {
		client, _ := NewMeetingBriefClient(ServiceOrigin, strings.Repeat("h", 32), &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return response(http.StatusOK, body), nil })})
		if _, err := client.Analyze(context.Background(), strings.Repeat("a", 64), "screened", nil); err == nil {
			t.Fatalf("ambiguous response accepted: %s", body)
		}
	}
}

func TestAnalyzeRejectsRedirectTimeoutAndOversizedOutput(t *testing.T) {
	reference := strings.Repeat("a", 64)
	for _, fixture := range []struct {
		client *http.Client
		code   string
	}{
		{&http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return response(http.StatusFound, ""), nil })}, "titus_unavailable"},
		{&http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return nil, errors.New("timeout with protected detail") })}, "titus_unavailable"},
		{&http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return response(http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":`+quote(strings.Repeat("x", MaxOutputBytes))+`},"finish_reason":"stop"}]}`), nil
		})}, "titus_output_rejected"},
	} {
		client, _ := NewMeetingBriefClient(ServiceOrigin, strings.Repeat("h", 32), fixture.client)
		if _, err := client.Analyze(context.Background(), reference, "screened", nil); SafeCode(err) != fixture.code {
			t.Fatalf("code=%s err=%v", SafeCode(err), err)
		}
	}
}

func quote(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	value = strings.ReplaceAll(value, "\n", `\n`)
	return `"` + value + `"`
}
