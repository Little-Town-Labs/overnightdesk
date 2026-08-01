package graph

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/testfixture"
)

func TestTokenSourceCachesWithExpiryMarginAndInvalidates(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		calls.Add(1)
		if err := request.ParseForm(); err != nil || request.Form.Get("grant_type") != "client_credentials" || request.Form.Get("scope") != "https://graph.microsoft.com/.default" {
			t.Fatal("unexpected token form")
		}
		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"access_token":"token-value","token_type":"Bearer","expires_in":3600}`))
	}))
	defer server.Close()
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	source := newTokenSource(server.URL, testfixture.ClientID, testfixture.ClientSecret, server.Client(), func() time.Time { return now })
	for range 2 {
		if token, err := source.Token(context.Background()); err != nil || token != "token-value" {
			t.Fatalf("token = %q, err = %v", token, err)
		}
	}
	if calls.Load() != 1 {
		t.Fatal("token was not cached")
	}
	source.Invalidate()
	if _, err := source.Token(context.Background()); err != nil || calls.Load() != 2 {
		t.Fatal("invalidation did not refresh token")
	}
}

func TestTokenSourceRejectsOversizeInvalidAndSecretBearingErrors(t *testing.T) {
	cases := []string{
		`{"access_token":"","token_type":"Bearer","expires_in":3600}`,
		`{"access_token":"token","token_type":"Basic","expires_in":3600}`,
		strings.Repeat("x", int(MaxResponseBytes)+1),
	}
	for _, body := range cases {
		server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
			response.Header().Set("Content-Type", "application/json")
			_, _ = response.Write([]byte(body))
		}))
		source := newTokenSource(server.URL, testfixture.ClientID, testfixture.ClientSecret, server.Client(), time.Now)
		_, err := source.Token(context.Background())
		server.Close()
		if err == nil || strings.Contains(err.Error(), testfixture.ClientSecret) || strings.Contains(err.Error(), body) {
			t.Fatal("unsafe or missing token error")
		}
	}
}

func TestTokenSourceUsesFixedTenantEndpoint(t *testing.T) {
	source, err := NewTokenSource(testfixture.TenantID, testfixture.ClientID, testfixture.ClientSecret, NewHTTPClient(30*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if source.endpoint != "https://login.microsoftonline.com/"+testfixture.TenantID+"/oauth2/v2.0/token" {
		t.Fatal("unexpected token endpoint")
	}
}
