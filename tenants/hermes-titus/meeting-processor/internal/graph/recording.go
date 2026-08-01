package graph

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"
)

const MaxRecordingContentBytes int64 = 2 << 30

type RecordingVerification struct {
	SHA256      string
	Bytes       int64
	ContentType string
}

func RecordingContentURL(organizerID, meetingID, recordingID string) (string, error) {
	for _, value := range []string{organizerID, meetingID, recordingID} {
		if value == "" || len(value) > 8192 || !utf8.ValidString(value) || strings.IndexFunc(value, func(character rune) bool { return character < 0x20 || character == 0x7f }) >= 0 {
			return "", errors.New("recording route invalid")
		}
	}
	return "https://graph.microsoft.com/v1.0/users/" + url.PathEscape(organizerID) +
		"/onlineMeetings/" + url.PathEscape(meetingID) + "/recordings/" + url.PathEscape(recordingID) + "/content", nil
}

func (client *Client) VerifyRecordingContent(ctx context.Context, organizerID, meetingID, recordingID string, maximum int64) (RecordingVerification, error) {
	if maximum <= 0 || maximum > MaxRecordingContentBytes {
		return RecordingVerification{}, ProviderError{Code: "recording_content_invalid"}
	}
	rawURL, err := RecordingContentURL(organizerID, meetingID, recordingID)
	if err != nil {
		return RecordingVerification{}, ProviderError{Code: "recording_content_invalid"}
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
			return RecordingVerification{}, ProviderError{Code: SafeCode(tokenErr), HTTPStatus: providerHTTPStatus(tokenErr)}
		}
		var verification RecordingVerification
		var status int
		var retryAfter string
		_, requestErr := client.retry.DoWithCount(ctx, func() error {
			var err error
			verification, status, retryAfter, err = client.requestRecordingContent(ctx, rawURL, token, maximum)
			if err != nil {
				return classifyRecordingContentError(status, retryAfter, err)
			}
			return nil
		})
		if status == http.StatusUnauthorized && !refreshed {
			client.tokens.Invalidate()
			refreshed = true
			continue
		}
		if requestErr != nil {
			return RecordingVerification{}, requestErr
		}
		return verification, nil
	}
}

func (client *Client) requestRecordingContent(ctx context.Context, rawURL, token string, maximum int64) (RecordingVerification, int, string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return RecordingVerification{}, 0, "", errors.New("request invalid")
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "video/mp4")
	response, err := client.http.Do(request)
	if err != nil {
		return RecordingVerification{}, 0, "", errors.New("provider unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, MaxResponseBytes))
		return RecordingVerification{}, response.StatusCode, response.Header.Get("Retry-After"), errors.New("provider rejected")
	}
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil || !strings.EqualFold(mediaType, "video/mp4") || response.ContentLength == 0 || response.ContentLength > maximum {
		return RecordingVerification{}, response.StatusCode, "", errors.New("content invalid")
	}
	hasher := sha256.New()
	written, err := io.Copy(hasher, io.LimitReader(response.Body, maximum+1))
	if err != nil || written == 0 || written > maximum || (response.ContentLength > 0 && written != response.ContentLength) {
		return RecordingVerification{}, response.StatusCode, "", errors.New("content invalid")
	}
	return RecordingVerification{SHA256: hex.EncodeToString(hasher.Sum(nil)), Bytes: written, ContentType: "video/mp4"}, response.StatusCode, "", nil
}

func classifyRecordingContentError(status int, retryAfter string, cause error) error {
	if status == http.StatusOK {
		return ProviderError{Code: "recording_content_invalid", HTTPStatus: status}
	}
	return classifyProviderError(status, retryAfter, Recording, cause)
}
