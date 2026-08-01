package approval

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
)

const MaxRequestBytes = int64(4096)

var (
	referencePattern = regexp.MustCompile(`^MB-[A-Z2-7]{12}$`)
	digestPattern    = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

type Handler struct {
	store      *state.BriefStore
	bearer     string
	signingKey []byte
	actors     map[string]string
	now        func() time.Time
	mu         *sync.Mutex
}

func NewHandler(store *state.BriefStore, bearer, signingSecret, garyAddress, austinAddress string, now func() time.Time) (*Handler, error) {
	return NewHandlerWithMutex(store, bearer, signingSecret, garyAddress, austinAddress, now, &sync.Mutex{})
}

func NewHandlerWithMutex(store *state.BriefStore, bearer, signingSecret, garyAddress, austinAddress string, now func() time.Time, lifecycleMu *sync.Mutex) (*Handler, error) {
	if store == nil || lifecycleMu == nil || !validSecret(bearer) || !validSecret(signingSecret) {
		return nil, errors.New("approval_config_invalid")
	}
	actors := map[string]string{}
	for actor, address := range map[string]string{"gary": garyAddress, "austin": austinAddress} {
		normalized, err := normalizeAddress(address)
		if err != nil || normalized != address {
			return nil, errors.New("approval_config_invalid")
		}
		actors[ActorFingerprint([]byte(signingSecret), normalized)] = actor
	}
	if len(actors) != 2 {
		return nil, errors.New("approval_config_invalid")
	}
	if now == nil {
		now = time.Now
	}
	return &Handler{store: store, bearer: bearer, signingKey: []byte(signingSecret), actors: actors, now: now, mu: lifecycleMu}, nil
}

type RequestBody struct {
	SchemaVersion    string `json:"schemaVersion"`
	Reference        string `json:"reference"`
	Decision         string `json:"decision"`
	ActorFingerprint string `json:"actorFingerprint"`
	MessageDigest    string `json:"messageDigest"`
	ReceivedAt       string `json:"receivedAt"`
}

func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Content-Type", "application/json")
	if request.Method != http.MethodPost || request.URL.Path != "/v1/review-decisions" {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "Review endpoint not found.")
		return
	}
	if !constantString(request.Header.Get("Authorization"), "Bearer "+handler.bearer) {
		writeError(response, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication failed.")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(request.Body, MaxRequestBytes+1))
	if err != nil || len(raw) == 0 || int64(len(raw)) > MaxRequestBytes {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "Request body is invalid.")
		return
	}
	digest := sha256.Sum256(raw)
	idempotency := hex.EncodeToString(digest[:])
	if !constantString(request.Header.Get("Idempotency-Key"), idempotency) {
		writeError(response, http.StatusBadRequest, "IDEMPOTENCY_MISMATCH", "Idempotency key is invalid.")
		return
	}
	claimMAC := hmac.New(sha256.New, handler.signingKey)
	claimMAC.Write([]byte("meeting-review-claim/v1\x00"))
	claimMAC.Write(raw)
	if !constantString(request.Header.Get("X-Review-Claim-Signature"), hex.EncodeToString(claimMAC.Sum(nil))) {
		writeError(response, http.StatusUnauthorized, "CLAIM_INVALID", "Review claim is invalid.")
		return
	}
	var input RequestBody
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "Request body is invalid.")
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) || input.SchemaVersion != "meeting-review/v1" || !referencePattern.MatchString(input.Reference) ||
		(input.Decision != "approve" && input.Decision != "hold") || !digestPattern.MatchString(input.ActorFingerprint) || !digestPattern.MatchString(input.MessageDigest) {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "Request body is invalid.")
		return
	}
	actor := ""
	for fingerprint, candidate := range handler.actors {
		if constantString(input.ActorFingerprint, fingerprint) {
			actor = candidate
		}
	}
	if actor == "" {
		writeError(response, http.StatusUnauthorized, "SENDER_NOT_ALLOWED", "Sender is not authorized.")
		return
	}
	receivedAt, err := time.Parse(time.RFC3339Nano, input.ReceivedAt)
	if err != nil || !strings.HasSuffix(input.ReceivedAt, "Z") || receivedAt.UTC().Format(time.RFC3339Nano) != input.ReceivedAt {
		writeError(response, http.StatusUnprocessableEntity, "TIME_INVALID", "Received time is invalid.")
		return
	}

	handler.mu.Lock()
	defer handler.mu.Unlock()
	doc := handler.store.Document()
	key, record, found := findRecord(doc, input.Reference)
	if !found {
		writeError(response, http.StatusNotFound, "BRIEF_NOT_FOUND", "Meeting brief was not found.")
		return
	}
	if record.Email == nil || (record.ReviewStatus != "pending_review" && record.ReviewStatus != "approved" && record.ReviewStatus != "held") {
		writeError(response, http.StatusUnprocessableEntity, "LIFECYCLE_INVALID", "Meeting brief cannot be reviewed.")
		return
	}
	sentAt, _ := time.Parse(time.RFC3339Nano, record.Email.SentAt)
	now := handler.now().UTC()
	if receivedAt.Before(sentAt) || receivedAt.After(now.Add(5*time.Minute)) {
		writeError(response, http.StatusUnprocessableEntity, "TIME_INVALID", "Received time is outside the allowed boundary.")
		return
	}
	if record.Decision != nil {
		if record.Decision.MessageDigest == input.MessageDigest && record.Decision.Decision == input.Decision && record.Decision.ActorFingerprint == input.ActorFingerprint {
			writeResult(response, http.StatusOK, input.Reference, record.ReviewStatus)
			return
		}
		writeError(response, http.StatusConflict, "DECISION_CONFLICT", "A terminal decision already exists.")
		return
	}
	status := "approved"
	if input.Decision == "hold" {
		status = "held"
	}
	record.ReviewStatus = status
	record.Decision = &state.ReviewDecision{Decision: input.Decision, Actor: actor, ActorFingerprint: input.ActorFingerprint, MessageDigest: input.MessageDigest, ReceivedAt: receivedAt.UTC().Format(time.RFC3339Nano), AcceptedAt: now.Format(time.RFC3339Nano), IdempotencyKey: idempotency}
	record.UpdatedAt = now.Format(time.RFC3339Nano)
	doc.Records[key] = record
	if err := handler.store.Commit(doc); err != nil {
		writeError(response, http.StatusInternalServerError, "STATE_UNAVAILABLE", "Decision could not be stored.")
		return
	}
	writeResult(response, http.StatusCreated, input.Reference, status)
}

func findRecord(doc state.BriefDocument, reference string) (string, state.BriefRecord, bool) {
	for key, record := range doc.Records {
		if record.MeetingReference == reference {
			return key, record, true
		}
	}
	return "", state.BriefRecord{}, false
}

func ActorFingerprint(key []byte, normalized string) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte("meeting-review-actor/v1\x00"))
	mac.Write([]byte(normalized))
	return hex.EncodeToString(mac.Sum(nil))
}

func constantString(first, second string) bool {
	return len(first) == len(second) && subtle.ConstantTimeCompare([]byte(first), []byte(second)) == 1
}

func normalizeAddress(value string) (string, error) {
	if value == "" || strings.ContainsAny(value, "\r\n") || strings.Contains(value, "..") || strings.Count(value, "@") != 1 {
		return "", errors.New("invalid")
	}
	parsed, err := mail.ParseAddress(value)
	parts := strings.Split(value, "@")
	if err != nil || parsed.Address != value || strings.ToLower(value) != value || parts[0] == "" || parts[1] == "" {
		return "", errors.New("invalid")
	}
	return value, nil
}

func validSecret(value string) bool {
	return len(value) >= 32 && len(value) <= 4096 && !strings.ContainsAny(value, "\r\n")
}

func writeResult(response http.ResponseWriter, status int, reference, decisionStatus string) {
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]string{"schemaVersion": "meeting-review-result/v1", "reference": reference, "status": decisionStatus})
}

func writeError(response http.ResponseWriter, status int, code, message string) {
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]any{"error": map[string]string{"code": code, "message": message}})
}
