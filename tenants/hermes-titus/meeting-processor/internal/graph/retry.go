package graph

import (
	"context"
	"errors"
	"strconv"
	"time"
)

type RetryPolicy struct {
	MaxAttempts int
	BaseDelay   time.Duration
	MaxDelay    time.Duration
	Sleep       func(context.Context, time.Duration) error
}

func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{MaxAttempts: 3, BaseDelay: time.Second, MaxDelay: 60 * time.Second, Sleep: sleepContext}
}

func (policy RetryPolicy) Do(ctx context.Context, operation func() error) error {
	_, err := policy.DoWithCount(ctx, operation)
	return err
}

func (policy RetryPolicy) DoWithCount(ctx context.Context, operation func() error) (int, error) {
	if policy.MaxAttempts <= 0 {
		policy.MaxAttempts = 3
	}
	if policy.BaseDelay <= 0 {
		policy.BaseDelay = time.Second
	}
	if policy.MaxDelay <= 0 {
		policy.MaxDelay = 60 * time.Second
	}
	if policy.Sleep == nil {
		policy.Sleep = sleepContext
	}
	var last error
	for attempt := 1; attempt <= policy.MaxAttempts; attempt++ {
		last = operation()
		if last == nil || !retryable(last) || attempt == policy.MaxAttempts {
			return attempt - 1, last
		}
		delay := policy.BaseDelay << (attempt - 1)
		if delay > policy.MaxDelay {
			delay = policy.MaxDelay
		}
		var provider ProviderError
		if errors.As(last, &provider) && provider.Code == "throttled" {
			delay = retryAfter(provider.RetryAfter, delay, policy.MaxDelay)
		}
		if err := policy.Sleep(ctx, delay); err != nil {
			return attempt - 1, ProviderError{Code: "provider_unavailable"}
		}
	}
	return policy.MaxAttempts - 1, last
}

func retryable(err error) bool {
	code := SafeCode(err)
	return code == "throttled" || code == "provider_unavailable" || code == "token_unavailable"
}

func retryAfter(value string, fallback, maximum time.Duration) time.Duration {
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds < 0 {
		return fallback
	}
	delay := time.Duration(seconds) * time.Second
	if delay > maximum {
		return maximum
	}
	return delay
}

func sleepContext(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
