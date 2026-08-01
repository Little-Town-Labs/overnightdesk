package approval

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestParseCommandAcceptsOnlyExactAndFlagsHostileReviewLikeText(t *testing.T) {
	command, reviewLike, ok := ParseCommand("\r\nAPPROVE MB-ABCDEFGHIJKL\t")
	if !ok || !reviewLike || command.Decision != "approve" || command.Normalized != "APPROVE MB-ABCDEFGHIJKL" {
		t.Fatalf("command=%#v flags=%t/%t", command, reviewLike, ok)
	}
	for _, value := range []string{"Please APPROVE MB-ABCDEFGHIJKL", "> APPROVE MB-ABCDEFGHIJKL", "HOLD MB-ABCDEFGHIJKL thanks", "approve MB-ABCDEFGHIJKL"} {
		if _, reviewLike, ok := ParseCommand(value); ok || !reviewLike {
			t.Fatalf("hostile command classification failed: %q", value)
		}
	}
	if _, reviewLike, ok := ParseCommand("normal email"); ok || reviewLike {
		t.Fatal("ordinary mail intercepted")
	}
}

func TestSubmitBindsExactSenderMessageAndBody(t *testing.T) {
	secret := strings.Repeat("s", 32)
	httpClient := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		raw, _ := io.ReadAll(request.Body)
		digest := sha256.Sum256(raw)
		if request.Header.Get("Idempotency-Key") != hex.EncodeToString(digest[:]) {
			t.Fatal("idempotency not bound to exact body")
		}
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte("meeting-review-claim/v1\x00"))
		mac.Write(raw)
		if request.Header.Get("X-Review-Claim-Signature") != hex.EncodeToString(mac.Sum(nil)) {
			t.Fatal("claim signature mismatch")
		}
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		if _, exists := body["actor"]; exists {
			t.Fatal("caller selected actor")
		}
		if _, exists := body["sender"]; exists {
			t.Fatal("sender leaked into request")
		}
		return &http.Response{StatusCode: http.StatusCreated, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"schemaVersion":"meeting-review-result/v1","reference":"MB-ABCDEFGHIJKL","status":"approved"}`))}, nil
	})}
	client, err := NewClient(ServiceOrigin, strings.Repeat("b", 32), secret, httpClient)
	if err != nil {
		t.Fatal(err)
	}
	command, _, _ := ParseCommand("APPROVE MB-ABCDEFGHIJKL")
	result, err := client.Submit(context.Background(), command, "gary@example.com", "provider-message-1", time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC))
	if err != nil || result.Status != "approved" {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}
