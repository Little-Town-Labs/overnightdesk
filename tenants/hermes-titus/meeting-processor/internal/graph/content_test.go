package graph

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/testfixture"
)

func TestFetchTranscriptContentUsesExactBoundedVTTContract(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		want := "/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/meeting-1/transcripts/transcript-1/content"
		if request.URL.EscapedPath() != want || request.Header.Get("Accept") != "text/vtt" || request.Header.Get("Authorization") != "Bearer token" {
			t.Fatalf("unexpected request: %s accept=%q", request.URL.String(), request.Header.Get("Accept"))
		}
		response.Header().Set("Content-Type", "text/vtt; charset=utf-8")
		_, _ = response.Write([]byte("WEBVTT\n\n00:00.000 --> 00:01.000\nSpeaker: hello\n"))
	}))
	defer server.Close()
	client := NewClient(&fakeTokens{value: "token"}, graphTestClient(server))
	content, err := client.FetchTranscriptContent(context.Background(), testfixture.OrganizerOne, "meeting-1", "transcript-1")
	if err != nil || !strings.HasPrefix(string(content), "WEBVTT") {
		t.Fatalf("content=%q err=%v", content, err)
	}
}

func TestFetchTranscriptContentRejectsInvalidBodiesAndRecordingRoute(t *testing.T) {
	tests := []struct {
		name, contentType, body string
	}{
		{"mime", "application/json", "WEBVTT"},
		{"prefix", "text/vtt", "not-vtt"},
		{"nul", "text/vtt", "WEBVTT\x00"},
		{"utf8", "text/vtt", string([]byte{'W', 'E', 'B', 'V', 'T', 'T', '\n', 0xff})},
		{"oversize", "text/vtt", "WEBVTT\n" + strings.Repeat("x", int(MaxTranscriptContentBytes))},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
				response.Header().Set("Content-Type", test.contentType)
				_, _ = response.Write([]byte(test.body))
			}))
			defer server.Close()
			client := NewClient(&fakeTokens{value: "token"}, graphTestClient(server))
			if _, err := client.FetchTranscriptContent(context.Background(), testfixture.OrganizerOne, "meeting", "transcript"); err == nil || SafeCode(err) != "transcript_content_invalid" {
				t.Fatalf("expected transcript_content_invalid, got %v", err)
			}
		})
	}
	route, err := TranscriptContentURL(testfixture.OrganizerOne, "meeting/escape", "transcript#fragment")
	if err != nil || !strings.Contains(route, "meeting%2Fescape/transcripts/transcript%23fragment/content") {
		t.Fatalf("provider identifiers were not path encoded: %s err=%v", route, err)
	}
}

func TestFetchTranscriptContentRefreshesTokenOnce(t *testing.T) {
	var calls int
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		calls++
		if request.Header.Get("Authorization") == "Bearer token" {
			response.WriteHeader(http.StatusUnauthorized)
			return
		}
		response.Header().Set("Content-Type", "text/vtt")
		_, _ = response.Write([]byte("WEBVTT\n"))
	}))
	defer server.Close()
	tokens := &fakeTokens{value: "token"}
	client := NewClient(tokens, graphTestClient(server))
	if _, err := client.FetchTranscriptContent(context.Background(), testfixture.OrganizerOne, "meeting", "transcript"); err != nil {
		t.Fatal(err)
	}
	if calls != 2 || tokens.invalidated != 1 {
		t.Fatalf("calls=%d invalidations=%d", calls, tokens.invalidated)
	}
}

func TestFetchTranscriptContentRetriesTemporaryFailureAndRejectsRedirect(t *testing.T) {
	var calls int
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		calls++
		if calls < 3 {
			response.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		response.Header().Set("Content-Type", "text/vtt")
		_, _ = response.Write([]byte("WEBVTT\n"))
	}))
	defer server.Close()
	client := NewClient(&fakeTokens{value: "token"}, graphTestClient(server))
	client.retry = noDelayRetryPolicy()
	if _, err := client.FetchTranscriptContent(context.Background(), testfixture.OrganizerOne, "meeting", "transcript"); err != nil || calls != 3 {
		t.Fatalf("calls=%d err=%v", calls, err)
	}

	redirect := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Location", "https://evil.example/content")
		response.WriteHeader(http.StatusFound)
	}))
	defer redirect.Close()
	client = NewClient(&fakeTokens{value: "token"}, graphTestClient(redirect))
	client.retry = noDelayRetryPolicy()
	if _, err := client.FetchTranscriptContent(context.Background(), testfixture.OrganizerOne, "meeting", "transcript"); err == nil || SafeCode(err) != "provider_response_invalid" {
		t.Fatalf("redirect accepted: %v", err)
	}
}
