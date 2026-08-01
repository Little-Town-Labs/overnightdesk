package securityteam

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

func TestScanUsesAuthenticatedBlockModeAndAcceptsOnlySafeContent(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != ServiceOrigin+"/scan-inbound" || request.Header.Get("Authorization") != "Bearer "+strings.Repeat("s", 32) {
			t.Fatalf("unexpected request boundary: %s", request.URL.String())
		}
		raw, _ := io.ReadAll(request.Body)
		body := string(raw)
		for _, required := range []string{`"source":"api"`, `"approvalMode":"block"`, `"contentType":"text"`, `"messageId":"` + strings.Repeat("a", 64) + `"`} {
			if !strings.Contains(body, required) {
				t.Fatalf("missing %s in %s", required, body)
			}
		}
		return response(http.StatusOK, `{"status":"safe","content":"screened wrapper","metadata":{"redactionCount":0,"injectionSignals":[],"processingMs":1,"source":"api","scannerScore":1,"quarantineDecision":"allow","unicodeStats":{"charactersStripped":0,"homoglyphsDetected":0},"encodingsDetected":0,"htmlSanitized":false}}`), nil
	})}
	client, err := NewClient(ServiceOrigin, strings.Repeat("s", 32), httpClient)
	if err != nil {
		t.Fatal(err)
	}
	safe, err := client.Scan(context.Background(), []byte("WEBVTT\nmeeting"), strings.Repeat("a", 64), "organizer_1")
	if err != nil || safe != "screened wrapper" {
		t.Fatalf("safe=%q err=%v", safe, err)
	}
}

func TestScanFailsClosedOnUnsafeResponses(t *testing.T) {
	bodies := []string{
		`{"status":"blocked","content":"leak","metadata":{"source":"api","quarantineDecision":"block"}}`,
		`{"status":"pending_approval","queueId":"q","metadata":{"source":"api","quarantineDecision":"pending_approval"}}`,
		`{"status":"safe","content":"ok","metadata":{"source":"gmail","quarantineDecision":"allow"}}`,
		`{"status":"safe","content":"","metadata":{"source":"api","quarantineDecision":"allow"}}`,
		`not-json`,
	}
	for _, body := range bodies {
		httpClient := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return response(http.StatusOK, body), nil })}
		client, _ := NewClient(ServiceOrigin, strings.Repeat("s", 32), httpClient)
		if _, err := client.Scan(context.Background(), []byte("WEBVTT\nmeeting"), strings.Repeat("a", 64), "organizer_1"); err == nil {
			t.Fatalf("unsafe response accepted: %s", body)
		}
	}
	client, _ := NewClient(ServiceOrigin, strings.Repeat("s", 32), &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return nil, errors.New("timeout with secret") })})
	if _, err := client.Scan(context.Background(), []byte("WEBVTT\nmeeting"), strings.Repeat("a", 64), "organizer_1"); SafeCode(err) != "securityteam_unavailable" || strings.Contains(err.Error(), "secret") {
		t.Fatalf("unsafe network error: %v", err)
	}
}

func TestNewClientRejectsChangedOriginAndShortToken(t *testing.T) {
	if _, err := NewClient("https://evil.example", strings.Repeat("s", 32), &http.Client{}); err == nil {
		t.Fatal("changed origin accepted")
	}
	if _, err := NewClient(ServiceOrigin, "short", &http.Client{}); err == nil {
		t.Fatal("short token accepted")
	}
}

func TestScanRejectsRedirectStatusAndOversizedResponse(t *testing.T) {
	for _, fixture := range []struct {
		status int
		body   string
		code   string
	}{
		{http.StatusFound, "", "securityteam_unavailable"},
		{http.StatusOK, strings.Repeat("x", int(MaxResponseBytes)+1), "securityteam_response_invalid"},
	} {
		client, _ := NewClient(ServiceOrigin, strings.Repeat("s", 32), &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return response(fixture.status, fixture.body), nil })})
		if _, err := client.Scan(context.Background(), []byte("WEBVTT\nmeeting"), strings.Repeat("a", 64), "organizer_1"); SafeCode(err) != fixture.code {
			t.Fatalf("status=%d code=%s err=%v", fixture.status, SafeCode(err), err)
		}
	}
}
