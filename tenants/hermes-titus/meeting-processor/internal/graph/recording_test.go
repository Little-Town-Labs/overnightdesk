package graph

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/testfixture"
)

func TestVerifyRecordingContentStreamsHashAndDiscardsMP4(t *testing.T) {
	body := bytes.Repeat([]byte{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p'}, 1024)
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		want := "/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/meeting-1/recordings/recording-1/content"
		if request.URL.EscapedPath() != want || request.Header.Get("Accept") != "video/mp4" || request.Header.Get("Authorization") != "Bearer token" {
			t.Fatalf("unexpected request: %s", request.URL.String())
		}
		response.Header().Set("Content-Type", "video/mp4")
		response.Header().Set("Content-Length", "8192")
		_, _ = response.Write(body)
	}))
	defer server.Close()
	client := NewClient(&fakeTokens{value: "token"}, graphTestClient(server))
	got, err := client.VerifyRecordingContent(context.Background(), testfixture.OrganizerOne, "meeting-1", "recording-1", 10_000)
	want := sha256.Sum256(body)
	if err != nil || got.SHA256 != hex.EncodeToString(want[:]) || got.Bytes != int64(len(body)) || got.ContentType != "video/mp4" {
		t.Fatalf("got=%#v err=%v", got, err)
	}
}

func TestVerifyRecordingContentRejectsRedirectTypeOversizeAndInterruptedBody(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		contentType string
		length      string
		body        string
		maximum     int64
	}{
		{"redirect", http.StatusFound, "video/mp4", "", "", 20},
		{"mime", http.StatusOK, "application/json", "4", "data", 20},
		{"oversize header", http.StatusOK, "video/mp4", "21", strings.Repeat("x", 21), 20},
		{"oversize stream", http.StatusOK, "video/mp4", "", strings.Repeat("x", 21), 20},
		{"interrupted", http.StatusOK, "video/mp4", "20", "short", 20},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
				if test.status == http.StatusFound {
					response.Header().Set("Location", "https://evil.example/recording")
				}
				response.Header().Set("Content-Type", test.contentType)
				if test.length != "" {
					response.Header().Set("Content-Length", test.length)
				}
				response.WriteHeader(test.status)
				_, _ = response.Write([]byte(test.body))
			}))
			defer server.Close()
			client := NewClient(&fakeTokens{value: "token"}, graphTestClient(server))
			client.retry = noDelayRetryPolicy()
			if _, err := client.VerifyRecordingContent(context.Background(), testfixture.OrganizerOne, "meeting", "recording", test.maximum); err == nil {
				t.Fatal("invalid recording accepted")
			}
		})
	}
	route, err := RecordingContentURL(testfixture.OrganizerOne, "meeting/escape", "recording#fragment")
	if err != nil || !strings.Contains(route, "meeting%2Fescape/recordings/recording%23fragment/content") {
		t.Fatalf("route=%s err=%v", route, err)
	}
}
