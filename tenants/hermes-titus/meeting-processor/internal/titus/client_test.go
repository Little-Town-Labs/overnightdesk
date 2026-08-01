package titus

import (
	"context"
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

func TestAnalyzeUsesStatelessNoToolRequest(t *testing.T) {
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
		for _, required := range []string{`"model":"hermes-agent"`, `"stream":false`, "screened wrapper", "do not call tools"} {
			if !strings.Contains(strings.ToLower(body), strings.ToLower(required)) {
				t.Fatalf("request missing %s: %s", required, body)
			}
		}
		return response(http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":"## Summary\nDone\n\n## Decisions\nNone\n\n## Action Items\nNone\n\n## Unresolved Questions\nNone"},"finish_reason":"stop"}]}`), nil
	})}
	client, err := NewClient(ServiceOrigin, strings.Repeat("h", 32), httpClient)
	if err != nil {
		t.Fatal(err)
	}
	output, err := client.Analyze(context.Background(), reference, "screened wrapper", []string{"protected-id"})
	if err != nil || !strings.Contains(output, "## Summary") {
		t.Fatalf("output=%q err=%v", output, err)
	}
}

func TestAnalyzeRejectsProtectedAndUnsafeOutput(t *testing.T) {
	protected := "meeting-protected-id"
	outputs := []string{
		"## Summary\n" + protected + "\n## Decisions\nNone\n## Action Items\nNone\n## Unresolved Questions\nNone",
		"## Summary\nhttps://graph.microsoft.com/v1.0/users/x\n## Decisions\nNone\n## Action Items\nNone\n## Unresolved Questions\nNone",
		"## Summary\nAuthorization: Bearer abc\n## Decisions\nNone\n## Action Items\nNone\n## Unresolved Questions\nNone",
		"plain text",
		"",
	}
	for _, output := range outputs {
		body := `{"choices":[{"message":{"role":"assistant","content":` + quote(output) + `},"finish_reason":"stop"}]}`
		client, _ := NewClient(ServiceOrigin, strings.Repeat("h", 32), &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return response(http.StatusOK, body), nil })})
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
		client, _ := NewClient(ServiceOrigin, strings.Repeat("h", 32), &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return response(http.StatusOK, body), nil })})
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
			return response(http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":`+quote("## Summary\n"+strings.Repeat("x", MaxOutputBytes)+"\n## Decisions\nNone\n## Action Items\nNone\n## Unresolved Questions\nNone")+`},"finish_reason":"stop"}]}`), nil
		})}, "titus_output_rejected"},
	} {
		client, _ := NewClient(ServiceOrigin, strings.Repeat("h", 32), fixture.client)
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
