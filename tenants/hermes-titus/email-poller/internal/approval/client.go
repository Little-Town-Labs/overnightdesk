package approval

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"overnightdesk/titus-email-poller/internal/policy"
)

const (
	ServiceOrigin    = "http://titus-meeting-processor:8080"
	MaxResponseBytes = int64(8192)
)

var commandPattern = regexp.MustCompile(`^(APPROVE|HOLD) (MB-[A-Z2-7]{12})$`)
var reviewLikePattern = regexp.MustCompile(`(?i)\b(APPROVE|HOLD)\b|\bMB-[A-Z2-7]{4,}\b`)

type Command struct {
	Decision   string
	Reference  string
	Normalized string
}

func ParseCommand(value string) (Command, bool, bool) {
	trimmed := strings.Trim(value, " \t\r\n")
	match := commandPattern.FindStringSubmatch(trimmed)
	if len(match) == 3 {
		return Command{Decision: strings.ToLower(match[1]), Reference: match[2], Normalized: match[1] + " " + match[2]}, true, true
	}
	return Command{}, reviewLikePattern.MatchString(value), false
}

type Client struct {
	bearer     string
	signingKey []byte
	http       *http.Client
}

func NewClient(origin, bearer, signingSecret string, source *http.Client) (*Client, error) {
	if origin != ServiceOrigin || !validSecret(bearer) || !validSecret(signingSecret) || source == nil {
		return nil, errors.New("meeting_review_config_invalid")
	}
	clone := *source
	clone.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{bearer: bearer, signingKey: []byte(signingSecret), http: &clone}, nil
}

type Result struct {
	SchemaVersion string `json:"schemaVersion"`
	Reference     string `json:"reference"`
	Status        string `json:"status"`
}

type reviewBody struct {
	SchemaVersion    string `json:"schemaVersion"`
	Reference        string `json:"reference"`
	Decision         string `json:"decision"`
	ActorFingerprint string `json:"actorFingerprint"`
	MessageDigest    string `json:"messageDigest"`
	ReceivedAt       string `json:"receivedAt"`
}

type Claim struct {
	Reference        string
	Decision         string
	ActorFingerprint string
	MessageDigest    string
	ReceivedAt       string
}

func (client *Client) Submit(ctx context.Context, command Command, sender, providerMessageID string, receivedAt time.Time) (Result, error) {
	claim, err := client.Prepare(command, sender, providerMessageID, receivedAt)
	if err != nil {
		return Result{}, err
	}
	return client.SubmitClaim(ctx, claim)
}

func (client *Client) Prepare(command Command, sender, providerMessageID string, receivedAt time.Time) (Claim, error) {
	normalizedSender, ok := policy.NormalizeAddress(sender)
	if !ok || normalizedSender != sender || providerMessageID == "" || len(providerMessageID) > 512 || command.Normalized == "" || !commandPattern.MatchString(command.Normalized) || receivedAt.IsZero() {
		return Claim{}, errors.New("meeting_review_request_invalid")
	}
	actorMAC := hmac.New(sha256.New, client.signingKey)
	actorMAC.Write([]byte("meeting-review-actor/v1\x00"))
	actorMAC.Write([]byte(normalizedSender))
	messageDigest := sha256.Sum256([]byte("meeting-review-message/v1\x00" + providerMessageID + "\x00" + command.Normalized))
	return Claim{Reference: command.Reference, Decision: command.Decision, ActorFingerprint: hex.EncodeToString(actorMAC.Sum(nil)), MessageDigest: hex.EncodeToString(messageDigest[:]), ReceivedAt: receivedAt.UTC().Format(time.RFC3339Nano)}, nil
}

func (client *Client) SubmitClaim(ctx context.Context, claim Claim) (Result, error) {
	if !regexp.MustCompile(`^MB-[A-Z2-7]{12}$`).MatchString(claim.Reference) || (claim.Decision != "approve" && claim.Decision != "hold") || !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(claim.ActorFingerprint) || !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(claim.MessageDigest) {
		return Result{}, errors.New("meeting_review_request_invalid")
	}
	received, err := time.Parse(time.RFC3339Nano, claim.ReceivedAt)
	if err != nil || received.UTC().Format(time.RFC3339Nano) != claim.ReceivedAt {
		return Result{}, errors.New("meeting_review_request_invalid")
	}
	body, err := json.Marshal(reviewBody{SchemaVersion: "meeting-review/v1", Reference: claim.Reference, Decision: claim.Decision, ActorFingerprint: claim.ActorFingerprint, MessageDigest: claim.MessageDigest, ReceivedAt: claim.ReceivedAt})
	if err != nil {
		return Result{}, errors.New("meeting_review_request_invalid")
	}
	idempotency := sha256.Sum256(body)
	claimMAC := hmac.New(sha256.New, client.signingKey)
	claimMAC.Write([]byte("meeting-review-claim/v1\x00"))
	claimMAC.Write(body)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, ServiceOrigin+"/v1/review-decisions", bytes.NewReader(body))
	if err != nil {
		return Result{}, errors.New("meeting_review_request_invalid")
	}
	request.Header.Set("Authorization", "Bearer "+client.bearer)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Idempotency-Key", hex.EncodeToString(idempotency[:]))
	request.Header.Set("X-Review-Claim-Signature", hex.EncodeToString(claimMAC.Sum(nil)))
	response, err := client.http.Do(request)
	if err != nil {
		return Result{}, errors.New("meeting_review_unavailable")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseBytes+1))
	if err != nil || int64(len(raw)) > MaxResponseBytes {
		return Result{}, errors.New("meeting_review_response_invalid")
	}
	if response.StatusCode == http.StatusConflict {
		return Result{}, errors.New("meeting_review_conflict")
	}
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusCreated {
		return Result{}, errors.New("meeting_review_rejected")
	}
	var result Result
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&result) != nil || result.SchemaVersion != "meeting-review-result/v1" || result.Reference != claim.Reference || (result.Status != "approved" && result.Status != "held") {
		return Result{}, errors.New("meeting_review_response_invalid")
	}
	return result, nil
}

func validSecret(value string) bool {
	return len(value) >= 32 && len(value) <= 4096 && !strings.ContainsAny(value, "\r\n")
}
