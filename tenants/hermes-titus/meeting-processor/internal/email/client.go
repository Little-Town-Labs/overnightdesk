package email

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	SecurityOrigin   = "http://overnightdesk-securityteam:4700"
	AgentMailOrigin  = "https://api.agentmail.to/v0"
	MaxBodyBytes     = 32_768
	MaxResponseBytes = int64(1_000_000)
	TemplateVersion  = "meeting-brief-email/v1"
	providerFooter   = "\n\n--\nSent via AgentMail"
)

var (
	briefReference    = regexp.MustCompile(`^MB-[A-Z2-7]{12}$`)
	digestPattern     = regexp.MustCompile(`^[0-9a-f]{64}$`)
	providerIDPattern = regexp.MustCompile(`^[A-Za-z0-9._:@+<>-]{1,512}$`)
	credentialPattern = regexp.MustCompile(`(?i)(authorization\s*:\s*bearer|graph\.microsoft\.com|/v1\.0/users/|(?:SECRET|TOKEN|API[_-]?KEY|PASSWORD)\s*[:=])`)
)

type safeError struct{ code string }

func (err safeError) Error() string    { return err.code }
func (err safeError) SafeCode() string { return err.code }

func SafeCode(err error) string {
	var coded interface{ SafeCode() string }
	if errors.As(err, &coded) {
		return coded.SafeCode()
	}
	return "meeting_email_unavailable"
}

type Client struct {
	securityToken string
	agentMailKey  string
	inboxID       string
	recipients    [2]string
	http          *http.Client
	now           func() time.Time
}

func NewClient(securityOrigin, securityToken, agentMailOrigin, agentMailKey, inboxID string, recipients [2]string, source *http.Client) (*Client, error) {
	if securityOrigin != SecurityOrigin || agentMailOrigin != AgentMailOrigin || !validSecret(securityToken) || !validSecret(agentMailKey) ||
		!validProviderID(inboxID) || source == nil {
		return nil, safeError{code: "meeting_email_config_invalid"}
	}
	for index, recipient := range recipients {
		normalized, err := normalizeAddress(recipient)
		if err != nil || normalized != recipient {
			return nil, safeError{code: "meeting_email_config_invalid"}
		}
		recipients[index] = normalized
	}
	if recipients[0] == recipients[1] {
		return nil, safeError{code: "meeting_email_config_invalid"}
	}
	sort.Strings(recipients[:])
	clone := *source
	clone.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{securityToken: securityToken, agentMailKey: agentMailKey, inboxID: inboxID, recipients: recipients, http: &clone, now: time.Now}, nil
}

type Delivery struct {
	IdempotencyKey          string `json:"idempotency_key"`
	ProviderMessageIDDigest string `json:"provider_message_id_digest"`
	RecipientSet            string `json:"recipient_set"`
	TemplateVersion         string `json:"template_version"`
	SentAt                  string `json:"sent_at"`
	ReadbackVerifiedAt      string `json:"readback_verified_at"`
}

type draft struct {
	To          []string `json:"to"`
	CC          []string `json:"cc"`
	BCC         []string `json:"bcc"`
	Subject     string   `json:"subject"`
	Text        string   `json:"text"`
	HTML        *string  `json:"html"`
	Attachments []string `json:"attachments"`
}

func (client *Client) Send(ctx context.Context, reference, briefDigest, rendered string) (Delivery, error) {
	if !briefReference.MatchString(reference) || !digestPattern.MatchString(briefDigest) || rendered == "" || len(rendered) > MaxBodyBytes ||
		!utf8.ValidString(rendered) || strings.ContainsRune(rendered, 0) || credentialPattern.MatchString(rendered) {
		return Delivery{}, safeError{code: "meeting_email_rejected"}
	}
	subject := "Titus Meeting Brief " + reference
	text := rendered + "\n\nReview command (reply with exactly one):\nAPPROVE " + reference + "\nHOLD " + reference + "\n"
	message := draft{To: append([]string(nil), client.recipients[:]...), CC: []string{}, BCC: []string{}, Subject: subject, Text: text, HTML: nil, Attachments: []string{}}
	if err := client.screen(ctx, message); err != nil {
		return Delivery{}, err
	}
	idempotencyDigest := sha256.Sum256([]byte(TemplateVersion + "\x00" + briefDigest))
	idempotency := hex.EncodeToString(idempotencyDigest[:])
	payload, _ := json.Marshal(message)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, AgentMailOrigin+"/inboxes/"+url.PathEscape(client.inboxID)+"/messages/send", bytes.NewReader(payload))
	if err != nil {
		return Delivery{}, safeError{code: "meeting_email_request_invalid"}
	}
	request.Header.Set("Authorization", "Bearer "+client.agentMailKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Idempotency-Key", idempotency)
	response, err := client.http.Do(request)
	if err != nil {
		return Delivery{}, safeError{code: "meeting_email_provider_ambiguous"}
	}
	var receipt struct {
		MessageID string `json:"message_id"`
		ThreadID  string `json:"thread_id"`
	}
	if err := decodeResponse(response, &receipt); err != nil {
		return Delivery{}, err
	}
	if !providerIDPattern.MatchString(receipt.MessageID) || (receipt.ThreadID != "" && !providerIDPattern.MatchString(receipt.ThreadID)) {
		return Delivery{}, safeError{code: "meeting_email_provider_invalid"}
	}
	if err := client.verifyReadback(ctx, receipt.MessageID, message); err != nil {
		return Delivery{}, err
	}
	now := client.now().UTC().Format(time.RFC3339Nano)
	messageDigest := sha256.Sum256([]byte(receipt.MessageID))
	return Delivery{IdempotencyKey: idempotency, ProviderMessageIDDigest: hex.EncodeToString(messageDigest[:]), RecipientSet: "gary+austin", TemplateVersion: TemplateVersion, SentAt: now, ReadbackVerifiedAt: now}, nil
}

func (client *Client) screen(ctx context.Context, message draft) error {
	type screened struct {
		V           int      `json:"v"`
		Subject     string   `json:"subject"`
		Text        string   `json:"text"`
		HTML        *string  `json:"html"`
		Attachments []string `json:"attachments"`
	}
	contentRaw, _ := json.Marshal(screened{V: 1, Subject: message.Subject, Text: message.Text, HTML: nil, Attachments: []string{}})
	payload, _ := json.Marshal(struct {
		Kind     string `json:"kind"`
		Content  string `json:"content"`
		Channel  string `json:"channel"`
		TargetID string `json:"targetId"`
	}{Kind: "send_email", Content: string(contentRaw), Channel: "dm", TargetID: strings.Join(message.To, ",")})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, SecurityOrigin+"/check-outbound", bytes.NewReader(payload))
	if err != nil {
		return safeError{code: "meeting_email_request_invalid"}
	}
	request.Header.Set("Authorization", "Bearer "+client.securityToken)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.http.Do(request)
	if err != nil {
		return safeError{code: "meeting_email_security_unavailable"}
	}
	var result struct {
		Allowed bool   `json:"allowed"`
		Content string `json:"content"`
	}
	if err := decodeResponse(response, &result); err != nil || !result.Allowed || subtle.ConstantTimeCompare([]byte(result.Content), contentRaw) != 1 {
		return safeError{code: "meeting_email_security_denied"}
	}
	return nil
}

func (client *Client) verifyReadback(ctx context.Context, messageID string, expected draft) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, AgentMailOrigin+"/inboxes/"+url.PathEscape(client.inboxID)+"/messages/"+url.PathEscape(messageID), nil)
	if err != nil {
		return safeError{code: "meeting_email_request_invalid"}
	}
	request.Header.Set("Authorization", "Bearer "+client.agentMailKey)
	request.Header.Set("Accept", "application/json")
	response, err := client.http.Do(request)
	if err != nil {
		return safeError{code: "meeting_email_readback_unavailable"}
	}
	var got draft
	if err := decodeResponseStrict(response, &got); err != nil || got.Subject != expected.Subject || (got.Text != expected.Text && got.Text != expected.Text+providerFooter) || len(got.To) != 2 || len(got.CC) != 0 || len(got.BCC) != 0 || len(got.Attachments) != 0 {
		return safeError{code: "meeting_email_readback_mismatch"}
	}
	sort.Strings(got.To)
	for index := range got.To {
		normalized, err := normalizeAddress(got.To[index])
		if err != nil || normalized != expected.To[index] {
			return safeError{code: "meeting_email_readback_mismatch"}
		}
	}
	return nil
}

func decodeResponse(response *http.Response, target any) error {
	if response == nil || response.Body == nil {
		return safeError{code: "meeting_email_provider_invalid"}
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseBytes+1))
	if err != nil || int64(len(raw)) > MaxResponseBytes {
		return safeError{code: "meeting_email_provider_invalid"}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return safeError{code: "meeting_email_provider_rejected"}
	}
	if json.Unmarshal(raw, target) != nil {
		return safeError{code: "meeting_email_provider_invalid"}
	}
	return nil
}

func decodeResponseStrict(response *http.Response, target any) error {
	if response == nil || response.Body == nil {
		return safeError{code: "meeting_email_provider_invalid"}
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseBytes+1))
	if err != nil || int64(len(raw)) > MaxResponseBytes || response.StatusCode < 200 || response.StatusCode >= 300 {
		return safeError{code: "meeting_email_provider_invalid"}
	}
	// AgentMail's readback object is provider-owned and includes additional
	// metadata fields beyond the delivery contract. Decode the fields we verify,
	// while still rejecting malformed or trailing JSON.
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if decoder.Decode(target) != nil {
		return safeError{code: "meeting_email_provider_invalid"}
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return safeError{code: "meeting_email_provider_invalid"}
	}
	return nil
}

func normalizeAddress(value string) (string, error) {
	if value == "" || strings.ContainsAny(value, "\r\n") || strings.Contains(value, "..") {
		return "", errors.New("invalid")
	}
	parsed, err := mail.ParseAddress(value)
	if err != nil || parsed.Address != value || strings.Count(value, "@") != 1 {
		return "", errors.New("invalid")
	}
	parts := strings.Split(value, "@")
	if parts[0] == "" || parts[1] == "" || strings.ToLower(value) != value {
		return "", errors.New("invalid")
	}
	return value, nil
}

func validSecret(value string) bool {
	return len(value) >= 32 && len(value) <= 4096 && !strings.ContainsAny(value, "\r\n")
}
func validProviderID(value string) bool { return providerIDPattern.MatchString(value) }
