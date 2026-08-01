package graph

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/testfixture"
)

type fakeTokens struct {
	mu          sync.Mutex
	value       string
	invalidated int
}

func (tokens *fakeTokens) Token(context.Context) (string, error) {
	tokens.mu.Lock()
	defer tokens.mu.Unlock()
	return tokens.value, nil
}
func (tokens *fakeTokens) Invalidate() {
	tokens.mu.Lock()
	defer tokens.mu.Unlock()
	tokens.invalidated++
	tokens.value = "fresh-token"
}

func graphTestClient(server *httptest.Server) *http.Client {
	serverURL, _ := url.Parse(server.URL)
	transport := server.Client().Transport
	return &http.Client{
		Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			clone := request.Clone(request.Context())
			clone.URL.Scheme = serverURL.Scheme
			clone.URL.Host = serverURL.Host
			return transport.RoundTrip(clone)
		}),
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestFetchDeltaCompletesPaginationAndOmitsContentFields(t *testing.T) {
	next := "https://graph.microsoft.com/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='" + testfixture.OrganizerOne + "')/delta?$skipToken=two"
	delta := strings.Replace(next, "$skipToken=two", "$deltaToken=three", 1)
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "application/json")
		if request.URL.Query().Has("$skipToken") {
			_, _ = response.Write([]byte(testfixture.DeltaPage("artifact-2", "meeting-2", "2026-08-01T12:01:00Z", "", delta)))
			return
		}
		_, _ = response.Write([]byte(testfixture.DeltaPage("artifact-1", "meeting-1", "2026-08-01T12:00:00Z", next, "")))
	}))
	defer server.Close()
	tokens := &fakeTokens{value: "token"}
	client := NewClient(tokens, graphTestClient(server))
	initial, _ := InitialDeltaURL(testfixture.OrganizerOne, Transcript, fixedLookback())
	round, err := client.FetchDelta(context.Background(), testfixture.OrganizerOne, Transcript, initial)
	if err != nil {
		t.Fatal(err)
	}
	if round.PageCount != 2 || len(round.Artifacts) != 2 || round.DeltaLink != delta {
		t.Fatalf("unexpected round: %#v", round)
	}
	if round.Artifacts[0].ID != "artifact-1" || round.Artifacts[0].MeetingID != "meeting-1" {
		t.Fatalf("unexpected narrow artifact: %#v", round.Artifacts[0])
	}
}

func TestFetchDeltaRejectsMissingLinkAndOversizeResponse(t *testing.T) {
	for _, body := range []string{`{"value":[]}`, strings.Repeat("x", int(MaxResponseBytes)+1)} {
		server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) { _, _ = response.Write([]byte(body)) }))
		client := NewClient(&fakeTokens{value: "token"}, graphTestClient(server))
		initial, _ := InitialDeltaURL(testfixture.OrganizerOne, Transcript, fixedLookback())
		_, err := client.FetchDelta(context.Background(), testfixture.OrganizerOne, Transcript, initial)
		server.Close()
		if err == nil || SafeCode(err) != "provider_response_invalid" {
			t.Fatalf("expected provider_response_invalid, got %v", err)
		}
	}
}

func TestFetchDeltaRefreshesOnceAfter401(t *testing.T) {
	var calls int
	delta := "https://graph.microsoft.com/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/getAllRecordings(meetingOrganizerUserId='" + testfixture.OrganizerOne + "')/delta?$deltaToken=done"
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		calls++
		if request.Header.Get("Authorization") == "Bearer token" {
			response.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = response.Write([]byte(testfixture.DeltaPage("artifact", "meeting", "2026-08-01T12:00:00Z", "", delta)))
	}))
	defer server.Close()
	tokens := &fakeTokens{value: "token"}
	client := NewClient(tokens, graphTestClient(server))
	initial, _ := InitialDeltaURL(testfixture.OrganizerOne, Recording, fixedLookback())
	if _, err := client.FetchDelta(context.Background(), testfixture.OrganizerOne, Recording, initial); err != nil {
		t.Fatal(err)
	}
	if calls != 2 || tokens.invalidated != 1 {
		t.Fatalf("calls=%d invalidations=%d", calls, tokens.invalidated)
	}
}

func TestFetchDeltaStopsAtPageLimit(t *testing.T) {
	next := "https://graph.microsoft.com/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='" + testfixture.OrganizerOne + "')/delta?$skipToken=loop"
	var calls int
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		calls++
		_, _ = response.Write([]byte(testfixture.DeltaPage("artifact", "meeting", "2026-08-01T12:00:00Z", next, "")))
	}))
	defer server.Close()
	client := NewClient(&fakeTokens{value: "token"}, graphTestClient(server))
	initial, _ := InitialDeltaURL(testfixture.OrganizerOne, Transcript, fixedLookback())
	_, err := client.FetchDelta(context.Background(), testfixture.OrganizerOne, Transcript, initial)
	if err == nil || SafeCode(err) != "provider_response_invalid" || calls != MaxPages {
		t.Fatalf("expected bounded page failure, calls=%d err=%v", calls, err)
	}
}

func TestFetchDeltaRejectsAggregateArtifactLimits(t *testing.T) {
	next := "https://graph.microsoft.com/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='" + testfixture.OrganizerOne + "')/delta?skipToken=next"
	delta := "https://graph.microsoft.com/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='" + testfixture.OrganizerOne + "')/delta?deltaToken=done"
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Query().Has("skipToken") {
			_, _ = response.Write([]byte(testfixture.DeltaPage("artifact-2", "meeting-2", "2026-08-01T12:01:00Z", "", delta)))
			return
		}
		_, _ = response.Write([]byte(testfixture.DeltaPage("artifact-1", "meeting-1", "2026-08-01T12:00:00Z", next, "")))
	}))
	defer server.Close()
	client := NewClient(&fakeTokens{value: "token"}, graphTestClient(server))
	client.maxArtifacts = 10
	client.maxArtifactBytes = 64
	initial, _ := InitialDeltaURL(testfixture.OrganizerOne, Transcript, fixedLookback())
	_, err := client.FetchDelta(context.Background(), testfixture.OrganizerOne, Transcript, initial)
	if err == nil || SafeCode(err) != "provider_response_invalid" {
		t.Fatalf("expected aggregate bound rejection, got %v", err)
	}
}

func TestFetchDeltaRetriesTemporaryTokenEndpointFailures(t *testing.T) {
	var tokenCalls int
	tokenServer := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		tokenCalls++
		if tokenCalls < 3 {
			response.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = response.Write([]byte(`{"access_token":"token","token_type":"Bearer","expires_in":3600}`))
	}))
	defer tokenServer.Close()
	tokens := newTokenSource(tokenServer.URL, testfixture.ClientID, testfixture.ClientSecret, tokenServer.Client(), time.Now)
	delta := "https://graph.microsoft.com/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='" + testfixture.OrganizerOne + "')/delta?deltaToken=done"
	graphServer := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		_, _ = response.Write([]byte(testfixture.DeltaPage("artifact", "meeting", "2026-08-01T12:00:00Z", "", delta)))
	}))
	defer graphServer.Close()
	client := NewClient(tokens, graphTestClient(graphServer))
	client.retry = noDelayRetryPolicy()
	initial, _ := InitialDeltaURL(testfixture.OrganizerOne, Transcript, fixedLookback())
	round, err := client.FetchDelta(context.Background(), testfixture.OrganizerOne, Transcript, initial)
	if err != nil || tokenCalls != 3 || round.RetryCount != 2 {
		t.Fatalf("calls=%d retries=%d err=%v", tokenCalls, round.RetryCount, err)
	}
}

func TestFetchDeltaReportsExhaustedTokenNetworkRetries(t *testing.T) {
	tokenHTTP := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("temporary network failure with protected detail")
	})}
	tokens := newTokenSource("https://login.microsoftonline.com/tenant/oauth2/v2.0/token", testfixture.ClientID, testfixture.ClientSecret, tokenHTTP, time.Now)
	client := NewClient(tokens, &http.Client{})
	client.retry = noDelayRetryPolicy()
	initial, _ := InitialDeltaURL(testfixture.OrganizerOne, Transcript, fixedLookback())
	_, err := client.FetchDelta(context.Background(), testfixture.OrganizerOne, Transcript, initial)
	if SafeCode(err) != "token_unavailable" || RetryCount(err) != 2 || strings.Contains(err.Error(), "protected") {
		t.Fatalf("unexpected token retry error: code=%s retries=%d err=%v", SafeCode(err), RetryCount(err), err)
	}
}

func noDelayRetryPolicy() RetryPolicy {
	return RetryPolicy{MaxAttempts: 3, BaseDelay: time.Nanosecond, MaxDelay: time.Nanosecond, Sleep: func(context.Context, time.Duration) error { return nil }}
}

func fixedLookback() time.Time {
	return time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
}
