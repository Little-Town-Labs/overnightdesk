package worker

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type countingRunner struct {
	mu        sync.Mutex
	calls     int
	active    int
	maxActive int
	failFirst bool
	called    chan struct{}
}

func (runner *countingRunner) RunOnce(context.Context) (CycleResult, error) {
	runner.mu.Lock()
	runner.calls++
	runner.active++
	if runner.active > runner.maxActive {
		runner.maxActive = runner.active
	}
	call := runner.calls
	runner.mu.Unlock()
	select {
	case runner.called <- struct{}{}:
	default:
	}
	time.Sleep(3 * time.Millisecond)
	runner.mu.Lock()
	runner.active--
	runner.mu.Unlock()
	if runner.failFirst && call == 1 {
		return CycleResult{}, ErrCycleFailed
	}
	return CycleResult{Streams: 4}, nil
}

func TestRunLoopStartsImmediatelyContinuesAfterDegradedCycleAndDoesNotOverlap(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	runner := &countingRunner{failFirst: true, called: make(chan struct{}, 4)}
	done := make(chan error, 1)
	go func() { done <- RunLoop(ctx, runner, 5*time.Millisecond) }()
	for range 2 {
		select {
		case <-runner.called:
		case <-time.After(time.Second):
			t.Fatal("loop did not run immediately and continue")
		}
	}
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("loop cancellation = %v", err)
	}
	runner.mu.Lock()
	defer runner.mu.Unlock()
	if runner.calls < 2 || runner.maxActive != 1 {
		t.Fatalf("calls=%d max_active=%d", runner.calls, runner.maxActive)
	}
}

func TestRunLoopRejectsInvalidInterval(t *testing.T) {
	if err := RunLoop(context.Background(), &countingRunner{called: make(chan struct{}, 1)}, 0); err == nil {
		t.Fatal("expected invalid interval")
	}
}
