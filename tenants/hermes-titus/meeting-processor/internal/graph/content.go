package graph

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"
)

const MaxTranscriptContentBytes int64 = 1_000_000

func TranscriptContentURL(organizerID, meetingID, transcriptID string) (string, error) {
	for _, value := range []string{organizerID, meetingID, transcriptID} {
		if value == "" || len(value) > 8192 || !utf8.ValidString(value) || strings.IndexFunc(value, func(character rune) bool { return character < 0x20 || character == 0x7f }) >= 0 {
			return "", errors.New("transcript route invalid")
		}
	}
	return "https://graph.microsoft.com/v1.0/users/" + url.PathEscape(organizerID) +
		"/onlineMeetings/" + url.PathEscape(meetingID) + "/transcripts/" + url.PathEscape(transcriptID) + "/content", nil
}

func (client *Client) FetchTranscriptContent(ctx context.Context, organizerID, meetingID, transcriptID string) ([]byte, error) {
	rawURL, err := TranscriptContentURL(organizerID, meetingID, transcriptID)
	if err != nil {
		return nil, ProviderError{Code: "transcript_content_invalid"}
	}
	refreshed := false
	for {
		var token string
		_, tokenErr := client.retry.DoWithCount(ctx, func() error {
			var err error
			token, err = client.tokens.Token(ctx)
			return err
		})
		if tokenErr != nil {
			return nil, ProviderError{Code: SafeCode(tokenErr), HTTPStatus: providerHTTPStatus(tokenErr)}
		}
		var content []byte
		var status int
		var retryAfter string
		_, requestErr := client.retry.DoWithCount(ctx, func() error {
			var err error
			content, status, retryAfter, err = client.requestTranscriptContent(ctx, rawURL, token)
			if err != nil {
				return classifyTranscriptContentError(status, retryAfter, err)
			}
			return nil
		})
		if status == http.StatusUnauthorized && !refreshed {
			client.tokens.Invalidate()
			refreshed = true
			continue
		}
		if requestErr != nil {
			return nil, requestErr
		}
		return content, nil
	}
}

func (client *Client) requestTranscriptContent(ctx context.Context, rawURL, token string) ([]byte, int, string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, "", errors.New("request invalid")
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "text/vtt")
	response, err := client.http.Do(request)
	if err != nil {
		return nil, 0, "", errors.New("provider unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, MaxResponseBytes))
		return nil, response.StatusCode, response.Header.Get("Retry-After"), errors.New("provider rejected")
	}
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil || !strings.EqualFold(mediaType, "text/vtt") {
		return nil, response.StatusCode, "", errors.New("content type invalid")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, MaxTranscriptContentBytes+1))
	if err != nil || len(raw) == 0 || int64(len(raw)) > MaxTranscriptContentBytes || !utf8.Valid(raw) || bytes.IndexByte(raw, 0) >= 0 || !bytes.HasPrefix(raw, []byte("WEBVTT")) {
		return nil, response.StatusCode, "", errors.New("content invalid")
	}
	return raw, response.StatusCode, "", nil
}

func classifyTranscriptContentError(status int, retryAfter string, cause error) error {
	if status == http.StatusOK {
		return ProviderError{Code: "transcript_content_invalid", HTTPStatus: status}
	}
	return classifyProviderError(status, retryAfter, Transcript, cause)
}
