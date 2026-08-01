package graph

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestRetryPolicyUsesRetryAfterAndExponentialBounds(t *testing.T) {
	delays := []time.Duration{}
	policy := RetryPolicy{MaxAttempts: 3, BaseDelay: time.Second, MaxDelay: 60 * time.Second, Sleep: func(_ context.Context, delay time.Duration) error {
		delays = append(delays, delay)
		return nil
	}}
	attempts := 0
	err := policy.Do(context.Background(), func() error {
		attempts++
		if attempts == 1 {
			return ProviderError{Code: "throttled", HTTPStatus: 429, RetryAfter: "120"}
		}
		if attempts == 2 {
			return ProviderError{Code: "provider_unavailable", HTTPStatus: 503}
		}
		return nil
	})
	if err != nil || attempts != 3 || !reflect.DeepEqual(delays, []time.Duration{60 * time.Second, 2 * time.Second}) {
		t.Fatalf("attempts=%d delays=%v err=%v", attempts, delays, err)
	}
}

func TestRetryPolicyExhaustsAtThreeAttempts(t *testing.T) {
	policy := RetryPolicy{MaxAttempts: 3, BaseDelay: time.Millisecond, MaxDelay: time.Second, Sleep: func(context.Context, time.Duration) error { return nil }}
	attempts := 0
	err := policy.Do(context.Background(), func() error {
		attempts++
		return ProviderError{Code: "provider_unavailable", HTTPStatus: 500}
	})
	if attempts != 3 || SafeCode(err) != "provider_unavailable" {
		t.Fatalf("attempts=%d err=%v", attempts, err)
	}
}

func TestRetryPolicyFailsClosedForNonRetryableClasses(t *testing.T) {
	for _, code := range []string{"payment_required", "forbidden", "transcripts_disabled", "provider_rejected", "provider_response_invalid", "state_invalid", "token_rejected"} {
		attempts := 0
		policy := RetryPolicy{MaxAttempts: 3, BaseDelay: time.Millisecond, MaxDelay: time.Second, Sleep: func(context.Context, time.Duration) error { return errors.New("must not sleep") }}
		err := policy.Do(context.Background(), func() error {
			attempts++
			return ProviderError{Code: code}
		})
		if attempts != 1 || SafeCode(err) != code {
			t.Fatalf("code=%s attempts=%d err=%v", code, attempts, err)
		}
	}
}

func TestParseRetryAfterRejectsUnsafeValues(t *testing.T) {
	for _, value := range []string{"", "-1", "abc", "1.5"} {
		if got := retryAfter(value, 2*time.Second, 60*time.Second); got != 2*time.Second {
			t.Fatalf("value=%q got=%s", value, got)
		}
	}
}
