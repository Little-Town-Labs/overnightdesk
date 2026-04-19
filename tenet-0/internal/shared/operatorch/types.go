// Package operatorch routes "operator needed" notifications either to the
// comm-module HTTP endpoint (POST /v1/inject/zero, RES-2) or, when comm-
// module is unavailable, to the `notify_queue` Postgres table for later
// pickup. The factory selects between the two based on Config.Mode.
package operatorch

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Mode selects which OperatorNotifier the factory returns.
type Mode string

const (
	ModeCommModule Mode = "comm-module"
	ModePolling    Mode = "polling"
)

// OperatorPayload is the body POSTed to /v1/inject/zero or stored in the
// polling queue.
type OperatorPayload struct {
	DirectorID     string         `json:"director_id"`
	Reason         string         `json:"reason"`
	Severity       string         `json:"severity"`
	Body           string         `json:"body"`
	Metadata       map[string]any `json:"metadata,omitempty"`
	IdempotencyKey string         `json:"idempotency_key,omitempty"`
	GeneratedAt    time.Time      `json:"generated_at"`
}

// OperatorNotifier is the boundary the daemons use.
type OperatorNotifier interface {
	Notify(ctx context.Context, payload OperatorPayload) error
}

// Config drives the factory.
type Config struct {
	Mode Mode

	// Comm-module-mode fields
	CommModuleURL      string
	CommModuleToken    string
	HTTPClient         *http.Client // optional; defaults to a 10s-timeout client
	HTTPRequestTimeout time.Duration

	// Polling-mode fields.
	Inserter PollingInserter
}

// PollingInserter writes one row to notify_queue. Test seam.
type PollingInserter func(ctx context.Context, payload OperatorPayload) error

// New constructs an OperatorNotifier of the requested mode.
func New(cfg Config) (OperatorNotifier, error) {
	switch cfg.Mode {
	case ModeCommModule:
		if cfg.CommModuleURL == "" {
			return nil, errors.New("operatorch.New: CommModuleURL required in comm-module mode")
		}
		client := cfg.HTTPClient
		if client == nil {
			timeout := cfg.HTTPRequestTimeout
			if timeout <= 0 {
				timeout = 10 * time.Second
			}
			client = &http.Client{Timeout: timeout}
		}
		return &CommModuleNotifier{
			url:    strings.TrimRight(cfg.CommModuleURL, "/") + "/v1/inject/zero",
			token:  cfg.CommModuleToken,
			client: client,
		}, nil
	case ModePolling:
		if cfg.Inserter == nil {
			return nil, errors.New("operatorch.New: Inserter required in polling mode")
		}
		return &PollingShim{insert: cfg.Inserter}, nil
	default:
		return nil, fmt.Errorf("operatorch.New: unknown Mode %q", cfg.Mode)
	}
}

// CommModuleNotifier POSTs payloads to comm-module.
type CommModuleNotifier struct {
	url    string
	token  string
	client *http.Client
}

// Notify implements OperatorNotifier.
func (n *CommModuleNotifier) Notify(ctx context.Context, payload OperatorPayload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("operatorch: marshal payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, n.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("operatorch: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if n.token != "" {
		req.Header.Set("Authorization", "Bearer "+n.token)
	}
	resp, err := n.client.Do(req)
	if err != nil {
		// Network/dial failures are retryable.
		return &RetryableError{Status: 0, Inner: err}
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return nil
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return &AuthError{Status: resp.StatusCode}
	case resp.StatusCode >= 500:
		return &RetryableError{Status: resp.StatusCode, Inner: fmt.Errorf("status %d", resp.StatusCode)}
	default:
		return fmt.Errorf("operatorch: comm-module returned status %d", resp.StatusCode)
	}
}

// PollingShim writes payloads to notify_queue when comm-module is offline.
type PollingShim struct {
	insert PollingInserter
}

// Notify implements OperatorNotifier.
func (p *PollingShim) Notify(ctx context.Context, payload OperatorPayload) error {
	if err := p.insert(ctx, payload); err != nil {
		return fmt.Errorf("operatorch: polling insert: %w", err)
	}
	return nil
}

// AuthError indicates the comm-module rejected our bearer (HTTP 401/403).
// Non-retryable.
type AuthError struct{ Status int }

func (e *AuthError) Error() string {
	return fmt.Sprintf("operatorch: comm-module rejected credentials (HTTP %d)", e.Status)
}

// RetryableError wraps a 5xx (or transient) failure.
type RetryableError struct {
	Status int
	Inner  error
}

func (e *RetryableError) Error() string {
	if e.Inner != nil {
		return fmt.Sprintf("operatorch: retryable failure (status=%d): %v", e.Status, e.Inner)
	}
	return fmt.Sprintf("operatorch: retryable failure (status=%d)", e.Status)
}

func (e *RetryableError) Unwrap() error { return e.Inner }
