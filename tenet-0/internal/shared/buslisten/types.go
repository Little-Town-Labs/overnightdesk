// Package buslisten is a Postgres LISTEN/NOTIFY helper specialised for the
// Feature 49 `event_bus` channel.
package buslisten

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// Handler is invoked for every NOTIFY payload received on the listened
// channel. A non-nil return is logged but does not stop the loop.
type Handler func(payload string) error

// ConnAcquirer abstracts the dial step so unit tests can substitute a
// fake connection.
type ConnAcquirer interface {
	Acquire(ctx context.Context) (ListenConn, error)
}

// ListenConn is the minimal subset of *pgx.Conn that Subscribe drives.
type ListenConn interface {
	Exec(ctx context.Context, sql string, args ...any) error
	WaitForNotification(ctx context.Context) (channel string, payload string, err error)
	Close(ctx context.Context) error
}

// Listener pumps Postgres NOTIFY messages into a Handler with reconnect.
type Listener struct {
	cfg      Config
	acquirer ConnAcquirer

	mu     sync.Mutex
	closed bool
	cancel context.CancelFunc
}

// Config controls reconnect cadence. Zero values use sensible defaults
// (initial 1s, ceiling 30s, multiplier 2).
type Config struct {
	DSN     string
	Channel string
	Logger  *slog.Logger

	InitialBackoff time.Duration // default 1s
	MaxBackoff     time.Duration // default 30s

	// Acquirer dials the connection used for LISTEN. Production wiring
	// supplies a pgx-backed adapter (kept in cmd/* so this package stays
	// fully unit-testable). Tests inject a fake.
	Acquirer ConnAcquirer

	// acquirer is the lowercase test seam preserved for pre-existing tests.
	acquirer ConnAcquirer
}

// New constructs a Listener but does not connect — Subscribe drives the
// first dial.
func New(cfg Config) (*Listener, error) {
	if cfg.Channel == "" {
		return nil, errors.New("buslisten.New: Channel must not be empty")
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	if cfg.InitialBackoff <= 0 {
		cfg.InitialBackoff = time.Second
	}
	if cfg.MaxBackoff <= 0 {
		cfg.MaxBackoff = 30 * time.Second
	}
	acq := cfg.acquirer
	if acq == nil {
		acq = cfg.Acquirer
	}
	if acq == nil {
		return nil, errors.New("buslisten.New: Acquirer is required")
	}
	return &Listener{cfg: cfg, acquirer: acq}, nil
}

// Subscribe starts the dispatch loop and blocks until ctx is cancelled or
// Close is called.
func (l *Listener) Subscribe(ctx context.Context, h Handler) error {
	ctx, cancel := context.WithCancel(ctx)
	l.mu.Lock()
	l.cancel = cancel
	l.mu.Unlock()
	defer cancel()

	attempt := 0
	for {
		if err := ctx.Err(); err != nil {
			return nil
		}

		conn, err := l.acquirer.Acquire(ctx)
		if err != nil {
			attempt++
			l.cfg.Logger.Warn("buslisten: acquire failed", "err", err, "attempt", attempt)
			if !sleepCtx(ctx, nextBackoff(l.cfg, attempt)) {
				return nil
			}
			continue
		}

		// LISTEN. Channel name is not parameterizable in pg's protocol;
		// quote with double quotes to defend against weird identifiers.
		listenSQL := fmt.Sprintf(`LISTEN "%s"`, l.cfg.Channel)
		if err := conn.Exec(ctx, listenSQL); err != nil {
			l.cfg.Logger.Warn("buslisten: LISTEN failed", "err", err)
			_ = conn.Close(context.Background())
			attempt++
			if !sleepCtx(ctx, nextBackoff(l.cfg, attempt)) {
				return nil
			}
			continue
		}

		// Successful connect — reset backoff.
		attempt = 0

		// Pump until the conn errors out.
		loopErr := l.pump(ctx, conn, h)
		_ = conn.Close(context.Background())

		if ctx.Err() != nil {
			return nil
		}
		// If pump returned a non-context error, reconnect with backoff.
		if loopErr != nil && !errors.Is(loopErr, context.Canceled) && !errors.Is(loopErr, context.DeadlineExceeded) {
			attempt++
			l.cfg.Logger.Warn("buslisten: connection dropped", "err", loopErr, "attempt", attempt)
			if !sleepCtx(ctx, nextBackoff(l.cfg, attempt)) {
				return nil
			}
			continue
		}
		return nil
	}
}

func (l *Listener) pump(ctx context.Context, conn ListenConn, h Handler) error {
	for {
		_, payload, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		if hErr := h(payload); hErr != nil {
			l.cfg.Logger.Warn("buslisten: handler error", "err", hErr)
		}
	}
}

// Close stops Subscribe and releases the underlying connection.
func (l *Listener) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.closed = true
	if l.cancel != nil {
		l.cancel()
	}
	return nil
}

// sleepCtx sleeps for d unless ctx is cancelled first. Returns false if
// ctx was cancelled (caller should exit the reconnect loop).
func sleepCtx(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		return ctx.Err() == nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

// nextBackoff returns the next sleep interval given the current attempt
// (1-indexed). Pure function. Caps at cfg.MaxBackoff.
func nextBackoff(cfg Config, attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	initial := cfg.InitialBackoff
	if initial <= 0 {
		initial = time.Second
	}
	maxB := cfg.MaxBackoff
	if maxB <= 0 {
		maxB = 30 * time.Second
	}
	// Exponential: initial * 2^(attempt-1).
	d := initial
	for i := 1; i < attempt; i++ {
		d *= 2
		if d >= maxB {
			return maxB
		}
	}
	if d > maxB {
		return maxB
	}
	return d
}
