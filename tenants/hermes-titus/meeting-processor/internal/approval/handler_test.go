package approval

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
)

const testReference = "MB-ABCDEFGHIJKL"

func testHandler(t *testing.T) (*Handler, *state.BriefStore) {
	t.Helper()
	store, err := state.OpenBrief(filepath.Join(t.TempDir(), "briefs.json"))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 8, 1, 13, 0, 0, 0, time.UTC)
	doc := store.Document()
	doc.Records[strings.Repeat("a", 64)] = state.BriefRecord{
		InternalReference: strings.Repeat("a", 64), MigrationStatus: "complete", LegacyAnalysisDigest: strings.Repeat("b", 64),
		MeetingReference: testReference, ReviewStatus: "pending_review",
		Email:     &state.EmailDelivery{IdempotencyKey: strings.Repeat("c", 64), ProviderMessageIDDigest: strings.Repeat("d", 64), RecipientSet: "gary+austin", TemplateVersion: "v1", SentAt: "2026-08-01T12:00:00Z", ReadbackVerifiedAt: "2026-08-01T12:00:00Z"},
		CreatedAt: "2026-08-01T12:00:00Z", UpdatedAt: "2026-08-01T12:00:00Z",
	}
	if err := store.Commit(doc); err != nil {
		t.Fatal(err)
	}
	handler, err := NewHandler(store, strings.Repeat("t", 32), strings.Repeat("s", 32), "gary@example.com", "austin@example.com", func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	return handler, store
}

func signedRequest(t *testing.T, decision, sender string) *http.Request {
	t.Helper()
	key := []byte(strings.Repeat("s", 32))
	body, _ := json.Marshal(RequestBody{SchemaVersion: "meeting-review/v1", Reference: testReference, Decision: decision, ActorFingerprint: ActorFingerprint(key, sender), MessageDigest: strings.Repeat("e", 64), ReceivedAt: "2026-08-01T12:30:00Z"})
	request := httptest.NewRequest(http.MethodPost, "/v1/review-decisions", bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+strings.Repeat("t", 32))
	digest := sha256.Sum256(body)
	request.Header.Set("Idempotency-Key", hex.EncodeToString(digest[:]))
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte("meeting-review-claim/v1\x00"))
	mac.Write(body)
	request.Header.Set("X-Review-Claim-Signature", hex.EncodeToString(mac.Sum(nil)))
	return request
}

func TestDecisionDerivesActorAndFirstTerminalWinsIdempotently(t *testing.T) {
	handler, store := testHandler(t)
	defer store.Close()
	first := httptest.NewRecorder()
	handler.ServeHTTP(first, signedRequest(t, "approve", "gary@example.com"))
	if first.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", first.Code, first.Body.String())
	}
	replay := httptest.NewRecorder()
	handler.ServeHTTP(replay, signedRequest(t, "approve", "gary@example.com"))
	if replay.Code != http.StatusOK {
		t.Fatalf("replay=%d", replay.Code)
	}
	conflict := httptest.NewRecorder()
	handler.ServeHTTP(conflict, signedRequest(t, "hold", "austin@example.com"))
	if conflict.Code != http.StatusConflict {
		t.Fatalf("conflict=%d", conflict.Code)
	}
	record := store.Document().Records[strings.Repeat("a", 64)]
	if record.ReviewStatus != "approved" || record.Decision.Actor != "gary" {
		t.Fatalf("record=%#v", record)
	}
}

func TestDecisionRejectsSignatureSenderAndBodyMismatch(t *testing.T) {
	handler, store := testHandler(t)
	defer store.Close()
	fixtures := []*http.Request{signedRequest(t, "approve", "mallory@example.com"), signedRequest(t, "approve", "gary@example.com"), signedRequest(t, "approve", "gary@example.com")}
	fixtures[1].Header.Set("X-Review-Claim-Signature", strings.Repeat("0", 64))
	fixtures[2].Header.Set("Idempotency-Key", strings.Repeat("0", 64))
	for _, request := range fixtures {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code < 400 {
			t.Fatalf("accepted invalid request: %d %s", response.Code, response.Body.String())
		}
	}
}

func TestConcurrentFirstTerminalDecisionWins(t *testing.T) {
	handler, store := testHandler(t)
	defer store.Close()
	var wait sync.WaitGroup
	statuses := make(chan int, 2)
	for _, fixture := range []struct{ decision, sender string }{{"approve", "gary@example.com"}, {"hold", "austin@example.com"}} {
		wait.Add(1)
		go func(decision, sender string) {
			defer wait.Done()
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, signedRequest(t, decision, sender))
			statuses <- response.Code
		}(fixture.decision, fixture.sender)
	}
	wait.Wait()
	close(statuses)
	created, conflicts := 0, 0
	for status := range statuses {
		if status == http.StatusCreated {
			created++
		}
		if status == http.StatusConflict {
			conflicts++
		}
	}
	if created != 1 || conflicts != 1 {
		t.Fatalf("created=%d conflicts=%d", created, conflicts)
	}
}

func TestDecisionWaitsForSharedLifecycleMutationLock(t *testing.T) {
	handler, store := testHandler(t)
	defer store.Close()
	handler.mu.Lock()
	done := make(chan int, 1)
	go func() {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, signedRequest(t, "approve", "gary@example.com"))
		done <- response.Code
	}()
	select {
	case <-done:
		t.Fatal("decision bypassed lifecycle lock")
	case <-time.After(25 * time.Millisecond):
	}
	handler.mu.Unlock()
	select {
	case code := <-done:
		if code != http.StatusCreated {
			t.Fatalf("status=%d", code)
		}
	case <-time.After(time.Second):
		t.Fatal("decision did not resume")
	}
}
