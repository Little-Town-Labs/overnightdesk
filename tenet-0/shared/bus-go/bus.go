package bus

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Bus is a connected Tenet-0 client. Zero value is not usable — call Connect.
type Bus struct {
	config Config
	pool   *pgxpool.Pool
	logger *slog.Logger

	mu sync.Mutex
	// closed guards Close() idempotency and prevents Subscribe-after-Close.
	closed bool
	subs   []*Subscription
}

// Connect opens a pool against config.PostgresURL and verifies the credential
// via a cheap check_budget() call. Returns ErrUnauthenticated for bad creds.
func Connect(ctx context.Context, config Config) (*Bus, error) {
	pool, err := pgxpool.New(ctx, config.PostgresURL)
	if err != nil {
		return nil, fmt.Errorf("bus: connect pool: %w", err)
	}

	var status string
	var limit, spent, remaining int
	err = pool.QueryRow(ctx,
		`SELECT status, limit_cents, spent_cents, remaining_cents FROM check_budget($1)`,
		config.Credential,
	).Scan(&status, &limit, &spent, &remaining)
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("bus: credential check: %w", err)
	}
	if status == budgetStatusUnauthenticated {
		pool.Close()
		return nil, ErrUnauthenticated
	}

	return &Bus{
		config: config,
		pool:   pool,
		logger: slog.Default().With("bus.department", config.Department),
	}, nil
}

// Close shuts down all subscriptions and closes the underlying pool.
// Subsequent Subscribe calls return ErrConnectionLost. Idempotent.
func (b *Bus) Close() {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return
	}
	b.closed = true
	subs := b.subs
	b.subs = nil
	b.mu.Unlock()

	for _, s := range subs {
		s.Close()
	}
	b.pool.Close()
}

// Publish writes an event via the publish_event stored procedure. On
// constitutional or authorization rejection returns a typed error.
func (b *Bus) Publish(ctx context.Context, eventType string, payload json.RawMessage, opts ...PublishOption) (string, error) {
	var o publishOptions
	for _, opt := range opts {
		opt(&o)
	}

	var parentArg, approvalArg any
	if o.parentEventID != "" {
		parentArg = o.parentEventID
	}
	if o.approvalEventID != "" {
		approvalArg = o.approvalEventID
	}

	// Normalize nil payload to "{}" so callers don't need to specify it for
	// metadata-only events. The events.payload column is NOT NULL.
	body := []byte(payload)
	if len(body) == 0 {
		body = []byte("{}")
	}

	var status, eventID, errMsg *string
	err := b.pool.QueryRow(ctx,
		`SELECT status, event_id, error_msg FROM publish_event($1, $2, $3, $4, $5)`,
		b.config.Credential, eventType, body, parentArg, approvalArg,
	).Scan(&status, &eventID, &errMsg)
	if err != nil {
		return "", fmt.Errorf("bus: publish: %w", err)
	}

	if status == nil {
		return "", errors.New("bus: publish returned null status")
	}

	switch *status {
	case spStatusOK:
		if eventID == nil {
			return "", errors.New("bus: ok status but nil event_id")
		}
		return *eventID, nil
	case spStatusRejectedUnauthenticated:
		return "", ErrUnauthenticated
	case spStatusRejectedNamespace:
		return "", ErrNamespaceViolation
	case spStatusRejectedConstitution:
		if errMsg != nil {
			return "", fmt.Errorf("%w: %s", ErrConstitutionRejected, *errMsg)
		}
		return "", ErrConstitutionRejected
	case spStatusRejectedCausality:
		return "", ErrCausalityLoop
	case spStatusRejectedNoConstitution:
		return "", ErrNoConstitution
	default:
		if errMsg != nil {
			return "", fmt.Errorf("bus: publish rejected with status=%s: %s", *status, *errMsg)
		}
		return "", fmt.Errorf("bus: publish rejected with status=%s", *status)
	}
}

// Subscribe registers a subscription and starts a background delivery loop.
// The caller's ctx is used only for the initial register_subscription call —
// the delivery loop uses an independent context so request-scoped
// cancellations do not kill the subscription.
func (b *Bus) Subscribe(ctx context.Context, key, pattern string, handler SubscriptionHandler) (*Subscription, error) {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil, ErrConnectionLost
	}
	b.mu.Unlock()

	if _, err := b.pool.Exec(ctx,
		`SELECT register_subscription($1, $2, $3)`,
		b.config.Credential, key, pattern,
	); err != nil {
		return nil, fmt.Errorf("bus: register_subscription: %w", err)
	}

	subCtx, cancel := context.WithCancel(context.Background())
	sub := &Subscription{
		bus:     b,
		key:     key,
		pattern: parsePattern(pattern),
		handler: handler,
		ctx:     subCtx,
		cancel:  cancel,
		done:    make(chan struct{}),
	}

	// Append under lock before spawning so Close() observes this sub.
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		cancel()
		close(sub.done)
		return nil, ErrConnectionLost
	}
	b.subs = append(b.subs, sub)
	b.mu.Unlock()

	go sub.run()

	return sub, nil
}

// Subscription is an active subscription. Close stops delivery.
type Subscription struct {
	bus     *Bus
	key     string
	pattern parsedPattern
	handler SubscriptionHandler

	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}
}

// Close stops the subscription and waits for the background goroutine to exit.
func (s *Subscription) Close() {
	s.cancel()
	<-s.done
}

// run is the background delivery loop. Replays missed events, then streams
// new ones via a dedicated LISTEN connection. Uses a fresh pgx.Conn so a
// long-held LISTEN does not starve the shared pool.
func (s *Subscription) run() {
	defer close(s.done)

	if err := s.replayMissed(); err != nil {
		s.bus.logger.Error("subscription: replay failed", "key", s.key, "error", err)
	}

	// Dedicated connection for LISTEN so we don't pin a pool slot.
	listenConn, err := pgx.Connect(s.ctx, s.bus.config.PostgresURL)
	if err != nil {
		s.bus.logger.Error("subscription: connect listen", "key", s.key, "error", err)
		return
	}
	defer func() { _ = listenConn.Close(context.Background()) }()

	if _, err := listenConn.Exec(s.ctx, "LISTEN event_bus"); err != nil {
		s.bus.logger.Error("subscription: LISTEN failed", "key", s.key, "error", err)
		return
	}

	for {
		notif, err := listenConn.WaitForNotification(s.ctx)
		if err != nil {
			if s.ctx.Err() != nil {
				return
			}
			s.bus.logger.Error("subscription: wait for notification", "key", s.key, "error", err)
			return
		}

		eventID, eventType := parseNotifyPayload(notif.Payload)
		// Server-side filter avoids a DB round-trip for mismatched events.
		if eventType != "" && !s.pattern.matches(eventType) {
			continue
		}
		if err := s.deliverByID(eventID); err != nil {
			s.bus.logger.Error("subscription: deliver failed", "key", s.key, "event_id", eventID, "error", err)
		}
	}
}

// parseNotifyPayload splits "<id>:<event_type>". Older SP versions may emit
// just the ID; in that case the caller does a fetch-then-filter fallback.
func parseNotifyPayload(payload string) (id, eventType string) {
	if idx := strings.IndexByte(payload, ':'); idx >= 0 {
		return payload[:idx], payload[idx+1:]
	}
	return payload, ""
}

// replayMissed reads events after the subscription's last consumed event and
// delivers them in order.
func (s *Subscription) replayMissed() error {
	ctx := s.ctx
	var lastAt *time.Time
	err := s.bus.pool.QueryRow(ctx, `
		SELECT e.published_at
		FROM event_subscriptions es
		LEFT JOIN events e ON e.id = es.last_consumed_event_id
		WHERE es.department_id = $1 AND es.subscription_key = $2`,
		s.bus.config.Department, s.key,
	).Scan(&lastAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("replay: lookup offset: %w", err)
	}

	rows, err := s.queryEvents(ctx, lastAt)
	if err != nil {
		return fmt.Errorf("replay: query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var e Event
		var parent *string
		if err := rows.Scan(&e.ID, &e.Type, &e.Source, &e.Payload, &parent, &e.PublishedAt); err != nil {
			return fmt.Errorf("replay: scan: %w", err)
		}
		if parent != nil {
			e.ParentID = *parent
		}
		if err := s.deliverEvent(e); err != nil {
			s.bus.logger.Error("replay: handler error", "event_id", e.ID, "error", err)
		}
	}
	return rows.Err()
}

// deliverByID fetches an event by ID and delivers it if the pattern matches.
// Pattern mismatch returns nil (skipped, not an error).
func (s *Subscription) deliverByID(eventID string) error {
	row := s.bus.pool.QueryRow(s.ctx,
		`SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
		   FROM events WHERE id = $1`, eventID)
	var e Event
	var parent *string
	if err := row.Scan(&e.ID, &e.Type, &e.Source, &e.Payload, &parent, &e.PublishedAt); err != nil {
		return fmt.Errorf("fetch event %s: %w", eventID, err)
	}
	if parent != nil {
		e.ParentID = *parent
	}
	if !s.pattern.matches(e.Type) {
		return nil
	}
	return s.deliverEvent(e)
}

// deliverEvent invokes the handler and, on success, acks the event. The ack
// uses a fresh context with a short timeout so shutdown-induced cancellation
// doesn't lose acks for successfully handled events.
func (s *Subscription) deliverEvent(e Event) error {
	if err := s.handler(s.ctx, e); err != nil {
		return err
	}
	ackCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := s.bus.pool.Exec(ackCtx,
		`SELECT ack_event($1, $2, $3)`,
		s.bus.config.Credential, s.key, e.ID)
	return err
}

// queryEvents returns matching events newer than after (may be nil).
func (s *Subscription) queryEvents(ctx context.Context, after *time.Time) (pgx.Rows, error) {
	like := s.pattern.toLike()
	if after == nil {
		return s.bus.pool.Query(ctx,
			`SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
			   FROM events WHERE event_type LIKE $1 ORDER BY published_at ASC`,
			like)
	}
	return s.bus.pool.Query(ctx,
		`SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
		   FROM events WHERE event_type LIKE $1 AND published_at > $2 ORDER BY published_at ASC`,
		like, *after)
}
