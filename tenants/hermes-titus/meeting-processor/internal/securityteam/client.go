package securityteam

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	ServiceOrigin    = "http://overnightdesk-securityteam:4700"
	MaxResponseBytes = int64(1_250_000)
	MaxRequestBytes  = 1_000_000
)

var digestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

type safeError struct{ code string }

func (err safeError) Error() string    { return err.code }
func (err safeError) SafeCode() string { return err.code }

func SafeCode(err error) string {
	var coded interface{ SafeCode() string }
	if errors.As(err, &coded) {
		return coded.SafeCode()
	}
	var safe safeError
	if errors.As(err, &safe) {
		return safe.code
	}
	return "securityteam_unavailable"
}

type Client struct {
	token string
	http  *http.Client
}

func NewClient(origin, token string, source *http.Client) (*Client, error) {
	if origin != ServiceOrigin || len(token) < 32 || len(token) > 4096 || strings.ContainsAny(token, "\r\n") || source == nil {
		return nil, safeError{code: "securityteam_config_invalid"}
	}
	clone := *source
	clone.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{token: token, http: &clone}, nil
}

type scanRequest struct {
	Source       string            `json:"source"`
	ContentType  string            `json:"contentType"`
	Body         string            `json:"body"`
	Subject      string            `json:"subject"`
	MessageID    string            `json:"messageId"`
	Metadata     map[string]string `json:"metadata"`
	ApprovalMode string            `json:"approvalMode"`
}

type scanResponse struct {
	Status          string `json:"status"`
	Content         string `json:"content"`
	QueueID         string `json:"queueId"`
	RejectionReason string `json:"rejectionReason"`
	Metadata        struct {
		RedactionCount     int      `json:"redactionCount"`
		InjectionSignals   []string `json:"injectionSignals"`
		ProcessingMS       int64    `json:"processingMs"`
		Source             string   `json:"source"`
		ScannerScore       *int     `json:"scannerScore"`
		QuarantineDecision string   `json:"quarantineDecision"`
		UnicodeStats       *struct {
			CharactersStripped int `json:"charactersStripped"`
			HomoglyphsDetected int `json:"homoglyphsDetected"`
		} `json:"unicodeStats"`
		EncodingsDetected int  `json:"encodingsDetected"`
		HTMLSanitized     bool `json:"htmlSanitized"`
	} `json:"metadata"`
}

func (client *Client) Scan(ctx context.Context, raw []byte, reference, organizerSlot string) (string, error) {
	if len(raw) == 0 || len(raw) > MaxRequestBytes || !utf8.Valid(raw) || !digestPattern.MatchString(reference) || (organizerSlot != "organizer_1" && organizerSlot != "organizer_2") {
		return "", safeError{code: "securityteam_request_invalid"}
	}
	payload, err := json.Marshal(scanRequest{
		Source: "api", ContentType: "text", Body: string(raw),
		Subject: "Titus meeting transcript " + reference, MessageID: reference,
		Metadata:     map[string]string{"provider": "microsoft_graph", "artifact_type": "transcript", "organizer_slot": organizerSlot},
		ApprovalMode: "block",
	})
	if err != nil || len(payload) > 1_048_576 {
		return "", safeError{code: "securityteam_request_invalid"}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, ServiceOrigin+"/scan-inbound", bytes.NewReader(payload))
	if err != nil {
		return "", safeError{code: "securityteam_request_invalid"}
	}
	request.Header.Set("Authorization", "Bearer "+client.token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	response, err := client.http.Do(request)
	if err != nil {
		return "", safeError{code: "securityteam_unavailable"}
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseBytes+1))
	if err != nil || int64(len(body)) > MaxResponseBytes {
		return "", safeError{code: "securityteam_response_invalid"}
	}
	if response.StatusCode != http.StatusOK {
		return "", safeError{code: "securityteam_unavailable"}
	}
	var decoded scanResponse
	if json.Unmarshal(body, &decoded) != nil {
		return "", safeError{code: "securityteam_response_invalid"}
	}
	if decoded.Status == "blocked" || decoded.Status == "pending_approval" || decoded.QueueID != "" {
		return "", safeError{code: "securityteam_blocked"}
	}
	if decoded.Status != "safe" || decoded.Content == "" || decoded.RejectionReason != "" || len(decoded.Content) > MaxRequestBytes || !utf8.ValidString(decoded.Content) || decoded.Metadata.Source != "api" || decoded.Metadata.QuarantineDecision != "allow" {
		return "", safeError{code: "securityteam_response_invalid"}
	}
	return decoded.Content, nil
}
