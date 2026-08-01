package analyzer

import (
	"context"
	"encoding/json"
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

func analyzerResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}

func TestClientUsesAuthenticatedStatelessNoToolContract(t *testing.T) {
	briefRaw, _ := json.Marshal(validBrief())
	httpClient := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != ServiceOrigin+"/v1/chat/completions" || request.Header.Get("Authorization") != "Bearer "+strings.Repeat("h", 32) || request.Header.Get("Idempotency-Key") == "" {
			t.Fatalf("unexpected request: %s", request.URL.String())
		}
		raw, _ := io.ReadAll(request.Body)
		for _, forbidden := range []string{`"tools"`, `"session`, `"stream":true`} {
			if strings.Contains(string(raw), forbidden) {
				t.Fatalf("request contains %s", forbidden)
			}
		}
		encoded, _ := json.Marshal(string(briefRaw))
		return analyzerResponse(http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":`+string(encoded)+`},"finish_reason":"stop"}]}`), nil
	})}
	client, err := NewClient(ServiceOrigin, strings.Repeat("h", 32), httpClient)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Analyze(context.Background(), strings.Repeat("a", 64), "2026-08-01T12:00:00Z", "screened wrapper 01:02.003 due 2026-08-08 and 02:03", nil); err != nil {
		t.Fatal(err)
	}
}

func TestClientRejectsRedirectTimeoutToolAndMalformedResponses(t *testing.T) {
	fixtures := []struct {
		response *http.Response
		err      error
	}{
		{response: analyzerResponse(http.StatusFound, "")},
		{err: errors.New("timeout detail")},
		{response: analyzerResponse(http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":"{}","tool_calls":[{}]},"finish_reason":"tool_calls"}]}`)},
		{response: analyzerResponse(http.StatusOK, `not-json`)},
	}
	for _, fixture := range fixtures {
		client, _ := NewClient(ServiceOrigin, strings.Repeat("h", 32), &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return fixture.response, fixture.err })})
		if _, err := client.Analyze(context.Background(), strings.Repeat("a", 64), "2026-08-01T12:00:00Z", "screened", nil); err == nil {
			t.Fatal("unsafe response accepted")
		}
	}
}
