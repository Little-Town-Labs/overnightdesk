package worker

import (
	"context"
	"errors"
	"time"
)

type CycleRunner interface {
	RunOnce(context.Context) (CycleResult, error)
}

func RunLoop(ctx context.Context, runner CycleRunner, interval time.Duration) error {
	if runner == nil || interval <= 0 {
		return errors.New("polling loop configuration invalid")
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		_, _ = runner.RunOnce(ctx)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
