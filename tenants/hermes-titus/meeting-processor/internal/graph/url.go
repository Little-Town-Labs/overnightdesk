package graph

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	MaxResponseBytes      int64 = 4 << 20
	MaxRoundArtifactBytes int64 = 8 << 20
	MaxRoundArtifacts           = 2500
	MaxPages                    = 100
)

type ArtifactType string

const (
	Transcript ArtifactType = "transcript"
	Recording  ArtifactType = "recording"
)

func (kind ArtifactType) functionName() (string, error) {
	switch kind {
	case Transcript:
		return "getAllTranscripts", nil
	case Recording:
		return "getAllRecordings", nil
	default:
		return "", errors.New("artifact type invalid")
	}
}

func InitialDeltaURL(organizerID string, kind ArtifactType, start time.Time) (string, error) {
	function, err := kind.functionName()
	if err != nil {
		return "", err
	}
	if organizerID == "" || strings.ContainsAny(organizerID, "/?'(),") {
		return "", errors.New("organizer boundary invalid")
	}
	raw := fmt.Sprintf(
		"https://graph.microsoft.com/v1.0/users/%s/onlineMeetings/%s(meetingOrganizerUserId='%s',startDateTime=%s)/delta",
		organizerID,
		function,
		organizerID,
		start.UTC().Format(time.RFC3339),
	)
	if err := ValidateDeltaURL(raw, organizerID, kind, true); err != nil {
		return "", err
	}
	return raw, nil
}

func ValidateDeltaURL(raw, organizerID string, kind ArtifactType, initial bool) error {
	function, err := kind.functionName()
	if err != nil {
		return err
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host != "graph.microsoft.com" || parsed.User != nil || parsed.Fragment != "" {
		return errors.New("provider URL boundary invalid")
	}
	prefix := fmt.Sprintf("/v1.0/users/%s/onlineMeetings/%s(meetingOrganizerUserId='%s'", organizerID, function, organizerID)
	if !strings.HasPrefix(parsed.Path, prefix) || !strings.HasSuffix(parsed.Path, ")/delta") {
		return errors.New("provider URL route invalid")
	}
	middle := strings.TrimSuffix(strings.TrimPrefix(parsed.Path, prefix), ")/delta")
	if initial {
		if !strings.HasPrefix(middle, ",startDateTime=") {
			return errors.New("initial provider URL lookback invalid")
		}
		if _, err := time.Parse(time.RFC3339, strings.TrimPrefix(middle, ",startDateTime=")); err != nil {
			return errors.New("initial provider URL lookback invalid")
		}
		if parsed.RawQuery != "" {
			return errors.New("initial provider URL query invalid")
		}
		return nil
	}
	if middle != "" && !validLookback(middle) {
		return errors.New("continuation provider URL route invalid")
	}
	query, err := url.ParseQuery(parsed.RawQuery)
	if err != nil || len(query) != 1 {
		return errors.New("continuation provider URL query invalid")
	}
	for key, values := range query {
		if !validContinuationKey(key) {
			return errors.New("continuation provider URL query invalid")
		}
		if len(values) != 1 || values[0] == "" || len(values[0]) > 16384 {
			return errors.New("continuation provider URL token invalid")
		}
	}
	return nil
}

func validContinuationKey(key string) bool {
	switch key {
	case "$skipToken", "$skiptoken", "$deltaToken", "$deltatoken",
		"skipToken", "skiptoken", "deltaToken", "deltatoken":
		return true
	default:
		return false
	}
}

func validLookback(value string) bool {
	if !strings.HasPrefix(value, ",startDateTime=") {
		return false
	}
	_, err := time.Parse(time.RFC3339, strings.TrimPrefix(value, ",startDateTime="))
	return err == nil
}

func NewHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("provider redirect rejected")
		},
	}
}
