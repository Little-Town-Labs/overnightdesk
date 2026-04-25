package operatorch

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func samplePayload() OperatorPayload {
	return OperatorPayload{
		DirectorID:  "president",
		Reason:      "approval-needed",
		Severity:    "high",
		Body:        "please review",
		GeneratedAt: time.Date(2026, 4, 19, 0, 0, 0, 0, time.UTC),
	}
}

func TestNew_FactorySelectsCommModule(t *testing.T) {
	n, err := New(Config{
		Mode:            ModeCommModule,
		CommModuleURL:   "http://comm.local",
		CommModuleToken: "tok",
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, ok := n.(*CommModuleNotifier); !ok {
		t.Errorf("expected *CommModuleNotifier, got %T", n)
	}
}

func TestNew_FactorySelectsPolling(t *testing.T) {
	n, err := New(Config{
		Mode:     ModePolling,
		Inserter: func(ctx context.Context, p OperatorPayload) error { return nil },
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, ok := n.(*PollingShim); !ok {
		t.Errorf("expected *PollingShim, got %T", n)
	}
}

func TestNew_RejectsUnknownMode(t *testing.T) {
	if _, err := New(Config{Mode: "bogus"}); err == nil {
		t.Fatal("New must reject unknown Mode")
	}
}

func TestNew_CommModuleRequiresURL(t *testing.T) {
	if _, err := New(Config{Mode: ModeCommModule, CommModuleToken: "t"}); err == nil {
		t.Fatal("New must reject empty CommModuleURL in comm-module mode")
	}
}

func TestNew_PollingRequiresInserter(t *testing.T) {
	if _, err := New(Config{Mode: ModePolling}); err == nil {
		t.Fatal("New must reject nil Inserter in polling mode")
	}
}

func TestCommModuleNotifier_Success(t *testing.T) {
	var sawAuth string
	var sawPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawAuth = r.Header.Get("Authorization")
		sawPath = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), "approval-needed") {
			t.Errorf("body missing reason: %s", body)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	n, err := New(Config{
		Mode:            ModeCommModule,
		CommModuleURL:   srv.URL,
		CommModuleToken: "tok-abc",
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	if err := n.Notify(context.Background(), samplePayload()); err != nil {
		t.Fatalf("Notify: %v", err)
	}
	if sawAuth != "Bearer tok-abc" {
		t.Errorf("Authorization header = %q, want Bearer tok-abc", sawAuth)
	}
	if !strings.HasSuffix(sawPath, "/v1/inject/zero") {
		t.Errorf("path = %q, want suffix /v1/inject/zero", sawPath)
	}
}

func TestCommModuleNotifier_AuthErrorOn401(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	n, _ := New(Config{Mode: ModeCommModule, CommModuleURL: srv.URL, CommModuleToken: "t"})
	err := n.Notify(context.Background(), samplePayload())
	if err == nil {
		t.Fatal("expected error on 401")
	}
	var ae *AuthError
	if !errors.As(err, &ae) {
		t.Errorf("error = %v, want *AuthError", err)
	}
}

func TestCommModuleNotifier_RetryableOn5xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	n, _ := New(Config{Mode: ModeCommModule, CommModuleURL: srv.URL, CommModuleToken: "t"})
	err := n.Notify(context.Background(), samplePayload())
	if err == nil {
		t.Fatal("expected error on 502")
	}
	var re *RetryableError
	if !errors.As(err, &re) {
		t.Errorf("error = %v, want *RetryableError", err)
	}
}

func TestCommModuleNotifier_RetryableOnNetworkError(t *testing.T) {
	// Point at a closed port to force a dial failure.
	n, _ := New(Config{
		Mode:            ModeCommModule,
		CommModuleURL:   "http://127.0.0.1:1", // reserved port; refused
		CommModuleToken: "t",
		HTTPRequestTimeout: 200 * time.Millisecond,
	})
	err := n.Notify(context.Background(), samplePayload())
	if err == nil {
		t.Fatal("expected dial error")
	}
	var re *RetryableError
	if !errors.As(err, &re) {
		t.Errorf("network failure should map to *RetryableError; got %v", err)
	}
}

func TestPollingShim_InsertSuccess(t *testing.T) {
	var calls int32
	var captured OperatorPayload
	n, err := New(Config{
		Mode: ModePolling,
		Inserter: func(ctx context.Context, p OperatorPayload) error {
			atomic.AddInt32(&calls, 1)
			captured = p
			return nil
		},
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	in := samplePayload()
	if err := n.Notify(context.Background(), in); err != nil {
		t.Fatalf("Notify: %v", err)
	}
	if atomic.LoadInt32(&calls) != 1 {
		t.Errorf("Inserter called %d times, want 1", calls)
	}
	if captured.DirectorID != in.DirectorID {
		t.Errorf("captured.DirectorID = %q", captured.DirectorID)
	}
}

func TestPollingShim_PropagatesInserterError(t *testing.T) {
	want := errors.New("disk full")
	n, _ := New(Config{
		Mode:     ModePolling,
		Inserter: func(ctx context.Context, p OperatorPayload) error { return want },
	})
	err := n.Notify(context.Background(), samplePayload())
	if !errors.Is(err, want) {
		t.Errorf("error = %v, want wrap of %v", err, want)
	}
}
