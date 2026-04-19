package buslisten

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// fakeConn implements ListenConn. Each call to WaitForNotification pops
// from notifications; once exhausted it returns the configured error
// (typically a synthetic disconnect to drive the reconnect path).
type fakeConn struct {
	mu            sync.Mutex
	notifications []string
	exhaustedErr  error
	channel       string
	closed        atomic.Bool
	execCalls     []string
}

func (f *fakeConn) Exec(ctx context.Context, sql string, args ...any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.execCalls = append(f.execCalls, sql)
	return nil
}

func (f *fakeConn) WaitForNotification(ctx context.Context) (string, string, error) {
	f.mu.Lock()
	if len(f.notifications) == 0 {
		err := f.exhaustedErr
		f.mu.Unlock()
		if err != nil {
			return "", "", err
		}
		<-ctx.Done()
		return "", "", ctx.Err()
	}
	p := f.notifications[0]
	f.notifications = f.notifications[1:]
	ch := f.channel
	f.mu.Unlock()
	return ch, p, nil
}

func (f *fakeConn) Close(ctx context.Context) error {
	f.closed.Store(true)
	return nil
}

// fakeAcquirer hands out conns in order; each call gets the next one. If
// it runs out, returns an error.
type fakeAcquirer struct {
	mu    sync.Mutex
	conns []*fakeConn
	calls int
}

func (a *fakeAcquirer) Acquire(ctx context.Context) (ListenConn, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.calls++
	if len(a.conns) == 0 {
		return nil, errors.New("no more conns")
	}
	c := a.conns[0]
	a.conns = a.conns[1:]
	return c, nil
}

func TestNew_RejectsEmptyChannel(t *testing.T) {
	_, err := New(Config{
		DSN:     "postgres://x/y",
		Channel: "",
		Logger:  discardLogger(),
	})
	if err == nil {
		t.Fatal("New with empty Channel must fail")
	}
}

func TestSubscribe_DispatchesNotifications(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	conn := &fakeConn{
		channel:       "event_bus",
		notifications: []string{"payload-1", "payload-2"},
		exhaustedErr:  context.Canceled, // signals clean stop
	}
	acq := &fakeAcquirer{conns: []*fakeConn{conn}}

	l, err := New(Config{
		DSN:      "postgres://x/y",
		Channel:  "event_bus",
		Logger:   discardLogger(),
		acquirer: acq,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	var got []string
	var mu sync.Mutex
	done := make(chan error, 1)

	go func() {
		done <- l.Subscribe(ctx, func(payload string) error {
			mu.Lock()
			got = append(got, payload)
			if len(got) == 2 {
				cancel()
			}
			mu.Unlock()
			return nil
		})
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("Subscribe did not return within 3s")
	}

	mu.Lock()
	defer mu.Unlock()
	if len(got) != 2 || got[0] != "payload-1" || got[1] != "payload-2" {
		t.Errorf("notifications received = %v", got)
	}
	// Should have issued a LISTEN at least once.
	conn.mu.Lock()
	defer conn.mu.Unlock()
	listenSeen := false
	for _, s := range conn.execCalls {
		if strings.Contains(strings.ToUpper(s), "LISTEN") {
			listenSeen = true
		}
	}
	if !listenSeen {
		t.Errorf("expected a LISTEN exec; got %v", conn.execCalls)
	}
}

func TestSubscribe_ReconnectsAfterDrop(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	first := &fakeConn{
		channel:      "event_bus",
		exhaustedErr: errors.New("connection reset"),
	}
	second := &fakeConn{
		channel:       "event_bus",
		notifications: []string{"after-reconnect"},
		exhaustedErr:  context.Canceled,
	}
	acq := &fakeAcquirer{conns: []*fakeConn{first, second}}

	l, err := New(Config{
		DSN:            "postgres://x/y",
		Channel:        "event_bus",
		Logger:         discardLogger(),
		InitialBackoff: 10 * time.Millisecond,
		MaxBackoff:     20 * time.Millisecond,
		acquirer:       acq,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	var got []string
	var mu sync.Mutex

	done := make(chan error, 1)
	go func() {
		done <- l.Subscribe(ctx, func(payload string) error {
			mu.Lock()
			got = append(got, payload)
			cancel()
			mu.Unlock()
			return nil
		})
	}()

	select {
	case <-done:
	case <-time.After(4 * time.Second):
		t.Fatal("Subscribe did not return")
	}

	mu.Lock()
	defer mu.Unlock()
	if len(got) != 1 || got[0] != "after-reconnect" {
		t.Errorf("expected reconnect-then-deliver; got %v (acq calls=%d)", got, acq.calls)
	}
	if acq.calls < 2 {
		t.Errorf("expected >=2 Acquire calls (drop+reconnect); got %d", acq.calls)
	}
}

func TestSubscribe_ContextCancelExitsCleanly(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	conn := &fakeConn{channel: "event_bus", exhaustedErr: context.Canceled}
	acq := &fakeAcquirer{conns: []*fakeConn{conn}}

	l, err := New(Config{
		DSN:      "postgres://x/y",
		Channel:  "event_bus",
		Logger:   discardLogger(),
		acquirer: acq,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		done <- l.Subscribe(ctx, func(string) error { return nil })
	}()

	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		// Clean shutdown: nil OR context.Canceled both acceptable.
		if err != nil && !errors.Is(err, context.Canceled) {
			t.Errorf("Subscribe returned non-cancel error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Subscribe did not honor context cancel")
	}
}

func TestNextBackoff_CapsAt30s(t *testing.T) {
	cfg := Config{InitialBackoff: time.Second, MaxBackoff: 30 * time.Second}
	cases := []struct {
		attempt int
		want    time.Duration
	}{
		{1, 1 * time.Second},
		{2, 2 * time.Second},
		{3, 4 * time.Second},
		{4, 8 * time.Second},
		{5, 16 * time.Second},
		{6, 30 * time.Second},  // capped
		{20, 30 * time.Second}, // still capped
	}
	for _, tc := range cases {
		got := nextBackoff(cfg, tc.attempt)
		if got != tc.want {
			t.Errorf("nextBackoff(attempt=%d) = %v, want %v", tc.attempt, got, tc.want)
		}
	}
}
