package graph

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type TokenProvider interface {
	Token(context.Context) (string, error)
	Invalidate()
}

type TokenSource struct {
	mu           sync.Mutex
	endpoint     string
	clientID     string
	clientSecret string
	httpClient   *http.Client
	now          func() time.Time
	cached       string
	usableUntil  time.Time
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
}

func NewTokenSource(tenantID, clientID, clientSecret string, client *http.Client) (*TokenSource, error) {
	if tenantID == "" || strings.ContainsAny(tenantID, "/?#") || clientID == "" || clientSecret == "" || client == nil {
		return nil, errors.New("token configuration invalid")
	}
	endpoint := "https://login.microsoftonline.com/" + tenantID + "/oauth2/v2.0/token"
	return newTokenSource(endpoint, clientID, clientSecret, client, time.Now), nil
}

func newTokenSource(endpoint, clientID, clientSecret string, client *http.Client, now func() time.Time) *TokenSource {
	return &TokenSource{endpoint: endpoint, clientID: clientID, clientSecret: clientSecret, httpClient: client, now: now}
}

func (source *TokenSource) Token(ctx context.Context) (string, error) {
	source.mu.Lock()
	defer source.mu.Unlock()
	now := source.now().UTC()
	if source.cached != "" && now.Before(source.usableUntil) {
		return source.cached, nil
	}
	form := url.Values{
		"client_id":     {source.clientID},
		"client_secret": {source.clientSecret},
		"grant_type":    {"client_credentials"},
		"scope":         {"https://graph.microsoft.com/.default"},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, source.endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", ProviderError{Code: "token_rejected"}
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := source.httpClient.Do(request)
	if err != nil {
		return "", ProviderError{Code: "token_unavailable"}
	}
	defer response.Body.Close()
	limited := io.LimitReader(response.Body, MaxResponseBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		return "", ProviderError{Code: "token_unavailable"}
	}
	if int64(len(raw)) > MaxResponseBytes {
		return "", ProviderError{Code: "token_rejected"}
	}
	if response.StatusCode != http.StatusOK {
		if response.StatusCode == http.StatusRequestTimeout || response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500 {
			return "", ProviderError{Code: "token_unavailable", HTTPStatus: response.StatusCode, RetryAfter: response.Header.Get("Retry-After")}
		}
		return "", ProviderError{Code: "token_rejected", HTTPStatus: response.StatusCode}
	}
	var decoded tokenResponse
	if json.Unmarshal(raw, &decoded) != nil || decoded.AccessToken == "" || decoded.TokenType != "Bearer" || decoded.ExpiresIn <= 0 || len(decoded.AccessToken) > int(MaxResponseBytes) {
		return "", ProviderError{Code: "token_rejected"}
	}
	margin := 5 * time.Minute
	expires := time.Duration(decoded.ExpiresIn) * time.Second
	if expires <= margin {
		margin = expires / 10
	}
	source.cached = decoded.AccessToken
	source.usableUntil = now.Add(expires - margin)
	return source.cached, nil
}

func (source *TokenSource) Invalidate() {
	source.mu.Lock()
	defer source.mu.Unlock()
	source.cached = ""
	source.usableUntil = time.Time{}
}
