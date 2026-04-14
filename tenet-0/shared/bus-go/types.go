// Package bus is the Tenet-0 client library for publishing, subscribing,
// and recording token usage against the Tenet-0 PostgreSQL event bus.
//
// See .specify/specs/49-event-bus-constitution-governor/contracts/sdk-api.md
// for the complete API contract.
package bus

import (
	"context"
	"time"
)

// Config describes how to connect to a Tenet-0 bus instance.
type Config struct {
	// PostgresURL is a libpq connection string. The library connects as the
	// tenet0_app role; the bus stored procedures authenticate per call via
	// Credential.
	PostgresURL string

	// Department is the department identifier this process represents (e.g.,
	// "ops", "fin", "president"). It must match Credential's namespace.
	Department string

	// Credential is the bearer token for Department. Verified server-side
	// against departments.credential_hash (bcrypt).
	Credential string
}

// Event represents a single published event delivered to a subscriber.
type Event struct {
	// ID is the server-assigned UUID.
	ID string

	// Type is the event type, namespaced "<department>.<subject>.<verb>".
	Type string

	// Source is the publishing department.
	Source string

	// Payload is the decoded JSON payload.
	Payload []byte

	// ParentID is the causality parent event, or "" when there is none.
	ParentID string

	// PublishedAt is the server-assigned publish timestamp.
	PublishedAt time.Time
}

// PublishOption configures a single Publish call.
type PublishOption func(*publishOptions)

type publishOptions struct {
	parentEventID   string
	approvalEventID string
}

// WithParent sets the causality parent.
func WithParent(eventID string) PublishOption {
	return func(o *publishOptions) { o.parentEventID = eventID }
}

// WithApproval attaches a prior per-action approval. The approval is consumed
// at publish time and cannot be reused.
func WithApproval(approvalEventID string) PublishOption {
	return func(o *publishOptions) { o.approvalEventID = approvalEventID }
}

// SubscriptionHandler processes a delivered event. Returning a non-nil error
// re-queues the event with exponential backoff. Handlers must be idempotent
// because delivery is at-least-once.
type SubscriptionHandler func(ctx context.Context, event Event) error

// BudgetStatus is the result of check_budget().
type BudgetStatus struct {
	Status         string // "ok", "warning", "blocked", "unauthenticated"
	LimitCents     int
	SpentCents     int
	RemainingCents int
}
