package buslisten

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestNew_DefaultsApplied(t *testing.T) {
	l, err := New(Config{
		DSN:      "postgres://x/y",
		Channel:  "ch",
		acquirer: &fakeAcquirer{},
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if l.cfg.InitialBackoff <= 0 || l.cfg.MaxBackoff <= 0 {
		t.Errorf("defaults not applied: %+v", l.cfg)
	}
	if l.cfg.Logger == nil {
		t.Error("Logger default not applied")
	}
}

func TestNew_RequiresAcquirer(t *testing.T) {
	_, err := New(Config{Channel: "ch"})
	if err == nil {
		t.Fatal("expected error when Acquirer missing")
	}
}

func TestNew_AcceptsExportedAcquirer(t *testing.T) {
	_, err := New(Config{Channel: "ch", Acquirer: &fakeAcquirer{}})
	if err != nil {
		t.Fatalf("expected success when Acquirer set, got %v", err)
	}
}

func TestSubscribe_AcquireFailsThenSucceeds(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	good := &fakeConn{
		channel:       "ch",
		notifications: []string{"n1"},
		exhaustedErr:  context.Canceled,
	}
	// First Acquire returns error; second returns good conn. The test
	// fakeAcquirer returns "no more conns" when empty, so we add one
	// trash-conn-less call by giving it an explicit failing acquirer.
	acq := &orderedAcquirer{steps: []orderedStep{
		{err: errors.New("dial refused")},
		{conn: good},
	}}

	l, err := New(Config{
		Channel:        "ch",
		Logger:         discardLogger(),
		InitialBackoff: 5 * time.Millisecond,
		MaxBackoff:     10 * time.Millisecond,
		acquirer:       acq,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	gotCh := make(chan string, 1)
	done := make(chan error, 1)
	go func() {
		done <- l.Subscribe(ctx, func(p string) error {
			gotCh <- p
			cancel()
			return nil
		})
	}()
	select {
	case got := <-gotCh:
		if got != "n1" {
			t.Errorf("got %q", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("never received notification after acquire retry")
	}
	<-done
}

func TestClose_StopsSubscribeLoop(t *testing.T) {
	conn := &fakeConn{channel: "ch", exhaustedErr: context.Canceled}
	acq := &fakeAcquirer{conns: []*fakeConn{conn}}
	l, err := New(Config{
		Channel:  "ch",
		Logger:   discardLogger(),
		acquirer: acq,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	done := make(chan error, 1)
	go func() {
		done <- l.Subscribe(context.Background(), func(string) error { return nil })
	}()
	time.Sleep(30 * time.Millisecond)
	if err := l.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Close did not stop Subscribe")
	}
}

func TestSleepCtx_ZeroDuration(t *testing.T) {
	ok := sleepCtx(context.Background(), 0)
	if !ok {
		t.Error("sleepCtx(0) should return true when ctx alive")
	}
}

func TestNextBackoff_ZeroDefaults(t *testing.T) {
	// Zero config -> defaults applied inside nextBackoff.
	got := nextBackoff(Config{}, 1)
	if got != time.Second {
		t.Errorf("default initial = %v, want 1s", got)
	}
	if got := nextBackoff(Config{}, 0); got != time.Second {
		t.Errorf("attempt<1 normalised: got %v", got)
	}
}

// orderedAcquirer cycles a list of (conn|err) results.
type orderedStep struct {
	conn ListenConn
	err  error
}
type orderedAcquirer struct {
	steps []orderedStep
	calls int
}

func (o *orderedAcquirer) Acquire(ctx context.Context) (ListenConn, error) {
	if o.calls >= len(o.steps) {
		return nil, errors.New("no more steps")
	}
	s := o.steps[o.calls]
	o.calls++
	return s.conn, s.err
}
