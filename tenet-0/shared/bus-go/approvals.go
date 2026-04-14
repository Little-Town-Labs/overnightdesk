package bus

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// Approvals returns the approvals helper for this Bus. Per-action and blanket
// authorization helpers are President-only — non-President credentials get
// ErrNamespaceViolation back from the underlying Publish.
func (b *Bus) Approvals() *Approvals {
	return &Approvals{bus: b}
}

// Approvals wraps the publish_event SP for the three President approval
// event types. Non-President callers may still use these for completeness
// (testing, simulating), but the bus enforces namespace authorization.
type Approvals struct {
	bus *Bus
}

// GrantPerAction publishes a `president.approved` event scoped to a single
// target event. Returns the approval event ID, which the requesting
// department uses with bus.WithApproval(...) on its actual publish.
//
// expiresIn is the validity window from now. If zero, the SP applies its
// default (10 minutes) — pass an explicit duration to override.
func (a *Approvals) GrantPerAction(ctx context.Context, targetEventID, scope string, expiresIn time.Duration, reason string) (string, error) {
	payload := map[string]any{
		"approves_event_id": targetEventID,
		"scope":             scope,
		"reason":            reason,
	}
	if expiresIn > 0 {
		payload["expires_at"] = time.Now().Add(expiresIn).UTC().Format(time.RFC3339)
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("approvals: marshal: %w", err)
	}
	return a.bus.Publish(ctx, "president.approved", body)
}

// GrantBlanket publishes a `president.authorization.granted` event covering
// every future event in the named category. Pass a zero expiresAt for an
// indefinite (revoke-only) authorization.
//
// constraints is category-specific (e.g., {"max_amount_cents": 10000} for
// `routine.finance.small_refund`). May be nil.
func (a *Approvals) GrantBlanket(ctx context.Context, category string, constraints map[string]any, expiresAt time.Time, reason string) (string, error) {
	payload := map[string]any{
		"category": category,
		"reason":   reason,
	}
	if !expiresAt.IsZero() {
		payload["expires_at"] = expiresAt.UTC().Format(time.RFC3339)
	}
	if constraints != nil {
		payload["constraints"] = constraints
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("approvals: marshal: %w", err)
	}
	return a.bus.Publish(ctx, "president.authorization.granted", body)
}

// Revoke publishes a `president.authorization.revoked` event for a category.
// All currently active blanket authorizations matching the category are
// marked revoked atomically by the SP.
//
// approvalEventID is recorded in the payload for audit traceability — it does
// not need to be the original grant's ID; pass any human-meaningful reference.
func (a *Approvals) Revoke(ctx context.Context, approvalEventID, reason string) error {
	// Look up the category from the approvals_active row to make Revoke
	// callable with just the original approval event ID.
	var category *string
	err := a.bus.pool.QueryRow(ctx,
		`SELECT category FROM approvals_active
		  WHERE approval_event_id = $1 AND kind = 'blanket' LIMIT 1`,
		approvalEventID,
	).Scan(&category)
	if err != nil {
		return fmt.Errorf("approvals: lookup category: %w", err)
	}
	if category == nil {
		return fmt.Errorf("approvals: blanket approval %s has no category", approvalEventID)
	}

	payload, err := json.Marshal(map[string]any{
		"category":             *category,
		"revoked_approval_id":  approvalEventID,
		"reason":               reason,
	})
	if err != nil {
		return fmt.Errorf("approvals: marshal: %w", err)
	}
	_, err = a.bus.Publish(ctx, "president.authorization.revoked", payload)
	return err
}
