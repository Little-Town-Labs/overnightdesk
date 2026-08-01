package graph

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Artifact struct {
	ID        string
	MeetingID string
	CreatedAt string
}

type Round struct {
	Artifacts  []Artifact
	DeltaLink  string
	PageCount  int
	RetryCount int
}

type ProviderError struct {
	Code       string
	HTTPStatus int
	RetryAfter string
	RetryCount int
}

func (err ProviderError) Error() string { return err.Code }

func SafeCode(err error) string {
	var provider ProviderError
	if errors.As(err, &provider) {
		return provider.Code
	}
	return "provider_unavailable"
}

func RetryCount(err error) int {
	var provider ProviderError
	if errors.As(err, &provider) && provider.RetryCount > 0 {
		return provider.RetryCount
	}
	return 0
}

func HTTPStatusClass(err error) string {
	var provider ProviderError
	if errors.As(err, &provider) && provider.HTTPStatus >= 100 && provider.HTTPStatus <= 599 {
		return fmt.Sprintf("%dxx", provider.HTTPStatus/100)
	}
	return ""
}

type Client struct {
	tokens           TokenProvider
	http             *http.Client
	retry            RetryPolicy
	maxArtifacts     int
	maxArtifactBytes int64
}

func NewClient(tokens TokenProvider, client *http.Client) *Client {
	return &Client{
		tokens: tokens, http: client, retry: DefaultRetryPolicy(),
		maxArtifacts: MaxRoundArtifacts, maxArtifactBytes: MaxRoundArtifactBytes,
	}
}

type deltaPage struct {
	Value []struct {
		ID              string `json:"id"`
		MeetingID       string `json:"meetingId"`
		CreatedDateTime string `json:"createdDateTime"`
	} `json:"value"`
	NextLink  string `json:"@odata.nextLink"`
	DeltaLink string `json:"@odata.deltaLink"`
}

func (client *Client) FetchDelta(ctx context.Context, organizerID string, kind ArtifactType, startURL string) (Round, error) {
	if err := validateStartURL(startURL, organizerID, kind); err != nil {
		return Round{}, ProviderError{Code: "state_invalid"}
	}
	current := startURL
	result := Round{Artifacts: make([]Artifact, 0)}
	var artifactBytes int64
	refreshed := false
	for pageNumber := 1; pageNumber <= MaxPages; pageNumber++ {
		var token string
		tokenRetries, tokenErr := client.retry.DoWithCount(ctx, func() error {
			var err error
			token, err = client.tokens.Token(ctx)
			return err
		})
		result.RetryCount += tokenRetries
		if tokenErr != nil {
			code := SafeCode(tokenErr)
			if code != "token_rejected" && code != "token_unavailable" {
				code = "token_unavailable"
			}
			return Round{}, ProviderError{Code: code, HTTPStatus: providerHTTPStatus(tokenErr), RetryCount: result.RetryCount}
		}
		var page deltaPage
		pageRetries, requestErr := client.retry.DoWithCount(ctx, func() error {
			var status int
			var retryAfter string
			var err error
			page, status, retryAfter, err = client.requestPage(ctx, current, token)
			if err != nil {
				return classifyProviderError(status, retryAfter, kind, err)
			}
			return nil
		})
		result.RetryCount += pageRetries
		if SafeCode(requestErr) == "token_rejected" && !refreshed {
			client.tokens.Invalidate()
			refreshed = true
			result.RetryCount++
			pageNumber--
			continue
		}
		if requestErr != nil {
			return Round{}, withRetryCount(requestErr, result.RetryCount)
		}
		result.PageCount++
		for _, raw := range page.Value {
			if raw.ID == "" || raw.MeetingID == "" || len(raw.ID) > 8192 || len(raw.MeetingID) > 8192 {
				return Round{}, ProviderError{Code: "provider_response_invalid", RetryCount: result.RetryCount}
			}
			created := ""
			if raw.CreatedDateTime != "" {
				if parsed, parseErr := time.Parse(time.RFC3339Nano, raw.CreatedDateTime); parseErr == nil {
					created = parsed.UTC().Format(time.RFC3339Nano)
				}
			}
			decodedBytes := int64(len(raw.ID) + len(raw.MeetingID) + len(created))
			if len(result.Artifacts) >= client.maxArtifacts || decodedBytes > client.maxArtifactBytes-artifactBytes {
				return Round{}, ProviderError{Code: "provider_response_invalid", RetryCount: result.RetryCount}
			}
			result.Artifacts = append(result.Artifacts, Artifact{ID: raw.ID, MeetingID: raw.MeetingID, CreatedAt: created})
			artifactBytes += decodedBytes
		}
		if (page.NextLink == "") == (page.DeltaLink == "") {
			return Round{}, ProviderError{Code: "provider_response_invalid", RetryCount: result.RetryCount}
		}
		if page.NextLink != "" {
			if err := ValidateDeltaURL(page.NextLink, organizerID, kind, false); err != nil {
				return Round{}, ProviderError{Code: "provider_response_invalid", RetryCount: result.RetryCount}
			}
			current = page.NextLink
			continue
		}
		if err := ValidateDeltaURL(page.DeltaLink, organizerID, kind, false); err != nil {
			return Round{}, ProviderError{Code: "provider_response_invalid", RetryCount: result.RetryCount}
		}
		result.DeltaLink = page.DeltaLink
		return result, nil
	}
	return Round{}, ProviderError{Code: "provider_response_invalid", RetryCount: result.RetryCount}
}

func withRetryCount(err error, retries int) error {
	var provider ProviderError
	if errors.As(err, &provider) {
		provider.RetryCount = retries
		return provider
	}
	return ProviderError{Code: SafeCode(err), RetryCount: retries}
}

func providerHTTPStatus(err error) int {
	var provider ProviderError
	if errors.As(err, &provider) {
		return provider.HTTPStatus
	}
	return 0
}

func validateStartURL(raw, organizerID string, kind ArtifactType) error {
	if err := ValidateDeltaURL(raw, organizerID, kind, false); err == nil {
		return nil
	}
	return ValidateDeltaURL(raw, organizerID, kind, true)
}

func (client *Client) requestPage(ctx context.Context, rawURL, token string) (deltaPage, int, string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return deltaPage{}, 0, "", errors.New("request invalid")
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/json")
	response, err := client.http.Do(request)
	if err != nil {
		return deltaPage{}, 0, "", errors.New("provider unavailable")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseBytes+1))
	if err != nil || int64(len(raw)) > MaxResponseBytes {
		return deltaPage{}, response.StatusCode, response.Header.Get("Retry-After"), errors.New("provider response invalid")
	}
	if response.StatusCode != http.StatusOK {
		return deltaPage{}, response.StatusCode, response.Header.Get("Retry-After"), providerResponseCode(raw)
	}
	var page deltaPage
	if json.Unmarshal(raw, &page) != nil || page.Value == nil {
		return deltaPage{}, response.StatusCode, "", errors.New("provider response invalid")
	}
	return page, response.StatusCode, "", nil
}

func providerResponseCode(raw []byte) error {
	var response struct {
		Error struct {
			Code       string `json:"code"`
			InnerError struct {
				Code string `json:"code"`
			} `json:"innerError"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &response)
	code := response.Error.InnerError.Code
	if code == "" {
		code = response.Error.Code
	}
	return errors.New(code)
}

func classifyProviderError(status int, retryAfter string, kind ArtifactType, cause error) error {
	switch {
	case status == http.StatusUnauthorized:
		return ProviderError{Code: "token_rejected", HTTPStatus: status}
	case status == http.StatusPaymentRequired:
		return ProviderError{Code: "payment_required", HTTPStatus: status}
	case status == http.StatusForbidden:
		code := strings.ToLower(cause.Error())
		if kind == Transcript && (strings.Contains(code, "transcript") || strings.Contains(code, "transcription")) {
			return ProviderError{Code: "transcripts_disabled", HTTPStatus: status}
		}
		return ProviderError{Code: "forbidden", HTTPStatus: status}
	case status == http.StatusTooManyRequests:
		return ProviderError{Code: "throttled", HTTPStatus: status, RetryAfter: retryAfter}
	case status >= 500 && status <= 599:
		return ProviderError{Code: "provider_unavailable", HTTPStatus: status}
	case status >= 400 && status <= 499:
		return ProviderError{Code: "provider_rejected", HTTPStatus: status}
	case status == 0:
		return ProviderError{Code: "provider_unavailable"}
	default:
		return ProviderError{Code: "provider_response_invalid", HTTPStatus: status}
	}
}
